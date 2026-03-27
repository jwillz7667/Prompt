import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
import { supportsPromptImageAttachmentColumn } from '../services/schemaCompatibilityService.js';

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
    createdAt: true,
  } satisfies Prisma.PromptSelect;
}

// Validation schemas
const createPromptSchema = z.object({
  originalPrompt: z.string().max(100000).default(''),
  enhancedPrompt: z.string().min(1).max(500000),
  model: z.string().default('deepseek-reasoner'),
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
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d', 'nsfw']).default('text'),
  imageAttachment: imageAttachmentSchema.optional(),
  title: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
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
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d', 'nsfw']).default('text'),
  customInstructions: z.string().max(2000).optional(),
  subModality: z.string().optional(),
  imageAttachment: imageAttachmentSchema.optional(),
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

    const rawDeviceId = req.header('X-Device-ID')?.trim();
    if (!rawDeviceId) {
      writeSSEEvent(res, {
        type: 'error',
        message: 'Device identifier missing. Please restart the app and try again.',
      });
      res.end();
      return;
    }

    try {
      const data = guestEnhancePromptSchema.parse(req.body);
      const maxTokens = Math.min(data.maxTokens ?? 4096, data.mode === 'max' ? 6144 : 4096);

      await ensureGuestQuotaAvailable(rawDeviceId, data.mode);

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
            const quota = await recordGuestPromptUsage(rawDeviceId, data.mode);

            writeSSEEvent(res, {
              type: 'complete',
              usage: {
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                processingMs: result.processingMs,
              },
              imageAttachment: result.imageAttachment,
              guestQuota: quota,
            });
            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: async (error) => {
            const quota = await getGuestQuota(rawDeviceId);
            writeSSEEvent(res, {
              type: 'error',
              message: error.message,
              guestQuota: quota,
            });
            res.end();
          },
        }
      );
    } catch (error) {
      const quota = await getGuestQuota(rawDeviceId);

      if (error instanceof z.ZodError) {
        writeSSEEvent(res, {
          type: 'error',
          message: 'Invalid request data.',
          guestQuota: quota,
        });
        res.end();
        return;
      }

      if (error instanceof Error &&
        (error.message === 'GUEST_STANDARD_LIMIT_REACHED' || error.message === 'GUEST_MAX_LIMIT_REACHED')) {
        writeSSEEvent(res, {
          type: 'error',
          message: guestQuotaMessage(error.message === 'GUEST_STANDARD_LIMIT_REACHED' ? 'standard' : 'max', quota),
          guestQuota: quota,
        });
        res.end();
        return;
      }

      writeSSEEvent(res, {
        type: 'error',
        message: 'Failed to enhance prompt',
        guestQuota: quota,
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

      // Save the prompt to the database
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
        },
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
        prompt: savedPrompt,
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
            // Save prompt to database
            const savedPrompt = await prisma.prompt.create({
              data: {
                userId: req.user!.id,
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
              },
            });
            savedPromptId = savedPrompt.id;

            // Update user stats in parallel
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
              recordUsage(req.user!.id),
            ]);
            const maxModeQuota = data.mode === 'max'
              ? await recordMaxModeUsage(req.user!.id, subscriptionInfo.tier)
              : maxModeQuotaBeforeUse;

            // Send completion event
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
        },
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

    const [prompts, total] = await Promise.all([
      prisma.prompt.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.limit,
        select: promptSelect(supportsImageAttachment),
      }),
      prisma.prompt.count({ where }),
    ]);

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
    const supportsImageAttachment = await supportsPromptImageAttachmentColumn();
    const prompt = await prisma.prompt.findFirst({
      where: {
        id: promptId,
        userId: req.user.id,
      },
      select: promptSelect(supportsImageAttachment),
    });

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
