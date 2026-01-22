import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const templateRouter = Router();

// All template routes require authentication
templateRouter.use(authenticate);

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(50000),
  description: z.string().max(500).optional(),
  category: z.string().max(50).default('General'),
  icon: z.string().max(50).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(50000).optional(),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  icon: z.string().max(50).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  search: z.string().max(200).optional(),
  includeBuiltIn: z.enum(['true', 'false']).default('true'),
});

// ============================================================================
// LIST TEMPLATES (user's + built-in)
// ============================================================================

templateRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const query = listQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    // Build where clause
    const whereConditions: object[] = [{ userId: req.user.id }];

    if (query.includeBuiltIn === 'true') {
      whereConditions.push({ isBuiltIn: true });
    }

    const where: Record<string, unknown> = {
      OR: whereConditions,
    };

    if (query.category) {
      where['category'] = query.category;
    }

    if (query.search) {
      where['AND'] = [
        {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { content: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: [{ isBuiltIn: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: {
          id: true,
          name: true,
          content: true,
          description: true,
          category: true,
          icon: true,
          isBuiltIn: true,
          usageCount: true,
          createdAt: true,
        },
      }),
      prisma.template.count({ where }),
    ]);

    // Get unique categories for filtering
    const categories = await prisma.template.groupBy({
      by: ['category'],
      where: {
        OR: [{ userId: req.user.id }, { isBuiltIn: true }],
      },
    });

    res.json({
      templates,
      categories: categories.map((c) => c.category),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('List templates error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// ============================================================================
// GET SINGLE TEMPLATE
// ============================================================================

templateRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const templateId = req.params.id as string;
    const template = await prisma.template.findFirst({
      where: {
        id: templateId,
        OR: [{ userId: req.user.id }, { isBuiltIn: true }],
      },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ template });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// ============================================================================
// CREATE TEMPLATE
// ============================================================================

templateRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = createTemplateSchema.parse(req.body);

    const template = await prisma.template.create({
      data: {
        userId: req.user.id,
        ...data,
      },
    });

    res.status(201).json({ template });
  } catch (error) {
    console.error('Create template error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// ============================================================================
// UPDATE TEMPLATE
// ============================================================================

templateRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = updateTemplateSchema.parse(req.body);
    const templateId = req.params.id as string;

    // Check ownership (can't edit built-in templates)
    const existing = await prisma.template.findFirst({
      where: {
        id: templateId,
        userId: req.user.id,
        isBuiltIn: false,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Template not found or cannot be edited' });
      return;
    }

    const template = await prisma.template.update({
      where: { id: templateId },
      data,
    });

    res.json({ template });
  } catch (error) {
    console.error('Update template error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// ============================================================================
// DELETE TEMPLATE
// ============================================================================

templateRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const templateId = req.params.id as string;

    // Can't delete built-in templates
    const result = await prisma.template.deleteMany({
      where: {
        id: templateId,
        userId: req.user.id,
        isBuiltIn: false,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Template not found or cannot be deleted' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================================================
// USE TEMPLATE (increment usage count)
// ============================================================================

templateRouter.post('/:id/use', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const templateId = req.params.id as string;

    const template = await prisma.template.updateMany({
      where: {
        id: templateId,
        OR: [{ userId: req.user.id }, { isBuiltIn: true }],
      },
      data: {
        usageCount: { increment: 1 },
      },
    });

    if (template.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Use template error:', error);
    res.status(500).json({ error: 'Failed to update template usage' });
  }
});
