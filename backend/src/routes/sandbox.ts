import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { enforceQuota } from '../middleware/quotaEnforcement.js';
import { sandboxService } from '../services/sandboxService.js';
import { PlatformType } from '@prisma/client';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schemas
const createTestSchema = z.object({
  promptId: z.string().optional(),
  testPrompt: z.string().min(1).max(10000),
  platforms: z.array(z.nativeEnum(PlatformType)).min(1),
  parameters: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(32000).optional(),
    topP: z.number().min(0).max(1).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    systemPrompt: z.string().optional()
  }).optional(),
  scheduledFor: z.string().datetime().optional()
});

/**
 * Create a new sandbox test
 */
router.post('/', authenticate, enforceQuota('enhance_prompt'), async (req, res, next) => {
  try {
    const validatedData = createTestSchema.parse(req.body);
    
    const test = await sandboxService.createTest({
      userId: req.user!.id,
      promptId: validatedData.promptId,
      testPrompt: validatedData.testPrompt,
      platforms: validatedData.platforms,
      parameters: validatedData.parameters,
      scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined
    });

    return res.status(201).json({
      success: true,
      data: test
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    return next(error);
  }
});

/**
 * Execute a specific test (if it was scheduled)
 */
router.post('/:id/execute', authenticate, async (req, res, next) => {
  try {
    // Verify ownership
    const test = await sandboxService.getTest(req.params.id!, req.user!.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    if (test.status !== 'scheduled' && test.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Test cannot be executed in current status'
      });
    }

    const result = await sandboxService.executeTest(req.params.id!);

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get a specific test with results
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const test = await sandboxService.getTest(req.params.id!, req.user!.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    return res.json({
      success: true,
      data: test
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * List all tests for the user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const tests = await sandboxService.listTests(req.user!.id, limit);

    return res.json({
      success: true,
      data: tests
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Delete a test
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await sandboxService.deleteTest(req.params.id!, req.user!.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    return res.json({
      success: true,
      message: 'Test deleted successfully'
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get comparison statistics for a test
 */
router.get('/:id/compare', authenticate, async (req, res, next) => {
  try {
    // Verify ownership
    const test = await sandboxService.getTest(req.params.id!, req.user!.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    const comparison = await sandboxService.compareResults(req.params.id!);

    return res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get available platforms for testing
 */
router.get('/platforms/available', authenticate, async (req, res, next) => {
  try {
    // Return platforms that have API keys configured
    const availablePlatforms = [];
    
    if (process.env.OPENAI_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.CHATGPT,
        name: 'AI Chat',
        models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo']
      });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.CLAUDE,
        name: 'AI Assistant',
        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
      });
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.GEMINI,
        name: 'AI Search',
        models: ['gemini-pro', 'gemini-pro-vision']
      });
    }

    if (process.env.PERPLEXITY_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.PERPLEXITY,
        name: 'AI Research',
        models: ['pplx-70b-online', 'pplx-7b-online']
      });
    }

    // Always available (simulated)
    availablePlatforms.push(
      {
        platform: PlatformType.MIDJOURNEY,
        name: 'Image Generator',
        models: ['v6'],
        simulated: true
      },
      {
        platform: PlatformType.DALLE,
        name: 'Image Creator',
        models: ['dall-e-3'],
        simulated: true
      },
      {
        platform: PlatformType.STABLE_DIFFUSION,
        name: 'Diffusion Model',
        models: ['sdxl'],
        simulated: true
      },
      {
        platform: PlatformType.GITHUB_COPILOT,
        name: 'Code Assistant',
        models: ['copilot'],
        simulated: true
      }
    );

    return res.json({
      success: true,
      data: availablePlatforms
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Batch test creation - test the same prompt across multiple platforms
 */
router.post('/batch', authenticate, enforceQuota('enhance_prompt'), async (req, res, next) => {
  try {
    const schema = z.object({
      prompts: z.array(z.string().min(1).max(10000)).min(1).max(10),
      platforms: z.array(z.nativeEnum(PlatformType)).min(1),
      parameters: z.object({
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(32000).optional(),
        topP: z.number().min(0).max(1).optional(),
        frequencyPenalty: z.number().min(-2).max(2).optional(),
        presencePenalty: z.number().min(-2).max(2).optional(),
        systemPrompt: z.string().optional()
      }).optional()
    });

    const validatedData = schema.parse(req.body);
    
    const tests = await Promise.all(
      validatedData.prompts.map(prompt =>
        sandboxService.createTest({
          userId: req.user!.id,
          testPrompt: prompt,
          platforms: validatedData.platforms,
          parameters: validatedData.parameters
        })
      )
    );

    return res.status(201).json({
      success: true,
      data: tests
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    return next(error);
  }
});

export default router;