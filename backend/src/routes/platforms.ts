/**
 * Platform Presets API Routes
 * 
 * Endpoints for platform-specific optimizations and presets
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import {
  getPlatformPreset,
  validatePromptForPlatform,
  optimizePromptForPlatform,
  estimatePlatformCost,
  getAvailablePlatforms,
  getPlatformCapabilities,
  saveUserPlatformSettings,
  getUserPlatformSettings,
} from '../services/platformService.js';
import { logger } from '../utils/logger.js';

export const platformRouter = Router();

// All platform routes require authentication
platformRouter.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const platformTypeSchema = z.enum([
  'CHATGPT', 'CLAUDE', 'GEMINI', 'MIDJOURNEY', 'DALLE', 
  'STABLE_DIFFUSION', 'SORA', 'RUNWAY', 'SUNO', 'UDIO'
]);

const validatePromptSchema = z.object({
  prompt: z.string().min(1).max(100000),
  platform: platformTypeSchema,
});

const optimizePromptSchema = z.object({
  prompt: z.string().min(1).max(100000),
  platform: platformTypeSchema,
  options: z.object({
    tone: z.string().optional(),
    style: z.string().optional(),
    quality: z.enum(['draft', 'standard', 'high']).optional(),
  }).optional(),
});

const estimateCostSchema = z.object({
  prompt: z.string().min(1).max(100000),
  platforms: z.array(platformTypeSchema),
});

const userSettingsSchema = z.object({
  platform: platformTypeSchema,
  customSettings: z.any().optional(),
  preferredPresetId: z.string().optional(),
  apiKey: z.string().optional(),
  isEnabled: z.boolean().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/v1/platforms
 * Get all available platforms with their capabilities
 */
platformRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platforms = getAvailablePlatforms();
    const platformsWithCapabilities = platforms.map(platform => 
      getPlatformCapabilities(platform as any)
    );

    res.json({
      platforms: platformsWithCapabilities,
      count: platforms.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get platforms');
    res.status(500).json({ error: 'Failed to retrieve platforms' });
  }
});

/**
 * GET /api/v1/platforms/presets
 * Get all platform presets
 */
platformRouter.get('/presets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const presets = await prisma.platformPreset.findMany({
      where: { isOfficial: true },
      orderBy: { platform: 'asc' },
    });

    res.json({ presets });
  } catch (error) {
    logger.error({ error }, 'Failed to get platform presets');
    res.status(500).json({ error: 'Failed to retrieve presets' });
  }
});

/**
 * GET /api/v1/platforms/:platform/preset
 * Get specific platform preset
 */
platformRouter.get('/:platform/preset', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platform = platformTypeSchema.parse(req.params.platform);
    const preset = await getPlatformPreset(platform);

    if (!preset) {
      res.status(404).json({ error: 'Platform preset not found' });
      return;
    }

    res.json({ preset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid platform type' });
      return;
    }
    logger.error({ error }, 'Failed to get platform preset');
    res.status(500).json({ error: 'Failed to retrieve preset' });
  }
});

/**
 * POST /api/v1/platforms/validate
 * Validate a prompt for a specific platform
 */
platformRouter.post('/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, platform } = validatePromptSchema.parse(req.body);
    const validation = validatePromptForPlatform(prompt, platform);

    res.json({
      platform,
      validation,
      promptLength: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    logger.error('Failed to validate prompt', { error });
    res.status(500).json({ error: 'Validation failed' });
  }
});

/**
 * POST /api/v1/platforms/optimize
 * Optimize a prompt for a specific platform
 */
