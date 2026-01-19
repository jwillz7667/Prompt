import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

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

// ============================================================================
// CREATE PROMPT
// ============================================================================

promptRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
        tokenCount: { increment: BigInt(data.totalTokens) },
      },
      create: {
        userId: req.user.id,
        date: today,
        promptCount: 1,
        tokenCount: BigInt(data.totalTokens),
      },
    });

    res.status(201).json({ prompt });
  } catch (error) {
    console.error('Create prompt error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

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
