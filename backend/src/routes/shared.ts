import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Public read-only access to shared prompts. No auth by design — the slug is
 * the capability (crypto-random, unguessable). Share creation/revocation is
 * owner-only and lives in routes/prompts.ts.
 */

export const sharedRouter = Router();

const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/);

sharedRouter.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = slugSchema.safeParse(req.params['slug']);
    if (!parsed.success) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const share = await prisma.sharedPrompt.findUnique({
      where: { slug: parsed.data },
      select: {
        id: true,
        isRevoked: true,
        createdAt: true,
        prompt: {
          select: {
            title: true,
            originalPrompt: true,
            enhancedPrompt: true,
            modality: true,
            model: true,
            createdAt: true,
          },
        },
      },
    });

    // Revoked and never-existed are indistinguishable on purpose.
    if (!share || share.isRevoked) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Fire-and-forget: a lost view increment is preferable to putting a
    // write on the read path's latency.
    void prisma.sharedPrompt
      .update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } })
      .catch((error) => logger.warn({ err: error }, 'Failed to increment share view count'));

    res.json({
      title: share.prompt.title,
      originalPrompt: share.prompt.originalPrompt,
      enhancedPrompt: share.prompt.enhancedPrompt,
      modality: share.prompt.modality,
      model: share.prompt.model,
      promptCreatedAt: share.prompt.createdAt,
      sharedAt: share.createdAt,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch shared prompt');
    res.status(500).json({ error: 'Failed to fetch shared prompt' });
  }
});
