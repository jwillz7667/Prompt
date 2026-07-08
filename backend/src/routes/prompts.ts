import { randomBytes } from 'node:crypto';

import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  compareEnhancements,
  CompareValidationError,
  MAX_COMPARE_PROVIDERS,
} from '../services/promptCompareService.js';
import { getAvailableProviders, COMPARE_PROVIDERS } from '../services/providerAdapters.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  enforceQuota,
  recordPromptUsage,
  type RequestWithSubscription,
} from '../middleware/quotaEnforcement.js';
import { prisma } from '../utils/prisma.js';
import { promptLogger } from '../utils/logger.js';
import { recordUsage, getSubscriptionInfo } from '../services/subscriptionService.js';
import {
  enhancePrompt,
  enhancePromptStream,
  enhancePromptInThreadStream,
  getPromptTierFromSubscription,
} from '../services/deepseekService.js';
import { DEEPSEEK_V4_FLASH_MODEL } from '../services/deepseekModels.js';
import {
  ensureMaxModeAvailable,
  ensureModalityAvailable,
  getMaxModeQuota,
  recordMaxModeUsage,
} from '../services/maxModeQuotaService.js';
import {
  ensureGuestQuotaAvailable,
  getGuestQuota,
  recordGuestPromptUsage,
  type GuestQuotaSnapshot,
} from '../services/guestQuotaService.js';
import { resolveGuestIdentity } from '../services/anonymousSessionService.js';
import {
  supportsPromptImageAttachmentColumn,
  resetSchemaCompatibilityCache,
  isMissingColumnError,
  withImageAttachmentReadFallback,
} from '../services/schemaCompatibilityService.js';

export const promptRouter = Router();

const imageAttachmentSchema = z.object({
  dataUrl: z.string().startsWith('data:image/').max(3_000_000),
  mimeType: z.string().regex(/^image\/(jpeg|jpg|png|webp|heic|heif)$/i),
  width: z.number().int().min(1).max(8_192),
  height: z.number().int().min(1).max(8_192),
  analysis: z.string().max(1_500).optional(),
});

function requirePromptOrImage(
  value: { prompt?: string; originalPrompt?: string; imageAttachment?: unknown },
  ctx: z.RefinementCtx
) {
  const prompt = value.prompt ?? value.originalPrompt ?? '';
  if (prompt.trim().length > 0 || value.imageAttachment) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Prompt text or an uploaded image is required.',
    path: value.prompt !== undefined ? ['prompt'] : ['originalPrompt'],
  });
}

function toImageAttachmentJson(
  attachment?: {
    dataUrl: string;
    mimeType: string;
    width: number;
    height: number;
    analysis?: string | null;
  }
): Prisma.InputJsonValue | undefined {
  if (!attachment) {
    return undefined;
  }

  return {
    dataUrl: attachment.dataUrl,
    mimeType: attachment.mimeType,
    width: attachment.width,
    height: attachment.height,
    ...(attachment.analysis ? { analysis: attachment.analysis } : {}),
  } as Prisma.InputJsonValue;
}

function promptSelect(includeImageAttachment: boolean) {
  return {
    id: true,
    originalPrompt: true,
    enhancedPrompt: true,
    model: true,
    modality: true,
    ...(includeImageAttachment ? { imageAttachment: true } : {}),
    totalTokens: true,
    title: true,
    tags: true,
    isFavorite: true,
    isArchived: true,
    version: true,
    rootPromptId: true,
    createdAt: true,
  } satisfies Prisma.PromptSelect;
}

// Version chains: a prompt's chain root is (rootPromptId ?? id). Creating a
// prompt with parentPromptId places it at the head of the parent's chain.
// Ownership of the parent is enforced here; a forged parent id from another
// user degrades to a 404-equivalent error rather than cross-tenant linkage.
async function resolveVersionFields(
  userId: string,
  parentPromptId?: string
): Promise<{ version: number; rootPromptId: string } | Record<string, never>> {
  if (!parentPromptId) {
    return {};
  }

  const parent = await prisma.prompt.findFirst({
    where: { id: parentPromptId, userId },
    select: { id: true, rootPromptId: true },
  });
  if (!parent) {
    throw createHttpError(404, 'Parent prompt not found');
  }

  const rootPromptId = parent.rootPromptId ?? parent.id;
  const head = await prisma.prompt.aggregate({
    where: { OR: [{ id: rootPromptId }, { rootPromptId }] },
    _max: { version: true },
  });

  return { version: (head._max.version ?? 1) + 1, rootPromptId };
}

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

