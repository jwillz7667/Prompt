import { Router, Response } from 'express';
import { z } from 'zod';
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

export const threadRouter = Router();

// All thread routes require authentication
threadRouter.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createThreadSchema = z.object({
  prompt: z.string().min(1).max(100000),
  title: z.string().max(200).optional(),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
  subModality: z.string().max(50).optional(),
  mode: z.enum(['standard', 'max']).default('standard'),
  customInstructions: z.string().max(2000).optional(),
});

const addTurnSchema = z.object({
  prompt: z.string().min(1).max(100000),
  subModality: z.string().max(50).optional(),
  mode: z.enum(['standard', 'max']).default('standard'),
  customInstructions: z.string().max(2000).optional(),
});

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
      const autoTitle = data.title || data.prompt.substring(0, 80) + (data.prompt.length > 80 ? '...' : '');

      // Create thread
      const thread = await prisma.thread.create({
        data: {
          userId: req.user.id,
          title: autoTitle,
          modality: data.modality,
        },
      });

      await enhancePromptInThreadStream(
        {
          prompt: data.prompt,
          tier: promptTier,
          maxTokens,
          mode: data.mode,
          modality: data.modality,
          subModality: data.subModality,
          customInstructions: data.customInstructions,
          previousTurns: [],
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
                turnIndex: 0,
                originalPrompt: data.prompt,
                enhancedPrompt: result.enhancedPrompt,
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
                turnIndex: 0,
                usage: {
                  inputTokens: result.inputTokens,
                  outputTokens: result.outputTokens,
                  totalTokens: result.totalTokens,
                  processingMs: result.processingMs,
                },
                subscription: buildSubscriptionPayload(req.subscription, maxModeQuota),
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

      // Verify thread ownership and load existing turns
      const thread = await prisma.thread.findFirst({
        where: { id: threadId, userId: req.user.id },
        include: {
          turns: {
            orderBy: { turnIndex: 'asc' },
            select: {
              originalPrompt: true,
              enhancedPrompt: true,
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
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, userId: req.user.id },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
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
        turns: thread.turns,
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
