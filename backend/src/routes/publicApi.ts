/**
 * Public API Routes
 *
 * External API endpoints authenticated via X-API-Key header.
 * These are the endpoints developers use to integrate Promptomize.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { apiKeyAuth, requirePermission, type ApiKeyRequest } from '../middleware/apiKeyAuth.js';
import { apiRateLimit } from '../middleware/apiRateLimit.js';
import { enforceApiQuota, recordApiUsage, getQuotaInfo, type ApiQuotaRequest } from '../middleware/apiQuotaEnforcement.js';
import { prisma } from '../utils/prisma.js';
import { enhancePrompt, enhancePromptStream, getPromptTierFromSubscription } from '../services/deepseekService.js';
import { getApiSubscriptionInfo, getTierConfig } from '../services/apiSubscriptionService.js';
import { getRecentUsage } from '../services/apiUsageService.js';
import { logger } from '../utils/logger.js';

export const publicApiRouter = Router();

// All routes require API key authentication
publicApiRouter.use(apiKeyAuth);
publicApiRouter.use(apiRateLimit);
publicApiRouter.use(enforceApiQuota);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const enhanceSchema = z.object({
  prompt: z.string().min(1).max(100000),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
  mode: z.enum(['standard', 'max']).default('standard'),
  maxTokens: z.number().int().min(1).max(8192).optional(),
  customInstructions: z.string().max(2000).optional(),
  stream: z.boolean().default(false),
  subModality: z.string().optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).optional(),
});

// ============================================================================
// POST /enhance - Enhance a prompt
// ============================================================================

publicApiRouter.post(
  '/enhance',
  requirePermission('enhance'),
  async (req: ApiQuotaRequest, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      if (!req.apiKey) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = enhanceSchema.parse(req.body);

      // Get API subscription tier to determine quality
      const subscriptionInfo = await getApiSubscriptionInfo(req.apiKey.developerId);
      const tierConfig = getTierConfig(subscriptionInfo.tier);

      // Map API tier to prompt quality tier
      const promptTier = mapApiTierToPromptTier(subscriptionInfo.tier);

      // Enforce max tokens based on tier
      const maxTokens = Math.min(data.maxTokens || 4096, 8192);

      if (data.stream) {
        // Streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        await enhancePromptStream(
          {
            prompt: data.prompt,
            tier: promptTier,
            maxTokens,
            mode: data.mode,
            modality: data.modality,
            customInstructions: data.customInstructions,
            subModality: data.subModality,
          },
          {
            onToken: (token) => {
              res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
            },
            onComplete: async (result) => {
              // Record usage
              await recordApiUsage(req, res, {
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                modality: data.modality,
              });

              // Get updated quota
              const quotaInfo = await getQuotaInfo(req.apiKey!.developerId);

              res.write(
                `data: ${JSON.stringify({
                  type: 'complete',
                  enhancedPrompt: result.enhancedPrompt,
                  usage: {
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    totalTokens: result.totalTokens,
                    processingMs: result.processingMs,
                  },
                  quota: quotaInfo.quota,
                })}\n\n`
              );
              res.write('data: [DONE]\n\n');
              res.end();
            },
            onError: (error) => {
              logger.error({ error, keyId: req.apiKey?.id }, 'Stream error');
              res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
              res.end();
            },
          }
        );
      } else {
        // Regular response
        const result = await enhancePrompt({
          prompt: data.prompt,
          tier: promptTier,
          maxTokens,
          mode: data.mode,
          modality: data.modality,
          customInstructions: data.customInstructions,
          subModality: data.subModality,
        });

        // Record usage
        await recordApiUsage(req, res, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          modality: data.modality,
        });

        // Get updated quota
        const quotaInfo = await getQuotaInfo(req.apiKey.developerId);

        res.json({
          enhancedPrompt: result.enhancedPrompt,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            processingMs: result.processingMs,
          },
          quota: quotaInfo.quota,
        });
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof z.ZodError) {
        res.status(400);
        await recordApiUsage(req, res, {});
        res.json({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      logger.error({ error, keyId: req.apiKey?.id, latencyMs }, 'Enhance error');

      res.status(500).json({
        error: 'Enhancement failed',
        code: 'ENHANCEMENT_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }
);

// ============================================================================
// GET /usage - Get current usage and quota
// ============================================================================

publicApiRouter.get('/usage', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const quotaInfo = await getQuotaInfo(req.apiKey.developerId);

    res.json(quotaInfo);
  } catch (error) {
    logger.error({ error, keyId: req.apiKey?.id }, 'Get usage error');
    res.status(500).json({ error: 'Failed to get usage data' });
  }
});

// ============================================================================
// GET /models - List available modalities and options
// ============================================================================

publicApiRouter.get('/models', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    res.json({
      modalities: [
        {
          id: 'text',
          name: 'Text',
          description: 'General text and writing prompts',
        },
        {
          id: 'image',
          name: 'Image',
          description: 'Prompts for image generation and visual composition',
        },
        {
          id: 'video',
          name: 'Video',
          description: 'Prompts for video generation and motion direction',
        },
        {
          id: 'audio',
          name: 'Audio',
          description: 'Prompts for audio, music, voice, and sound design',
        },
        {
          id: 'code',
          name: 'Code',
          description: 'Programming and code-related prompts',
        },
        {
          id: '3d',
          name: '3D',
          description: 'Prompts for 3D model generation',
        },
      ],
      modes: [
        { id: 'standard', name: 'Standard', description: 'Fast, high-quality prompt enhancement' },
        { id: 'max', name: 'MAX', description: 'Highest-quality prompt enhancement with deeper planning and validation' },
      ],
      limits: {
        maxPromptLength: 100000,
        maxTokens: 8192,
        maxCustomInstructions: 2000,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Get models error');
    res.status(500).json({ error: 'Failed to get models' });
  }
});

// ============================================================================
// GET /history - Get enhancement history (requires read_history permission)
// ============================================================================

publicApiRouter.get(
  '/history',
  requirePermission('read_history'),
  async (req: ApiKeyRequest, res: Response): Promise<void> => {
    try {
      if (!req.apiKey) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const query = historyQuerySchema.parse(req.query);
      const skip = (query.page - 1) * query.limit;

      // Query ApiUsage table which tracks all developer API requests
      const where: Record<string, unknown> = {
        developerId: req.apiKey.developerId,
        endpoint: '/enhance',
        statusCode: 200,
      };

      if (query.modality) {
        where['modality'] = query.modality;
      }

      const [usageRecords, total] = await Promise.all([
        prisma.apiUsage.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.limit,
          select: {
            id: true,
            modality: true,
            inputTokens: true,
            outputTokens: true,
            totalTokens: true,
            latencyMs: true,
            createdAt: true,
          },
        }),
        prisma.apiUsage.count({ where }),
      ]);

      res.json({
        requests: usageRecords.map((r) => ({
          id: r.id,
          modality: r.modality,
          usage: {
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            totalTokens: r.totalTokens,
            processingMs: r.latencyMs,
          },
          createdAt: r.createdAt,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
        return;
      }
      logger.error({ error, keyId: req.apiKey?.id }, 'Get history error');
      res.status(500).json({ error: 'Failed to get history' });
    }
  }
);

// ============================================================================
// GET /recent - Get recent API usage (for debugging)
// ============================================================================

publicApiRouter.get('/recent', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const recent = await getRecentUsage(req.apiKey.developerId, 10);

    res.json({
      requests: recent.map((r) => ({
        id: r.id,
        endpoint: r.endpoint,
        method: r.method,
        statusCode: r.statusCode,
        tokens: r.totalTokens,
        latencyMs: r.latencyMs,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Get recent error');
    res.status(500).json({ error: 'Failed to get recent requests' });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function mapApiTierToPromptTier(tier: string): 'basic' | 'standard' | 'advanced' {
  switch (tier) {
    case 'API_FREE':
      return 'basic';
    case 'API_STARTER':
      return 'standard';
    case 'API_PRO':
    case 'API_ENTERPRISE':
      return 'advanced';
    default:
      return 'basic';
  }
}