function createHttpError(statusCode: number, message: string): HttpError {
  return new HttpError(statusCode, message);
}

// Validation schemas
const createPromptSchema = z.object({
  originalPrompt: z.string().max(100000).default(''),
  enhancedPrompt: z.string().min(1).max(500000),
  model: z.string().default(DEEPSEEK_V4_FLASH_MODEL),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.preprocess(
    (value) => {
      if (typeof value === 'number' && value < 1) {
        return undefined;
      }
      return value;
    },
    z.number().int().min(1).max(100000).default(8192)
  ),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  processingMs: z.number().int().min(0).default(0),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
  imageAttachment: imageAttachmentSchema.optional(),
  title: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  parentPromptId: z.string().cuid().optional(),
}).superRefine(requirePromptOrImage);

const updatePromptSchema = z.object({
  title: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  favorite: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const enhancePromptSchemaBase = z.object({
  prompt: z.string().max(100000).default(''),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.preprocess(
    (value) => {
      if (typeof value === 'number' && value < 1) {
        return undefined;
      }
      return value;
    },
    z.number().int().min(1).max(100000).optional()
  ),
  mode: z.enum(['standard', 'max']).default('standard'),
  conversationMode: z.enum(['optimize', 'chat']).default('optimize'),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
  customInstructions: z.string().max(2000).optional(),
  subModality: z.string().optional(),
  imageAttachment: imageAttachmentSchema.optional(),
  parentPromptId: z.string().cuid().optional(),
});

const enhancePromptSchema = enhancePromptSchemaBase.superRefine(requirePromptOrImage);

const guestEnhancePromptSchema = enhancePromptSchemaBase.extend({
  previousTurns: z.array(
    z.object({
      originalPrompt: z.string().max(100000).default(''),
      enhancedPrompt: z.string().min(1).max(500000),
      imageAttachment: imageAttachmentSchema.optional(),
    })
  ).max(20).default([]),
}).superRefine(requirePromptOrImage);

function writeSSEEvent(
  res: Response,
  payload: Record<string, unknown>
) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function beginSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function guestQuotaMessage(
  mode: 'standard' | 'max',
  quota: GuestQuotaSnapshot
): string {
  if (quota.standardRemaining === 0 && quota.maxRemaining === 0) {
    return 'Sign in to keep optimizing prompts and unlock your 7-day Premium trial.';
  }

  if (mode === 'standard') {
    return `Your 5 guest Standard prompts are used. You still have ${quota.maxRemaining} MAX prompt left.`;
  }

  return `Your guest MAX prompt is already used. You still have ${quota.standardRemaining} Standard prompts left.`;
}

promptRouter.post(
  '/guest/enhance/stream',
  async (req, res): Promise<void> => {
    beginSSE(res);

    try {
      const guestIdentity = resolveGuestIdentity(req);
      const data = guestEnhancePromptSchema.parse(req.body);
      const maxTokens = Math.min(data.maxTokens ?? 4096, data.mode === 'max' ? 6144 : 4096);

      await ensureGuestQuotaAvailable(guestIdentity.quotaKey, data.mode);
      const reservedQuota = await recordGuestPromptUsage(guestIdentity.quotaKey, data.mode);

      await enhancePromptInThreadStream(
        {
          prompt: data.prompt,
          tier: 'basic',
          maxTokens,
          mode: data.mode,
          conversationMode: data.conversationMode,
          modality: data.modality,
          subModality: data.subModality,
          customInstructions: data.customInstructions,
          previousTurns: data.previousTurns,
          imageAttachment: data.imageAttachment,
        },
        {
          onToken: (token) => {
            writeSSEEvent(res, { type: 'token', content: token });
          },
          onComplete: async (result) => {
            writeSSEEvent(res, {
              type: 'complete',
              usage: {
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                processingMs: result.processingMs,
              },
              imageAttachment: result.imageAttachment,
              guestQuota: reservedQuota,
              guestSession: guestIdentity.sessionToken,
            });
            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: async (error) => {
            const quota = await getGuestQuota(guestIdentity.quotaKey);
            writeSSEEvent(res, {
              type: 'error',
              message: error.message,
              guestQuota: quota,
              guestSession: guestIdentity.sessionToken,
            });
            res.end();
          },
        }
      );
    } catch (error) {
      let quota: GuestQuotaSnapshot | null = null;
      let guestSession: string | undefined;
      try {
        const guestIdentity = resolveGuestIdentity(req);
        quota = await getGuestQuota(guestIdentity.quotaKey);
        guestSession = guestIdentity.sessionToken;
      } catch {
        quota = null;
      }

      if (error instanceof z.ZodError) {
        writeSSEEvent(res, {
          type: 'error',
          message: 'Invalid request data.',
          guestQuota: quota,
          guestSession,
        });
        res.end();
        return;
      }

      if (error instanceof Error &&
        (error.message === 'GUEST_STANDARD_LIMIT_REACHED' || error.message === 'GUEST_MAX_LIMIT_REACHED')) {
        writeSSEEvent(res, {
          type: 'error',
          message: quota
            ? guestQuotaMessage(error.message === 'GUEST_STANDARD_LIMIT_REACHED' ? 'standard' : 'max', quota)
            : 'Guest prompt limit reached. Sign in to keep optimizing prompts.',
          guestQuota: quota,
          guestSession,
        });
        res.end();
        return;
      }

      writeSSEEvent(res, {
        type: 'error',
        message: 'Failed to enhance prompt',
        guestQuota: quota,
        guestSession,
      });
      res.end();
    }
  }
);

// All authenticated prompt routes require a user session
promptRouter.use(authenticate);

function buildSubscriptionPayload(
  subscription: RequestWithSubscription['subscription'] | undefined,
  maxModeQuota: Awaited<ReturnType<typeof getMaxModeQuota>>,
  incrementDailyPromptUsage = false
) {
  if (!subscription) return undefined;

  return {
    tier: subscription.tier,
    promptQuality: subscription.promptQuality,
    dailyPromptsUsed: subscription.dailyPromptsUsed + (incrementDailyPromptUsage ? 1 : 0),
    dailyPromptsLimit: subscription.dailyPromptsLimit,
    maxModeUsedToday: maxModeQuota.usedToday,
    maxModeDailyLimit: maxModeQuota.dailyLimit,
    maxModeRemaining: maxModeQuota.isUnlimited ? -1 : maxModeQuota.remaining,
  };
}

// ============================================================================
// ENHANCE PROMPT (AI enhancement with quota enforcement)
// ============================================================================

promptRouter.post(
  '/enhance',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = enhancePromptSchema.parse(req.body);
      const supportsImageAttachment = await supportsPromptImageAttachmentColumn();

      // Get user's subscription to determine prompt quality tier
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);
      // Enforce subscription gates: MAX mode and non-text modalities require a subscription
      ensureModalityAvailable(data.modality, subscriptionInfo.tier);
      const maxModeQuotaBeforeUse = data.mode === 'max'
        ? await ensureMaxModeAvailable(req.user.id, subscriptionInfo.tier)
        : await getMaxModeQuota(req.user.id, subscriptionInfo.tier);

      // Apply tier-based max tokens limit
      const maxTokens = Math.min(
        data.maxTokens || subscriptionInfo.features.maxTokensPerPrompt,
        subscriptionInfo.features.maxTokensPerPrompt
      );

      // Enhance the prompt using DeepSeek
      const result = await enhancePrompt({
        prompt: data.prompt,
        tier: promptTier,
        model: data.model,
        temperature: data.temperature,
        maxTokens,
        mode: data.mode,
        conversationMode: data.conversationMode,
        modality: data.modality,
        customInstructions: data.customInstructions,
        subModality: data.subModality,
        imageAttachment: data.imageAttachment,
      });

      // Save the prompt to the database.
      // `select` constrains the RETURNING clause; without it Prisma asks the DB
      // to return every column declared in the schema, which fails on legacy
      // databases that pre-date the imageAttachment migration.
      const versionFields = await resolveVersionFields(req.user.id, data.parentPromptId);
      const savedPrompt = await prisma.prompt.create({
        data: {
          userId: req.user.id,
          originalPrompt: data.prompt,
          enhancedPrompt: result.enhancedPrompt,
          model: result.model,
          temperature: data.temperature || 0.7,
          maxTokens,
          modality: data.modality,
          ...(supportsImageAttachment ? { imageAttachment: toImageAttachmentJson(result.imageAttachment) } : {}),
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          processingMs: result.processingMs,
          ...versionFields,
        },
        select: promptSelect(supportsImageAttachment),
      });

      // Update user stats
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          promptCount: { increment: 1 },
          tokenUsage: { increment: BigInt(result.totalTokens) },
        },
      });

      // Update daily usage record
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.usageRecord.upsert({
        where: {
          userId_date: {
            userId: req.user.id,
            date: today,
          },
        },
        update: {
          promptCount: { increment: 1 },
          tokenCount: { increment: BigInt(result.totalTokens) },
        },
        create: {
          userId: req.user.id,
          date: today,
          promptCount: 1,
          tokenCount: BigInt(result.totalTokens),
        },
      });

      // Record usage for quota tracking
      await recordUsage(req.user.id);
      const maxModeQuota = data.mode === 'max'
        ? await recordMaxModeUsage(req.user.id, subscriptionInfo.tier)
        : maxModeQuotaBeforeUse;

      // Return enhanced prompt with subscription info
      res.status(200).json({
        enhancedPrompt: result.enhancedPrompt,
        prompt: {
          ...savedPrompt,
          imageAttachment:
            'imageAttachment' in savedPrompt ? savedPrompt.imageAttachment ?? null : null,
        },
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          processingMs: result.processingMs,
        },
        imageAttachment: result.imageAttachment,
        subscription: buildSubscriptionPayload(req.subscription, maxModeQuota, true),
      });
    } catch (error) {
      promptLogger.error({ err: error }, 'Enhance prompt error');
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      if (error instanceof Error) {
        if (error.message === 'MODALITY_REQUIRES_SUBSCRIPTION') {
          res.status(403).json({
            error: 'Subscription required',
            code: 'MODALITY_REQUIRES_SUBSCRIPTION',
            message: 'Upgrade to Pro or Premium to use image, video, audio, code, and 3D modalities.',
          });
          return;
        }
        if (error.message === 'FREE_MAX_MODE_LIMIT_REACHED') {
          res.status(403).json({
            error: 'Subscription required',
            code: 'MAX_MODE_REQUIRES_SUBSCRIPTION',
            message: 'Upgrade to Pro or Premium to use MAX mode.',
            remainingQuota: 0,
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to enhance prompt' });
    }
  }
);

// ============================================================================
// ENHANCE PROMPT STREAMING (real-time SSE)
// ============================================================================

promptRouter.post(
  '/enhance/stream',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = enhancePromptSchema.parse(req.body);
      const supportsImageAttachment = await supportsPromptImageAttachmentColumn();

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      // Get user's subscription to determine prompt quality tier
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);

      // Enforce subscription gates: MAX mode and non-text modalities require a subscription
      ensureModalityAvailable(data.modality, subscriptionInfo.tier);
      const maxModeQuotaBeforeUse = data.mode === 'max'
        ? await ensureMaxModeAvailable(req.user.id, subscriptionInfo.tier)
        : await getMaxModeQuota(req.user.id, subscriptionInfo.tier);

      const maxTokens = Math.min(
        data.maxTokens || subscriptionInfo.features.maxTokensPerPrompt,
        subscriptionInfo.features.maxTokensPerPrompt
      );

      let savedPromptId: string | null = null;

      await enhancePromptStream(
        {
          prompt: data.prompt,
          tier: promptTier,
          model: data.model,
          temperature: data.temperature,
          maxTokens,
          mode: data.mode,
          conversationMode: data.conversationMode,
          modality: data.modality,
          customInstructions: data.customInstructions,
          subModality: data.subModality,
          imageAttachment: data.imageAttachment,
        },
        {
          onToken: (token) => {
            res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
          },
          onComplete: async (result) => {
            // The model already produced a billable answer. Persistence is
            // best-effort from here: a DB failure (schema drift, transient
            // outage) must never turn a successful enhancement into a client
            // error or a lost token stream. We log loudly and still deliver
            // the result; the client treats a null promptId as "not saved".
            // Charge the daily quota first and on its own. The model call has
            // already happened, so the quota is owed even if persistence fails
            // below — otherwise a DB error would silently hand the user a free
            // enhancement (fail-open).
            try {
              await recordUsage(req.user!.id);
            } catch (usageError) {
              promptLogger.error({ err: usageError, userId: req.user!.id }, 'Failed to record daily usage for prompt');
            }

            let maxModeQuota = maxModeQuotaBeforeUse;
            try {
              // Only the id flows back to the client via the SSE complete
              // event, so a narrow `select` keeps the RETURNING clause off any
              // columns that may not exist on legacy production schemas.
              // Mid-stream there is no way to surface a 404 for a bad parent
              // id (headers are already sent), and failing here would drop the
              // whole enhancement — degrade to saving an unversioned original.
              const versionFields = await resolveVersionFields(req.user!.id, data.parentPromptId)
                .catch(() => ({}));
              const baseData = {
                userId: req.user!.id,
                originalPrompt: data.prompt,
                enhancedPrompt: result.enhancedPrompt,
                model: result.model,
                temperature: data.temperature || 0.7,
                maxTokens,
                modality: data.modality,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                processingMs: result.processingMs,
                ...versionFields,
              };

              let savedPrompt: { id: string };
              try {
                savedPrompt = await prisma.prompt.create({
                  data: {
                    ...baseData,
                    ...(supportsImageAttachment ? { imageAttachment: toImageAttachmentJson(result.imageAttachment) } : {}),
                  },
                  select: { id: true },
                });
              } catch (createError) {
                // Schema drift: the image column was expected but is missing
                // from the live DB. Self-heal the support cache and retry
                // without it so the prompt still persists.
                if (supportsImageAttachment && isMissingColumnError(createError)) {
                  resetSchemaCompatibilityCache();
                  promptLogger.warn(
                    { err: createError, userId: req.user!.id },
                    'imageAttachment column missing; retrying prompt persist without it'
                  );
                  savedPrompt = await prisma.prompt.create({
                    data: baseData,
                    select: { id: true },
                  });
                } else {
                  throw createError;
                }
              }
              savedPromptId = savedPrompt.id;

              // Update user stats in parallel (quota already charged above)
              await Promise.all([
                prisma.user.update({
                  where: { id: req.user!.id },
                  data: {
                    promptCount: { increment: 1 },
                    tokenUsage: { increment: BigInt(result.totalTokens) },
                  },
                }),
                prisma.usageRecord.upsert({
                  where: {
                    userId_date: {
                      userId: req.user!.id,
                      date: new Date(new Date().setHours(0, 0, 0, 0)),
                    },
                  },
                  update: {
                    promptCount: { increment: 1 },
                    tokenCount: { increment: BigInt(result.totalTokens) },
                  },
                  create: {
                    userId: req.user!.id,
                    date: new Date(new Date().setHours(0, 0, 0, 0)),
                    promptCount: 1,
                    tokenCount: BigInt(result.totalTokens),
                  },
                }),
              ]);
              maxModeQuota = data.mode === 'max'
                ? await recordMaxModeUsage(req.user!.id, subscriptionInfo.tier)
                : maxModeQuotaBeforeUse;
            } catch (persistError) {
              promptLogger.error(
                { err: persistError, userId: req.user!.id },
                'Failed to persist enhanced prompt; returning result to client without saving'
              );
            }

            // Send completion event (always — the enhancement succeeded)
            res.write(
              `data: ${JSON.stringify({
                type: 'complete',
                promptId: savedPromptId,
                usage: {
                  inputTokens: result.inputTokens,
                  outputTokens: result.outputTokens,
                  totalTokens: result.totalTokens,
                  processingMs: result.processingMs,
                },
                imageAttachment: result.imageAttachment,
                subscription: buildSubscriptionPayload(req.subscription, maxModeQuota, true),
              })}\n\n`
            );
            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: (error) => {
            promptLogger.error({ err: error }, 'Stream error');
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
          },
        }
      );
    } catch (error) {
      promptLogger.error({ err: error }, 'Stream enhance error');
      if (error instanceof z.ZodError) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid request data' })}\n\n`);
      } else if (error instanceof Error && error.message === 'MODALITY_REQUIRES_SUBSCRIPTION') {
        res.write(`data: ${JSON.stringify({ type: 'error', code: 'MODALITY_REQUIRES_SUBSCRIPTION', message: 'Upgrade to Pro or Premium to use image, video, audio, code, and 3D modalities.' })}\n\n`);
      } else if (error instanceof Error && error.message === 'FREE_MAX_MODE_LIMIT_REACHED') {
        res.write(`data: ${JSON.stringify({ type: 'error', code: 'MAX_MODE_REQUIRES_SUBSCRIPTION', message: 'Upgrade to Pro or Premium to use MAX mode.' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to enhance prompt' })}\n\n`);
      }
      res.end();
    }
  }
);

