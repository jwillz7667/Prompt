import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Template library.
 *
 * Public surface (no auth): browse built-in + community-approved templates.
 * Authenticated surface: manage your own templates. A user template becomes
 * publicly visible only after admin moderation flips isPublic (see
 * /api/v1/admin/templates) — user content is never public by default.
 */

export const templatesRouter = Router();

const MODALITIES = ['text', 'image', 'video', 'audio', 'code', '3d'] as const;

const listTemplatesSchema = z.object({
  modality: z.enum(MODALITIES).optional(),
  category: z.string().min(1).max(50).optional(),
  search: z.string().min(1).max(100).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const templateSelect = {
  id: true,
  name: true,
  content: true,
  description: true,
  category: true,
  modality: true,
  icon: true,
  isBuiltIn: true,
  isPublic: true,
  usageCount: true,
  createdAt: true,
} satisfies Prisma.TemplateSelect;

// GET /api/v1/templates — public library, cursor-paginated
templatesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = listTemplatesSchema.parse(req.query);

    const where: Prisma.TemplateWhereInput = {
      OR: [{ isBuiltIn: true }, { isPublic: true }],
      ...(query.modality ? { modality: query.modality } : {}),
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { description: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };

    const templates = await prisma.template.findMany({
      where,
      select: templateSelect,
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = templates.length > query.limit;
    const page = hasMore ? templates.slice(0, query.limit) : templates;
    res.json({
      templates: page,
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query', details: error.errors });
      return;
    }
    logger.error({ err: error }, 'Failed to list templates');
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/v1/templates/categories — distinct categories for filter chips
templatesRouter.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await prisma.template.findMany({
      where: { OR: [{ isBuiltIn: true }, { isPublic: true }] },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    res.json({ categories: rows.map((row) => row.category) });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list template categories');
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

// ============================================================================
// Authenticated: the caller's own templates.
// Declared before /:id so the literal path wins the match.
// ============================================================================

templatesRouter.get('/mine', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const templates = await prisma.template.findMany({
      where: { userId: req.user.id },
      select: templateSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ templates });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list own templates');
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/v1/templates/:id — public template detail
templatesRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await prisma.template.findFirst({
      where: {
        id: req.params['id'] as string,
        OR: [{ isBuiltIn: true }, { isPublic: true }],
      },
      select: templateSelect,
    });
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch template');
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/v1/templates/:id/use — track template usage; returns the content
// so clients can atomically "get and count" with one call.
templatesRouter.post('/:id/use', async (req: Request, res: Response): Promise<void> => {
  try {
    // Visibility lives in the WHERE so private templates are neither counted
    // nor distinguishable from nonexistent ones.
    const result = await prisma.template.updateMany({
      where: {
        id: req.params['id'] as string,
        OR: [{ isBuiltIn: true }, { isPublic: true }],
      },
      data: { usageCount: { increment: 1 } },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = await prisma.template.findUnique({
      where: { id: req.params['id'] as string },
      select: templateSelect,
    });
    res.json({ template });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record template use');
    res.status(500).json({ error: 'Failed to record template use' });
  }
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(50).default('General'),
  modality: z.enum(MODALITIES).default('text'),
  icon: z.string().max(50).optional(),
});

templatesRouter.post('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const data = createTemplateSchema.parse(req.body);
    const template = await prisma.template.create({
      data: { ...data, userId: req.user.id },
      select: templateSelect,
    });
    res.status(201).json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid template', details: error.errors });
      return;
    }
    logger.error({ err: error }, 'Failed to create template');
    res.status(500).json({ error: 'Failed to create template' });
  }
});

const updateTemplateSchema = createTemplateSchema.partial();

templatesRouter.patch('/:id', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const data = updateTemplateSchema.parse(req.body);

    // Ownership is enforced in the WHERE, not checked-then-updated, so a
    // concurrent delete cannot race the guard. Editing a moderated-public
    // template pulls it back to private pending re-review.
    const result = await prisma.template.updateMany({
      where: { id: req.params['id'] as string, userId: req.user.id },
      data: { ...data, isPublic: false },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = await prisma.template.findUnique({
      where: { id: req.params['id'] as string },
      select: templateSelect,
    });
    res.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid template', details: error.errors });
      return;
    }
    logger.error({ err: error }, 'Failed to update template');
    res.status(500).json({ error: 'Failed to update template' });
  }
});

templatesRouter.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const result = await prisma.template.deleteMany({
      where: { id: req.params['id'] as string, userId: req.user.id },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete template');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});