platformRouter.post('/optimize', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, platform, options } = optimizePromptSchema.parse(req.body);
    
    // Validate original prompt
    const validation = validatePromptForPlatform(prompt, platform);
    
    // Optimize the prompt
    const optimizedPrompt = optimizePromptForPlatform(prompt, platform, options);
    
    // Validate optimized prompt
    const optimizedValidation = validatePromptForPlatform(optimizedPrompt, platform);
    
    // Estimate cost
    const cost = estimatePlatformCost(optimizedPrompt, platform);

    res.json({
      originalPrompt: prompt,
      optimizedPrompt,
      platform,
      validation: optimizedValidation,
      cost,
      improvements: {
        lengthReduction: prompt.length - optimizedPrompt.length,
        validationIssuesResolved: validation.errors.length - optimizedValidation.errors.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    logger.error('Failed to optimize prompt', { error });
    res.status(500).json({ error: 'Optimization failed' });
  }
});

/**
 * POST /api/v1/platforms/estimate-cost
 * Estimate cost for a prompt across multiple platforms
 */
platformRouter.post('/estimate-cost', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, platforms } = estimateCostSchema.parse(req.body);
    
    const estimates = platforms.map(platform => {
      const cost = estimatePlatformCost(prompt, platform);
      const validation = validatePromptForPlatform(prompt, platform);
      
      return {
        platform,
        ...cost,
        isValid: validation.isValid,
        warnings: validation.warnings.length,
        errors: validation.errors.length,
      };
    });

    // Sort by cost
    estimates.sort((a, b) => a.estimatedCost - b.estimatedCost);

    res.json({
      prompt: prompt.substring(0, 100) + '...',
      promptLength: prompt.length,
      estimates,
      cheapest: estimates[0],
      mostExpensive: estimates[estimates.length - 1],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    logger.error('Failed to estimate costs', { error });
    res.status(500).json({ error: 'Cost estimation failed' });
  }
});

/**
 * GET /api/v1/platforms/user-settings
 * Get user's platform settings
 */
platformRouter.get('/user-settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const settings = await getUserPlatformSettings(req.user.id);
    
    // Don't send API keys to client
    const sanitizedSettings = settings.map(s => ({
      ...s,
      apiKey: s.apiKey ? '***' : null,
      apiKeyEncrypted: undefined,
    }));

    res.json({ settings: sanitizedSettings });
  } catch (error) {
    logger.error('Failed to get user platform settings', { error });
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

/**
 * PUT /api/v1/platforms/user-settings
 * Update user's platform settings
 */
platformRouter.put('/user-settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = userSettingsSchema.parse(req.body);
    
    // TODO: Encrypt API key before storing
    const settings = await saveUserPlatformSettings(req.user.id, data.platform, {
      customSettings: data.customSettings,
      preferredPresetId: data.preferredPresetId,
      apiKey: data.apiKey,
      isEnabled: data.isEnabled,
    });

    // Don't send API key back
    res.json({
      settings: {
        ...settings,
        apiKey: settings.apiKey ? '***' : null,
        apiKeyEncrypted: undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    logger.error('Failed to update user platform settings', { error });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/v1/platforms/batch-optimize
 * Optimize a prompt for multiple platforms at once
 */
platformRouter.post('/batch-optimize', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, platforms, options } = z.object({
      prompt: z.string().min(1).max(100000),
      platforms: z.array(platformTypeSchema),
      options: z.object({
        tone: z.string().optional(),
        style: z.string().optional(),
        quality: z.enum(['draft', 'standard', 'high']).optional(),
      }).optional(),
    }).parse(req.body);

    const results = platforms.map(platform => {
      const optimizedPrompt = optimizePromptForPlatform(prompt, platform, options);
      const validation = validatePromptForPlatform(optimizedPrompt, platform);
      const cost = estimatePlatformCost(optimizedPrompt, platform);

      return {
        platform,
        optimizedPrompt,
        validation,
        cost,
      };
    });

    res.json({
      originalPrompt: prompt,
      results,
      summary: {
        totalPlatforms: results.length,
        validPlatforms: results.filter(r => r.validation.isValid).length,
        averageCost: results.reduce((sum, r) => sum + r.cost.estimatedCost, 0) / results.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    logger.error('Failed to batch optimize', { error });
    res.status(500).json({ error: 'Batch optimization failed' });
  }
});