// ============================================================================
// CREATE PROMPT (with quota enforcement)
// ============================================================================

promptRouter.post(
  '/',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = createPromptSchema.parse(req.body);
      const supportsImageAttachment = await supportsPromptImageAttachmentColumn();
      const versionFields = await resolveVersionFields(req.user.id, data.parentPromptId);

      const prompt = await prisma.prompt.create({
        data: {
          userId: req.user.id,
          originalPrompt: data.originalPrompt,
          enhancedPrompt: data.enhancedPrompt,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          modality: data.modality,
          ...(supportsImageAttachment ? { imageAttachment: toImageAttachmentJson(data.imageAttachment) } : {}),
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          totalTokens: data.totalTokens,
          processingMs: data.processingMs,
          title: data.title,
          tags: data.tags,
          ...versionFields,
        },
        select: promptSelect(supportsImageAttachment),
      });

      // Update user stats
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          promptCount: { increment: 1 },
          tokenUsage: { increment: BigInt(data.totalTokens) },
        },
      });

      // Update daily usage record (for general analytics)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.usageRecord.upsert({
        where: {
          userId_date: {
            userId: req.user.id,
            date: today,
          },
        },
        update: {
          promptCount: { increment: 1 },
          tokenCount: { increment: BigInt(data.totalTokens) },
        },
        create: {
          userId: req.user.id,
          date: today,
          promptCount: 1,
          tokenCount: BigInt(data.totalTokens),
        },
      });

      // Record usage for quota tracking
      await recordUsage(req.user.id);

      // Include subscription info in response for client-side prompt quality selection
      res.status(201).json({
        prompt: {
          ...prompt,
          imageAttachment: supportsImageAttachment ? ('imageAttachment' in prompt ? prompt.imageAttachment ?? null : null) : data.imageAttachment ?? null,
        },
        subscription: req.subscription
          ? {
              tier: req.subscription.tier,
              promptQuality: req.subscription.promptQuality,
              dailyPromptsUsed: req.subscription.dailyPromptsUsed + 1,
              dailyPromptsLimit: req.subscription.dailyPromptsLimit,
            }
          : undefined,
      });
    } catch (error) {
      promptLogger.error({ err: error }, 'Create prompt error');
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to create prompt' });
    }
  }
);

