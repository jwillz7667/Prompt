import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  enforceQuota,
  recordPromptUsage,
  type RequestWithSubscription,
} from '../middleware/quotaEnforcement.js';
import { prisma } from '../utils/prisma.js';
import { recordUsage, getSubscriptionInfo } from '../services/subscriptionService.js';
import { enhancePrompt, enhancePromptStream, getPromptTierFromSubscription } from '../services/deepseekService.js';

export const promptRouter = Router();

// All prompt routes require authentication
promptRouter.use(authenticate);

// Validation schemas
const createPromptSchema = z.object({
  originalPrompt: z.string().min(1).max(100000),
  enhancedPrompt: z.string().min(1).max(500000),
  model: z.string().default('deepseek-reasoner'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(100000).default(8192),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  processingMs: z.number().int().min(0).default(0),
  title: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

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

const enhancePromptSchema = z.object({
  prompt: z.string().min(1).max(100000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  tone: z.enum(['professional', 'casual', 'academic', 'creative', 'technical', 'friendly']).optional(),
  length: z.enum(['concise', 'standard', 'detailed']).optional(),
  customInstructions: z.string().max(2000).optional(),
});

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

      // Get user's subscription to determine prompt quality tier
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);

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
        tone: data.tone,
        length: data.length,
        customInstructions: data.customInstructions,
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
      console.error('Enhance prompt error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      if (error instanceof Error) {
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

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      // Get user's subscription to determine prompt quality tier
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);

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
          tone: data.tone,
          length: data.length,
          customInstructions: data.customInstructions,
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
                subscription: req.subscription
                  ? {
                      tier: req.subscription.tier,
                      promptQuality: req.subscription.promptQuality,
                      dailyPromptsUsed: req.subscription.dailyPromptsUsed + 1,
                      dailyPromptsLimit: req.subscription.dailyPromptsLimit,
                    }
                  : undefined,
              })}\n\n`
            );
            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: (error) => {
            console.error('Stream error:', error);
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
          },
        }
      );
    } catch (error) {
      console.error('Stream enhance error:', error);
      if (error instanceof z.ZodError) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid request data' })}\n\n`);
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

      const prompt = await prisma.prompt.create({
        data: {
          userId: req.user.id,
          ...data,
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
        prompt,
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
      console.error('Create prompt error:', error);
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
        select: {
          id: true,
          originalPrompt: true,
          enhancedPrompt: true,
          model: true,
          totalTokens: true,
          title: true,
          tags: true,
          isFavorite: true,
          isArchived: true,
          createdAt: true,
        },
      }),
      prisma.prompt.count({ where }),
    ]);

    res.json({
      prompts,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('List prompts error:', error);
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
    const prompt = await prisma.prompt.findFirst({
      where: {
        id: promptId,
        userId: req.user.id,
      },
    });

    if (!prompt) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    res.json({ prompt });
  } catch (error) {
    console.error('Get prompt error:', error);
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
    });

    res.json({ prompt: updated });
  } catch (error) {
    console.error('Update prompt error:', error);
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
    console.error('Delete prompt error:', error);
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
    console.error('Bulk favorite error:', error);
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
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete prompts' });
  }
});

// ============================================================================
// BATCH ENHANCE (Premium feature - process multiple prompts)
// ============================================================================

const batchEnhanceSchema = z.object({
  prompts: z.array(z.string().min(1).max(50000)).min(1).max(10),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(50000).optional(),
  tone: z.enum(['professional', 'casual', 'academic', 'creative', 'technical', 'friendly']).optional(),
  length: z.enum(['concise', 'standard', 'detailed']).optional(),
});

promptRouter.post(
  '/enhance/batch',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check if user has premium subscription
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      if (subscriptionInfo.tier !== 'PREMIUM') {
        res.status(403).json({ error: 'Batch enhancement is a Premium feature' });
        return;
      }

      const data = batchEnhanceSchema.parse(req.body);
      const promptTier = getPromptTierFromSubscription(subscriptionInfo.features);

      const maxTokens = Math.min(
        data.maxTokens || subscriptionInfo.features.maxTokensPerPrompt,
        subscriptionInfo.features.maxTokensPerPrompt
      );

      const results: Array<{
        index: number;
        original: string;
        enhanced: string;
        success: boolean;
        error?: string;
      }> = [];

      // Process prompts sequentially with rate limiting
      for (let i = 0; i < data.prompts.length; i++) {
        const prompt = data.prompts[i]!;

        try {
          const result = await enhancePrompt({
            prompt,
            tier: promptTier,
            model: data.model,
            temperature: data.temperature,
            maxTokens,
            tone: data.tone,
            length: data.length,
          });

          // Save to database
          const savedPrompt = await prisma.prompt.create({
            data: {
              userId: req.user.id,
              originalPrompt: prompt,
              enhancedPrompt: result.enhancedPrompt,
              model: result.model,
              temperature: data.temperature || 0.7,
              maxTokens,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              totalTokens: result.totalTokens,
              processingMs: result.processingMs,
            },
          });

          results.push({
            index: i,
            original: prompt,
            enhanced: result.enhancedPrompt,
            success: true,
          });

          // Update user stats
          await prisma.user.update({
            where: { id: req.user.id },
            data: {
              promptCount: { increment: 1 },
              tokenUsage: { increment: BigInt(result.totalTokens) },
            },
          });

          // Small delay between requests to avoid rate limiting
          if (i < data.prompts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          results.push({
            index: i,
            original: prompt,
            enhanced: '',
            success: false,
            error: error instanceof Error ? error.message : 'Enhancement failed',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      res.json({
        results,
        summary: {
          total: data.prompts.length,
          success: successCount,
          failed: failureCount,
        },
      });
    } catch (error) {
      console.error('Batch enhance error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to batch enhance prompts' });
    }
  }
);
