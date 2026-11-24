import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireEntitlement } from '../middleware/requireEntitlement.js';
import { sandboxService } from '../services/sandboxService.js';
import { PlatformType } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { clientErrorHttpStatus, toClientStreamError } from '../features/llm/errors.js';

const router = Router();

// Duplicates are dropped so one request runs each platform at most once.
const platformsSchema = z
  .array(z.nativeEnum(PlatformType))
  .min(1)
  .max(Object.keys(PlatformType).length)
  .transform((platforms) => [...new Set(platforms)]);

// Validation schemas
const createTestSchema = z.object({
  promptId: z.string().optional(),
  testPrompt: z.string().min(1).max(10000),
  platforms: platformsSchema,
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(32000).optional(),
      topP: z.number().min(0).max(1).optional(),
      frequencyPenalty: z.number().min(-2).max(2).optional(),
      presencePenalty: z.number().min(-2).max(2).optional(),
      systemPrompt: z.string().optional(),
    })
    .optional(),
  scheduledFor: z.string().datetime().optional(),
});

/**
 * Create a new sandbox test
 */
router.post('/', authenticate, requireEntitlement, async (req, res, next) => {
  try {
    const validatedData = createTestSchema.parse(req.body);

    const test = await sandboxService.createTest({
      userId: req.user!.id,
      promptId: validatedData.promptId,
      testPrompt: validatedData.testPrompt,
      platforms: validatedData.platforms,
      parameters: validatedData.parameters,
      scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined,
    });

    return res.status(201).json({
      success: true,
      data: test,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }
    return next(error);
  }
});

/**
 * Execute a specific test (if it was scheduled)
 */
router.post('/:id/execute', authenticate, requireEntitlement, async (req, res, next) => {
  try {
    // Verify ownership
    const test = await sandboxService.getTest(req.params.id!, req.user!.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found',
      });
    }

    if (test.status !== 'scheduled' && test.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Test cannot be executed in current status',
      });
    }

    const result = await sandboxService.executeTest(req.params.id!);

    return res.json({
      success: true,
      data: result,
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
        error: 'Test not found',
      });
    }

    return res.json({
      success: true,
      data: test,
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
      data: tests,
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
        error: 'Test not found',
      });
    }

    return res.json({
      success: true,
      message: 'Test deleted successfully',
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
        error: 'Test not found',
      });
    }

    const comparison = await sandboxService.compareResults(req.params.id!);

    return res.json({
      success: true,
      data: comparison,
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
        models: ['standard', 'advanced'],
      });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.CLAUDE,
        name: 'AI Assistant',
        models: ['standard', 'advanced'],
      });
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.GEMINI,
        name: 'AI Search',
        models: ['standard', 'vision'],
      });
    }

    if (process.env.PERPLEXITY_API_KEY) {
      availablePlatforms.push({
        platform: PlatformType.PERPLEXITY,
        name: 'AI Research',
        models: ['online'],
      });
    }

    // Always available (simulated)
    availablePlatforms.push(
      {
        platform: PlatformType.MIDJOURNEY,
        name: 'Image Generator',
        models: ['standard'],
        simulated: true,
      },
      {
        platform: PlatformType.DALLE,
        name: 'Image Creator',
        models: ['standard'],
        simulated: true,
      },
      {
        platform: PlatformType.STABLE_DIFFUSION,
        name: 'Diffusion Model',
        models: ['standard'],
        simulated: true,
      },
      {
        platform: PlatformType.GITHUB_COPILOT,
        name: 'Code Assistant',
        models: ['standard'],
        simulated: true,
      },
    );

    return res.json({
      success: true,
      data: availablePlatforms,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Batch test creation - test the same prompt across multiple platforms
 */
router.post('/batch', authenticate, requireEntitlement, async (req, res, next) => {
  try {
    const schema = z.object({
      prompts: z.array(z.string().min(1).max(10000)).min(1).max(10),
      platforms: platformsSchema,
      parameters: z
        .object({
          temperature: z.number().min(0).max(2).optional(),
          maxTokens: z.number().min(1).max(32000).optional(),
          topP: z.number().min(0).max(1).optional(),
          frequencyPenalty: z.number().min(-2).max(2).optional(),
          presencePenalty: z.number().min(-2).max(2).optional(),
          systemPrompt: z.string().optional(),
        })
        .optional(),
    });

    const validatedData = schema.parse(req.body);

    const tests = await Promise.all(
      validatedData.prompts.map((prompt) =>
        sandboxService.createTest({
          userId: req.user!.id,
          testPrompt: prompt,
          platforms: validatedData.platforms,
          parameters: validatedData.parameters,
        }),
      ),
    );

    return res.status(201).json({
      success: true,
      data: tests,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }
    return next(error);
  }
});

// Service errors are plain Errors; only these messages are safe to show.
// Everything else (provider, configuration, database) is logged once here
// and mapped to the generic client copy so nothing upstream leaks.
const CLIENT_SAFE_ERRORS = new Map<string, { status: number; message: string }>([
  ['Test not found', { status: 404, message: 'Test not found' }],
]);

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const safe = error instanceof Error ? CLIENT_SAFE_ERRORS.get(error.message) : undefined;
  if (safe) {
    res.status(safe.status).json({ success: false, error: safe.message });
    return;
  }
  logger.error({ err: error }, 'Sandbox route error');
  const clientError = toClientStreamError(error);
  res.status(clientErrorHttpStatus(clientError.code)).json({
    success: false,
    error: clientError.message,
    code: clientError.code,
    retryable: clientError.retryable,
  });
});

export default router;
