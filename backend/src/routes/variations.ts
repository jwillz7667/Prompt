/**
 * Prompt Variations API Routes
 *
 * Endpoints for generating, comparing, and rating prompt variations
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { enforceQuota } from '../middleware/quotaEnforcement.js';
import { logger } from '../utils/logger.js';
import {
  queueVariationGeneration,
  getVariationComparison,
  rateVariation,
  selectVariationWinner,
  getUserVariations,
  type VariationConfig,
} from '../services/variationsService.js';

const router = Router();

// All variation routes require authentication
router.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const generateVariationsSchema = z.object({
  prompt: z.string().min(1).max(100000),
  promptId: z.string().min(1).optional(),
  strategy: z.enum([
    'quick',
    'comprehensive',
    'modality_focus',
    'max_compare',
    'platform_test',
    'creative_exploration',
  ]).optional(),
  config: z.object({
    variants: z.array(z.object({
      label: z.string(),
      mode: z.enum(['standard', 'max']),
      focus: z.string().optional(),
      customInstructions: z.string().optional(),
      subModality: z.string().optional(),
    })).optional(),
    includeOriginal: z.boolean().optional(),
    maxVariations: z.number().min(1).max(20).optional(),
  }).optional(),
});

const rateVariationSchema = z.object({
  index: z.number().min(0),
  rating: z.number().min(1).max(5),
});

const selectWinnerSchema = z.object({
  winnerIndex: z.number().min(0),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/v1/variations/generate
 * Generate variations for a prompt
 */
router.post('/generate', enforceQuota('enhance_prompt'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, promptId, strategy, config } = generateVariationsSchema.parse(req.body);
    const normalizedStrategy = strategy === 'platform_test'
      ? 'modality_focus'
      : strategy === 'creative_exploration'
        ? 'max_compare'
        : (strategy || 'quick');

    const comparison = await queueVariationGeneration(
      req.user!.id,
      prompt,
      promptId,
      config ? (config as VariationConfig) : normalizedStrategy
    );

    return res.status(202).json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    logger.error({ error }, 'Failed to generate variations');
    return res.status(500).json({
      success: false,
      error: 'Failed to generate variations',
    });
  }
});

/**
 * GET /api/v1/variations/:id
 * Get variation batch with results
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const comparison = await getVariationComparison(req.params.id!, req.user!.id);

    return res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    if ((error as Error).message === 'Variation not found') {
      return res.status(404).json({
        success: false,
        error: 'Variation not found',
      });
    }
    logger.error({ error }, 'Failed to get variation');
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve variation',
    });
  }
});

/**
 * POST /api/v1/variations/:id/rate
 * Rate a specific variation
 */
router.post('/:id/rate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { index, rating } = rateVariationSchema.parse(req.body);

    await rateVariation(req.params.id!, index, rating, req.user!.id);

    return res.json({
      success: true,
      message: 'Variation rated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    if ((error as Error).message === 'Variation not found') {
      return res.status(404).json({
        success: false,
        error: 'Variation not found',
      });
    }
    logger.error({ error }, 'Failed to rate variation');
    return res.status(500).json({
      success: false,
      error: 'Failed to rate variation',
    });
  }
});

/**
 * POST /api/v1/variations/:id/select
 * Select winning variation
 */
router.post('/:id/select', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { winnerIndex } = selectWinnerSchema.parse(req.body);

    await selectVariationWinner(req.params.id!, winnerIndex, req.user!.id);

    return res.json({
      success: true,
      message: 'Winner selected successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    if ((error as Error).message === 'Variation not found') {
      return res.status(404).json({
        success: false,
        error: 'Variation not found',
      });
    }
    logger.error({ error }, 'Failed to select winner');
    return res.status(500).json({
      success: false,
      error: 'Failed to select winner',
    });
  }
});

/**
 * GET /api/v1/variations
 * List user's variation batches
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getUserVariations(req.user!.id, limit, offset);

    return res.json({
      success: true,
      data: result.variations,
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list variations');
    return res.status(500).json({
      success: false,
      error: 'Failed to list variations',
    });
  }
});

export default router;
