import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  enforceQuota,
  type RequestWithSubscription,
} from '../middleware/quotaEnforcement.js';
import { prisma } from '../utils/prisma.js';
import { recordUsage, getSubscriptionInfo } from '../services/subscriptionService.js';
import {
  enhancePromptInThreadStream,
  getPromptTierFromSubscription,
  type ThreadTurnContext,
} from '../services/deepseekService.js';
import {
  ensureMaxModeAvailable,
  getMaxModeQuota,
  recordMaxModeUsage,
} from '../services/maxModeQuotaService.js';
import type { PromptImageAttachment } from '../services/imageAnalysisService.js';
import { supportsThreadTurnImageAttachmentColumn } from '../services/schemaCompatibilityService.js';

export const threadRouter = Router();

const imageAttachmentSchema = z.object({
  dataUrl: z.string().startsWith('data:image/').max(3_000_000),
  mimeType: z.string().regex(/^image\/(jpeg|jpg|png|webp|heic|heif)$/i),
  width: z.number().int().min(1).max(8_192),
  height: z.number().int().min(1).max(8_192),
  analysis: z.string().max(1_500).optional(),
});

function validatePromptOrImage(
  value: { prompt?: string; imageAttachment?: unknown },
  ctx: z.RefinementCtx
) {
  if ((value.prompt?.trim().length ?? 0) > 0 || value.imageAttachment) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Prompt text or an uploaded image is required.',
    path: ['prompt'],
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

function fromImageAttachmentJson(value: Prisma.JsonValue | null): PromptImageAttachment | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const parsed = imageAttachmentSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function threadTurnSelect(includeImageAttachment: boolean) {
  return {
    id: true,
    threadId: true,
    turnIndex: true,
    originalPrompt: true,
    enhancedPrompt: true,
    ...(includeImageAttachment ? { imageAttachment: true } : {}),
    model: true,
    inputTokens: true,
    outputTokens: true,
    totalTokens: true,
    processingMs: true,
    createdAt: true,
  } satisfies Prisma.ThreadTurnSelect;
}

// All thread routes require authentication
threadRouter.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createThreadSchema = z.object({
  prompt: z.string().max(100000).default(''),
  title: z.string().max(200).optional(),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
  subModality: z.string().max(50).optional(),
  mode: z.enum(['standard', 'max']).default('standard'),
  customInstructions: z.string().max(2000).optional(),
  imageAttachment: imageAttachmentSchema.optional(),
  previousTurns: z.array(
    z.object({
      originalPrompt: z.string().max(100000).default(''),
      enhancedPrompt: z.string().min(1).max(500000),
      model: z.string().max(100).optional(),
      totalTokens: z.number().int().min(0).optional(),
      processingMs: z.number().int().min(0).optional(),
      imageAttachment: imageAttachmentSchema.optional(),
    })
  ).max(20).default([]),
}).superRefine(validatePromptOrImage);

const addTurnSchema = z.object({
  prompt: z.string().max(100000).default(''),
  subModality: z.string().max(50).optional(),
  mode: z.enum(['standard', 'max']).default('standard'),
  customInstructions: z.string().max(2000).optional(),
  imageAttachment: imageAttachmentSchema.optional(),
}).superRefine(validatePromptOrImage);

const updateThreadSchema = z.object({
  title: z.string().max(200).optional(),
  isArchived: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  archived: z.enum(['true', 'false']).optional(),
});

function buildSubscriptionPayload(
  subscription: RequestWithSubscription['subscription'] | undefined,
  maxModeQuota: Awaited<ReturnType<typeof getMaxModeQuota>>
) {
  if (!subscription) return undefined;

  return {
    tier: subscription.tier,
    promptQuality: subscription.promptQuality,
    dailyPromptsUsed: subscription.dailyPromptsUsed + 1,
    dailyPromptsLimit: subscription.dailyPromptsLimit,
    maxModeUsedToday: maxModeQuota.usedToday,
    maxModeDailyLimit: maxModeQuota.dailyLimit,
    maxModeRemaining: maxModeQuota.isUnlimited ? -1 : maxModeQuota.remaining,
  };
}

// ============================================================================
// CREATE THREAD (first turn, streams SSE)
// ============================================================================

threadRouter.post(
  '/',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = createThreadSchema.parse(req.body);
      const supportsImageAttachment = await supportsThreadTurnImageAttachmentColumn();

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Get subscription info
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);
      const maxTokens = subscriptionInfo.features.maxTokensPerPrompt;
      const maxModeQuotaBeforeUse = data.mode === 'max'
        ? await ensureMaxModeAvailable(req.user.id, subscriptionInfo.tier)
        : await getMaxModeQuota(req.user.id, subscriptionInfo.tier);

      // Auto-generate title from first prompt (truncated)
      const autoTitle = data.title
        || (data.prompt.trim()
          ? data.prompt.substring(0, 80) + (data.prompt.length > 80 ? '...' : '')
          : 'Image to Video Prompt');

      // Create thread
      const thread = await prisma.thread.create({
        data: {
          userId: req.user.id,
          title: autoTitle,
          modality: data.modality,
        },
      });

      if (data.previousTurns.length > 0) {
        await prisma.threadTurn.createMany({
          data: data.previousTurns.map((turn, index) => ({
              threadId: thread.id,
              turnIndex: index,
              originalPrompt: turn.originalPrompt,
              enhancedPrompt: turn.enhancedPrompt,
              ...(supportsImageAttachment ? { imageAttachment: toImageAttachmentJson(turn.imageAttachment) } : {}),
              model: turn.model ?? 'guest-preview',
              inputTokens: 0,
              outputTokens: 0,
            totalTokens: turn.totalTokens ?? 0,
            processingMs: turn.processingMs ?? 0,
          })),
        });
      }

      await enhancePromptInThreadStream(
        {
          prompt: data.prompt,
          tier: promptTier,
          maxTokens,
          mode: data.mode,
          modality: data.modality,
          subModality: data.subModality,
          customInstructions: data.customInstructions,
          previousTurns: data.previousTurns,
          imageAttachment: data.imageAttachment,
        },
        {
          onToken: (token) => {
            res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
          },
          onComplete: async (result) => {
            // Save the turn
            const turn = await prisma.threadTurn.create({
              data: {
                threadId: thread.id,
                turnIndex: data.previousTurns.length,
                originalPrompt: data.prompt,
                enhancedPrompt: result.enhancedPrompt,
                ...(supportsImageAttachment ? { imageAttachment: toImageAttachmentJson(result.imageAttachment) } : {}),
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                processingMs: result.processingMs,
              },
            });

            // Update user stats + usage in parallel
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
                threadId: thread.id,
                turnId: turn.id,
                turnIndex: data.previousTurns.length,
                usage: {
                  inputTokens: result.inputTokens,
                  outputTokens: result.outputTokens,
                  totalTokens: result.totalTokens,
                  processingMs: result.processingMs,
                },
                subscription: buildSubscriptionPayload(req.subscription, maxModeQuota),
                imageAttachment: result.imageAttachment,
              })}\n\n`
            );
            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: (error) => {
            console.error('Thread create stream error:', error);
            // Clean up the empty thread on error
            prisma.thread.delete({ where: { id: thread.id } }).catch(() => {});
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
          },
        }
      );
    } catch (error) {
      console.error('Create thread error:', error);
      if (error instanceof z.ZodError) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid request data' })}\n\n`);
      } else if (error instanceof Error && error.message === 'FREE_MAX_MODE_LIMIT_REACHED') {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Free users can use MAX mode up to 5 times per day.' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to create thread' })}\n\n`);
      }
      res.end();
    }
  }
);

// ============================================================================
// ADD TURN TO THREAD (streams SSE)
// ============================================================================

threadRouter.post(
  '/:id/turns/stream',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const threadId = req.params.id as string;
      const data = addTurnSchema.parse(req.body);
      const supportsImageAttachment = await supportsThreadTurnImageAttachmentColumn();

      // Verify thread ownership and load existing turns
      const thread = await prisma.thread.findFirst({
        where: { id: threadId, userId: req.user.id },
        include: {
          turns: {
            orderBy: { turnIndex: 'asc' },
            select: {
              originalPrompt: true,
              enhancedPrompt: true,
              ...(supportsImageAttachment ? { imageAttachment: true } : {}),
            },
          },
        },
      });

      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Get subscription info
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);
      const maxTokens = subscriptionInfo.features.maxTokensPerPrompt;
      const maxModeQuotaBeforeUse = data.mode === 'max'
        ? await ensureMaxModeAvailable(req.user.id, subscriptionInfo.tier)
        : await getMaxModeQuota(req.user.id, subscriptionInfo.tier);

      // Build conversation history from previous turns
      const previousTurns: ThreadTurnContext[] = thread.turns.map((t) => ({
        originalPrompt: t.originalPrompt,
        enhancedPrompt: t.enhancedPrompt,
        imageAttachment: 'imageAttachment' in t ? fromImageAttachmentJson(t.imageAttachment as Prisma.JsonValue | null) : undefined,
      }));

      const nextTurnIndex = thread.turns.length;

      await enhancePromptInThreadStream(
        {
          prompt: data.prompt,
          tier: promptTier,
          maxTokens,
          mode: data.mode,
          modality: thread.modality as 'text' | 'image' | 'video' | 'audio' | 'code' | '3d',
          subModality: data.subModality,
          customInstructions: data.customInstructions,
          previousTurns,
          imageAttachment: data.imageAttachment,
        },
        {
          onToken: (token) => {
            res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
          },
          onComplete: async (result) => {
            // Save the turn
            const turn = await prisma.threadTurn.create({
              data: {
                threadId: thread.id,
                turnIndex: nextTurnIndex,
                originalPrompt: data.prompt,
                enhancedPrompt: result.enhancedPrompt,
                ...(supportsImageAttachment ? { imageAttachment: toImageAttachmentJson(result.imageAttachment) } : {}),
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                processingMs: result.processingMs,
              },
            });

            // Update thread timestamp + user stats in parallel
            await Promise.all([
              prisma.thread.update({
                where: { id: thread.id },
                data: { updatedAt: new Date() },
              }),
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
                threadId: thread.id,
                turnId: turn.id,
                turnIndex: nextTurnIndex,
                usage: {
                  inputTokens: result.inputTokens,
                  outputTokens: result.outputTokens,
                  totalTokens: result.totalTokens,
                  processingMs: result.processingMs,
                },
                subscription: buildSubscriptionPayload(req.subscription, maxModeQuota),
                imageAttachment: result.imageAttachment,
              })}\n\n`
            );
            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: (error) => {
            console.error('Thread turn stream error:', error);
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
          },
        }
      );
    } catch (error) {
      console.error('Add turn error:', error);
      if (error instanceof z.ZodError) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid request data' })}\n\n`);
      } else if (error instanceof Error && error.message === 'FREE_MAX_MODE_LIMIT_REACHED') {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Free users can use MAX mode up to 5 times per day.' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to add turn' })}\n\n`);
      }
      res.end();
    }
  }
);

// ============================================================================
// LIST THREADS (paginated)
// ============================================================================

threadRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const query = listQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: Record<string, unknown> = {
      userId: req.user.id,
    };

    if (query.archived !== undefined) {
      where['isArchived'] = query.archived === 'true';
    } else {
      where['isArchived'] = false;
    }

    const [threads, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          turns: {
            orderBy: { turnIndex: 'desc' },
            take: 1,
            select: {
              enhancedPrompt: true,
              turnIndex: true,
            },
          },
          _count: {
            select: { turns: true },
          },
        },
      }),
      prisma.thread.count({ where }),
    ]);

    // Map to response format with preview from latest turn
    const threadList = threads.map((t) => ({
      id: t.id,
      title: t.title,
      modality: t.modality,
      isArchived: t.isArchived,
      turnCount: t._count.turns,
      lastPreview: t.turns[0]?.enhancedPrompt?.substring(0, 120) || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    res.json({
      threads: threadList,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('List threads error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to list threads' });
  }
});

// ============================================================================
// GET THREAD WITH ALL TURNS
// ============================================================================

threadRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const threadId = req.params.id as string;
    const supportsImageAttachment = await supportsThreadTurnImageAttachmentColumn();
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, userId: req.user.id },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
          select: threadTurnSelect(supportsImageAttachment),
        },
      },
    });

    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    res.json({
      thread: {
        id: thread.id,
        title: thread.title,
        modality: thread.modality,
        isArchived: thread.isArchived,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        turns: thread.turns.map((turn) => ({
          ...turn,
          imageAttachment: 'imageAttachment' in turn ? turn.imageAttachment ?? null : null,
        })),
      },
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Failed to get thread' });
  }
});

// ============================================================================
// UPDATE THREAD (title, archive)
// ============================================================================

threadRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = updateThreadSchema.parse(req.body);
    const threadId = req.params.id as string;

    const updateData = {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.isArchived !== undefined ? { isArchived: data.isArchived } : {}),
    };

    const result = await prisma.thread.updateMany({
      where: { id: threadId, userId: req.user.id },
      data: updateData,
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const updated = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        turns: {
          orderBy: { turnIndex: 'desc' },
          take: 1,
          select: {
            enhancedPrompt: true,
          },
        },
        _count: {
          select: { turns: true },
        },
      },
    });

    res.json({
      thread: updated
        ? {
            id: updated.id,
            title: updated.title,
            modality: updated.modality,
            isArchived: updated.isArchived,
            turnCount: updated._count.turns,
            lastPreview: updated.turns[0]?.enhancedPrompt?.substring(0, 120) || null,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Update thread error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update thread' });
  }
});

// ============================================================================
// DELETE THREAD + ALL TURNS
// ============================================================================

threadRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const threadId = req.params.id as string;
    const result = await prisma.thread.deleteMany({
      where: { id: threadId, userId: req.user.id },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete thread error:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});