// ============================================================================
// LIST PROMPTS (with pagination, search, filters)
// ============================================================================

promptRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const query = listQuerySchema.parse(req.query);
    const supportsImageAttachment = await supportsPromptImageAttachmentColumn();
    const skip = (query.page - 1) * query.limit;

    // Build where clause
    const where: Record<string, unknown> = {
      userId: req.user.id,
    };

    if (query.favorite !== undefined) {
      where['isFavorite'] = query.favorite === 'true';
    }

    if (query.archived !== undefined) {
      where['isArchived'] = query.archived === 'true';
    } else {
      // By default, don't show archived
      where['isArchived'] = false;
    }

    if (query.search) {
      where['OR'] = [
        { originalPrompt: { contains: query.search, mode: 'insensitive' } },
        { enhancedPrompt: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [prompts, total] = await withImageAttachmentReadFallback(
      supportsImageAttachment,
      (supportsColumn) =>
        Promise.all([
          prisma.prompt.findMany({
            where,
            orderBy: { [query.sortBy]: query.sortOrder },
            skip,
            take: query.limit,
            select: promptSelect(supportsColumn),
          }),
          prisma.prompt.count({ where }),
        ]),
    );

    res.json({
      prompts: prompts.map((prompt) => ({
        ...prompt,
        imageAttachment: 'imageAttachment' in prompt ? prompt.imageAttachment ?? null : null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    promptLogger.error({ err: error }, 'List prompts error');
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

// ============================================================================
// GET SINGLE PROMPT
// ============================================================================

promptRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const promptId = req.params.id as string;
    const userId = req.user.id;
    const supportsImageAttachment = await supportsPromptImageAttachmentColumn();
    const prompt = await withImageAttachmentReadFallback(
      supportsImageAttachment,
      (supportsColumn) =>
        prisma.prompt.findFirst({
          where: {
            id: promptId,
            userId,
          },
          select: promptSelect(supportsColumn),
        }),
    );

    if (!prompt) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    res.json({
      prompt: {
        ...prompt,
        imageAttachment: 'imageAttachment' in prompt ? prompt.imageAttachment ?? null : null,
      },
    });
  } catch (error) {
    promptLogger.error({ err: error }, 'Get prompt error');
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// ============================================================================
// UPDATE PROMPT
// ============================================================================

promptRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = updatePromptSchema.parse(req.body);
    const promptId = req.params.id as string;
    const supportsImageAttachment = await supportsPromptImageAttachmentColumn();

    const prompt = await prisma.prompt.updateMany({
      where: {
        id: promptId,
        userId: req.user.id,
      },
      data,
    });

    if (prompt.count === 0) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    const updated = await prisma.prompt.findUnique({
      where: { id: promptId },
      select: promptSelect(supportsImageAttachment),
    });

    res.json({
      prompt: updated
        ? {
            ...updated,
            imageAttachment: 'imageAttachment' in updated ? updated.imageAttachment ?? null : null,
          }
        : null,
    });
  } catch (error) {
    promptLogger.error({ err: error }, 'Update prompt error');
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// ============================================================================
// DELETE PROMPT
// ============================================================================

promptRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const promptId = req.params.id as string;
    const result = await prisma.prompt.deleteMany({
      where: {
        id: promptId,
        userId: req.user.id,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    promptLogger.error({ err: error }, 'Delete prompt error');
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

promptRouter.post('/bulk/favorite', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { ids, isFavorite } = z
      .object({
        ids: z.array(z.string()).min(1).max(100),
        isFavorite: z.boolean(),
      })
      .parse(req.body);

    await prisma.prompt.updateMany({
      where: {
        id: { in: ids },
        userId: req.user.id,
      },
      data: { isFavorite },
    });

    res.json({ success: true });
  } catch (error) {
    promptLogger.error({ err: error }, 'Bulk favorite error');
    res.status(500).json({ error: 'Failed to update prompts' });
  }
});

promptRouter.post('/bulk/delete', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { ids } = z
      .object({
        ids: z.array(z.string()).min(1).max(100),
      })
      .parse(req.body);

    await prisma.prompt.deleteMany({
      where: {
        id: { in: ids },
        userId: req.user.id,
      },
    });

    res.json({ success: true });
  } catch (error) {
    promptLogger.error({ err: error }, 'Bulk delete error');
    res.status(500).json({ error: 'Failed to delete prompts' });
  }
});

// ============================================================================
// VERSION HISTORY
// ============================================================================

promptRouter.get('/:id/versions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const anchor = await prisma.prompt.findFirst({
      where: { id: req.params['id'] as string, userId: req.user.id },
      select: { id: true, rootPromptId: true },
    });
    if (!anchor) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    const rootPromptId = anchor.rootPromptId ?? anchor.id;
    const versions = await prisma.prompt.findMany({
      where: {
        userId: req.user.id,
        OR: [{ id: rootPromptId }, { rootPromptId }],
      },
      select: {
        id: true,
        version: true,
        title: true,
        originalPrompt: true,
        enhancedPrompt: true,
        model: true,
        modality: true,
        createdAt: true,
      },
      orderBy: { version: 'desc' },
    });

    res.json({ rootPromptId, versions });
  } catch (error) {
    promptLogger.error({ err: error }, 'List prompt versions error');
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Restore = copy an older version's content to a NEW head version. History is
// append-only; nothing is overwritten, so a restore is itself restorable.
promptRouter.post('/:id/restore', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const source = await prisma.prompt.findFirst({
      where: { id: req.params['id'] as string, userId: req.user.id },
    });
    if (!source) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    const versionFields = await resolveVersionFields(req.user.id, source.id);
    const supportsImageAttachment = await supportsPromptImageAttachmentColumn();
    const restored = await prisma.prompt.create({
      data: {
        userId: req.user.id,
        originalPrompt: source.originalPrompt,
        enhancedPrompt: source.enhancedPrompt,
        model: source.model,
        temperature: source.temperature,
        maxTokens: source.maxTokens,
        modality: source.modality,
        inputTokens: source.inputTokens,
        outputTokens: source.outputTokens,
        totalTokens: source.totalTokens,
        processingMs: source.processingMs,
        title: source.title,
        tags: source.tags,
        ...versionFields,
      },
      select: promptSelect(supportsImageAttachment),
    });

    res.status(201).json({ prompt: restored });
  } catch (error) {
    promptLogger.error({ err: error }, 'Restore prompt version error');
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// ============================================================================
// SHARING
// ============================================================================

promptRouter.post('/:id/share', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const prompt = await prisma.prompt.findFirst({
      where: { id: req.params['id'] as string, userId: req.user.id },
      select: { id: true },
    });
    if (!prompt) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    // Reuse an existing active share so repeated taps return a stable URL.
    const existing = await prisma.sharedPrompt.findFirst({
      where: { promptId: prompt.id, isRevoked: false },
      select: { slug: true, createdAt: true, viewCount: true },
    });
    if (existing) {
      res.json({ share: existing });
      return;
    }

    const share = await prisma.sharedPrompt.create({
      data: {
        // 12 bytes -> 16 base64url chars; unguessable capability token.
        slug: randomBytes(12).toString('base64url'),
        promptId: prompt.id,
        userId: req.user.id,
      },
      select: { slug: true, createdAt: true, viewCount: true },
    });

    res.status(201).json({ share });
  } catch (error) {
    promptLogger.error({ err: error }, 'Create share link error');
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

promptRouter.delete('/:id/share', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await prisma.sharedPrompt.updateMany({
      where: {
        promptId: req.params['id'] as string,
        userId: req.user.id,
        isRevoked: false,
      },
      data: { isRevoked: true, revokedAt: new Date() },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'No active share for this prompt' });
      return;
    }

    res.json({ revoked: result.count });
  } catch (error) {
    promptLogger.error({ err: error }, 'Revoke share link error');
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
});

// ============================================================================
// MULTI-PROVIDER COMPARE (PRO/PREMIUM)
// ============================================================================

const compareSchema = z.object({
  prompt: z.string().min(1).max(100000),
  providers: z
    .array(z.enum(COMPARE_PROVIDERS as [string, ...string[]]))
    .min(2)
    .max(MAX_COMPARE_PROVIDERS),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
  tone: z
    .enum(['professional', 'casual', 'academic', 'creative', 'technical', 'friendly'])
    .optional(),
  customInstructions: z.string().max(2000).optional(),
});

promptRouter.get('/compare/providers', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ providers: getAvailableProviders() });
});

promptRouter.post(
  '/compare',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      if (subscriptionInfo.tier === 'FREE') {
        res.status(403).json({
          error: 'Subscription required',
          code: 'COMPARE_REQUIRES_SUBSCRIPTION',
          message: 'Upgrade to Pro or Premium to compare providers side by side.',
        });
        return;
      }

      const data = compareSchema.parse(req.body);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);

      const results = await compareEnhancements({
        prompt: data.prompt,
        providers: data.providers as Parameters<typeof compareEnhancements>[0]['providers'],
        modality: data.modality,
        tone: data.tone,
        tier: promptTier,
        customInstructions: data.customInstructions,
      });

      // One compare call charges one enhancement from the user's quota
      // (enforced above); token accounting still records real upstream usage.
      const totalTokens = results.reduce(
        (sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0),
        0
      );
      await Promise.all([
        recordUsage(req.user.id),
        prisma.user.update({
          where: { id: req.user.id },
          data: { tokenUsage: { increment: BigInt(totalTokens) } },
        }),
      ]);

      res.json({ results });
    } catch (error) {
      promptLogger.error({ err: error }, 'Compare providers error');
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      if (error instanceof CompareValidationError) {
        res.status(422).json({
          error: error.message,
          availableProviders: error.availableProviders,
        });
        return;
      }
      res.status(500).json({ error: 'Failed to compare providers' });
    }
  }
);
