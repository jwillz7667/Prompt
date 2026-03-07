import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const collectionRouter = Router();

// All collection routes require authentication
collectionRouter.use(authenticate);

// Validation schemas
const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#007AFF'),
  icon: z.string().max(50).default('folder.fill'),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
});

const addPromptsSchema = z.object({
  promptIds: z.array(z.string()).min(1).max(100),
});

// ============================================================================
// LIST COLLECTIONS
// ============================================================================

collectionRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const collections = await prisma.collection.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        icon: true,
        promptCount: true,
        createdAt: true,
      },
    });

    res.json({ collections });
  } catch (error) {
    console.error('List collections error:', error);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

// ============================================================================
// GET SINGLE COLLECTION WITH PROMPTS
// ============================================================================

collectionRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const collectionId = req.params.id as string;

    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        userId: req.user.id,
      },
      include: {
        prompts: {
          orderBy: { addedAt: 'desc' },
          select: {
            promptId: true,
            addedAt: true,
          },
        },
      },
    });

    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    // Fetch full prompt details
    const promptIds = collection.prompts.map((p) => p.promptId);
    const prompts = await prisma.prompt.findMany({
      where: {
        id: { in: promptIds },
        userId: req.user.id,
      },
      select: {
        id: true,
        originalPrompt: true,
        enhancedPrompt: true,
        model: true,
        totalTokens: true,
        title: true,
        tags: true,
        isFavorite: true,
        createdAt: true,
      },
    });

    res.json({
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        color: collection.color,
        icon: collection.icon,
        promptCount: collection.promptCount,
        createdAt: collection.createdAt,
      },
      prompts,
    });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

// ============================================================================
// CREATE COLLECTION
// ============================================================================

collectionRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = createCollectionSchema.parse(req.body);

    const collection = await prisma.collection.create({
      data: {
        userId: req.user.id,
        ...data,
      },
    });

    res.status(201).json({ collection });
  } catch (error) {
    console.error('Create collection error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

// ============================================================================
// UPDATE COLLECTION
// ============================================================================

collectionRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = updateCollectionSchema.parse(req.body);
    const collectionId = req.params.id as string;

    const result = await prisma.collection.updateMany({
      where: {
        id: collectionId,
        userId: req.user.id,
      },
      data,
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
    });

    res.json({ collection });
  } catch (error) {
    console.error('Update collection error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

// ============================================================================
// DELETE COLLECTION
// ============================================================================

collectionRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const collectionId = req.params.id as string;

    const result = await prisma.collection.deleteMany({
      where: {
        id: collectionId,
        userId: req.user.id,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete collection error:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

// ============================================================================
// ADD PROMPTS TO COLLECTION
// ============================================================================

collectionRouter.post('/:id/prompts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { promptIds } = addPromptsSchema.parse(req.body);
    const collectionId = req.params.id as string;

    // Verify collection ownership
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        userId: req.user.id,
      },
    });

    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    // Verify prompts belong to user
    const userPrompts = await prisma.prompt.findMany({
      where: {
        id: { in: promptIds },
        userId: req.user.id,
      },
      select: { id: true },
    });

    const validPromptIds = userPrompts.map((p) => p.id);

    // Create prompt-collection associations and update count atomically
    await prisma.$transaction(async (tx) => {
      await tx.promptCollection.createMany({
        data: validPromptIds.map((promptId) => ({
          promptId,
          collectionId,
        })),
        skipDuplicates: true,
      });

      const newCount = await tx.promptCollection.count({
        where: { collectionId },
      });

      await tx.collection.update({
        where: { id: collectionId },
        data: { promptCount: newCount },
      });
    });

    res.json({ success: true, addedCount: validPromptIds.length });
  } catch (error) {
    console.error('Add prompts to collection error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to add prompts to collection' });
  }
});

// ============================================================================
// REMOVE PROMPT FROM COLLECTION
// ============================================================================

collectionRouter.delete('/:id/prompts/:promptId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const collectionId = req.params.id as string;
    const promptId = req.params.promptId as string;

    // Verify collection ownership
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        userId: req.user.id,
      },
    });

    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    // Remove association and update count atomically
    await prisma.$transaction(async (tx) => {
      await tx.promptCollection.deleteMany({
        where: {
          promptId,
          collectionId,
        },
      });

      const newCount = await tx.promptCollection.count({
        where: { collectionId },
      });

      await tx.collection.update({
        where: { id: collectionId },
        data: { promptCount: newCount },
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove prompt from collection error:', error);
    res.status(500).json({ error: 'Failed to remove prompt from collection' });
  }
});
