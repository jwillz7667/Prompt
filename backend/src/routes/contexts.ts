import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { contextService } from '../services/contextService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schemas
const createContextSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  contextData: z.any(),
  tags: z.array(z.string()).optional(),
  isGlobal: z.boolean().optional()
});

const updateContextSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  contextData: z.any().optional(),
  tags: z.array(z.string()).optional(),
  isGlobal: z.boolean().optional()
});

const searchContextSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  includeGlobal: z.boolean().optional()
});

const attachContextSchema = z.object({
  promptId: z.string()
});

const mergeContextsSchema = z.object({
  contextIds: z.array(z.string()).min(2),
  newName: z.string().min(1).max(100)
});

/**
 * Create a new context
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const validatedData = createContextSchema.parse(req.body);
    
    const context = await contextService.createContext({
      userId: req.user!.id,
      name: validatedData.name,
      description: validatedData.description,
      contextData: validatedData.contextData,
      tags: validatedData.tags,
      isGlobal: validatedData.isGlobal
    });

    return res.status(201).json({
      success: true,
      data: context
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
 * Update a context
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const validatedData = updateContextSchema.parse(req.body);
    
    const context = await contextService.updateContext(
      req.params.id!,
      req.user!.id,
      validatedData
    );

    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Context not found or access denied'
      });
    }

    return res.json({
      success: true,
      data: context
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
 * Delete a context
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await contextService.deleteContext(
      req.params.id!,
      req.user!.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Context not found or access denied'
      });
    }

    return res.json({
      success: true,
      message: 'Context deleted successfully'
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get a single context
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const context = await contextService.getContext(
      req.params.id!,
      req.user!.id
    );

    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Context not found or access denied'
      });
    }

    return res.json({
      success: true,
      data: context
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * List all contexts for the user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const includeGlobal = req.query.includeGlobal !== 'false';
    
    const contexts = await contextService.listContexts(
      req.user!.id,
      includeGlobal
    );

    return res.json({
      success: true,
      data: contexts
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Search for similar contexts using semantic search
 */
router.post('/search', authenticate, async (req, res, next) => {
  try {
    const validatedData = searchContextSchema.parse(req.body);
    
    const results = await contextService.searchSimilarContexts({
      userId: req.user!.id,
      ...validatedData
    });

    return res.json({
      success: true,
      data: results
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
 * Attach a context to a prompt
 */
router.post('/:id/attach', authenticate, async (req, res, next) => {
  try {
    const validatedData = attachContextSchema.parse(req.body);
    
    const attached = await contextService.attachContextToPrompt(
      req.params.id!,
      validatedData.promptId,
      req.user!.id
    );

    if (!attached) {
      return res.status(404).json({
        success: false,
        error: 'Context or prompt not found'
      });
    }

    return res.json({
      success: true,
      message: 'Context attached to prompt successfully'
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
 * Get contexts used with a specific prompt
 */
router.get('/prompt/:promptId', authenticate, async (req, res, next) => {
  try {
    const contexts = await contextService.getPromptContexts(req.params.promptId!);

    return res.json({
      success: true,
      data: contexts
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Merge multiple contexts into a new one
 */
router.post('/merge', authenticate, async (req, res, next) => {
  try {
    const validatedData = mergeContextsSchema.parse(req.body);
    
    const mergedContext = await contextService.mergeContexts(
      validatedData.contextIds,
      req.user!.id,
      validatedData.newName
    );

    return res.status(201).json({
      success: true,
      data: mergedContext
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