import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { enforceQuota, type RequestWithSubscription } from '../middleware/quotaEnforcement.js';
import { promptLogger } from '../utils/logger.js';
import { TARGET_MODEL_FAMILIES } from '../services/reflectionLoop/index.js';
import {
  enqueueReflectionJob,
  getReflectionJob,
  subscribeToReflectionJob,
  type ReflectionJobMode,
  type ReflectionJobStreamMessage,
} from '../services/reflectionJobService.js';

/**
 * Reflection-loop optimization surface (spec §1, §7, §8):
 *   POST   /               start one optimization job        → { jobId, mode }
 *   GET    /:jobId/stream  SSE progress + terminal result
 *   GET    /:jobId         poll fallback for clients without SSE
 *
 * App-tier gating only (Subscription, via enforceQuota) — this surface is not
 * part of the enterprise API (ApiSubscription) and never uses apiKeyAuth.
 */
export const optimizeRouter = Router();

// Unlike /prompts/enhance/stream (token stream, never idle), this stream can
// sit 10–20 s between stage events — long enough for proxies to reap it — so
// it emits SSE comment heartbeats on top of the shared event conventions.
const HEARTBEAT_INTERVAL_MS = 15_000;

// Feature flag (CLAUDE.md: risky paths ship behind flags). Read per request so
// the flag flips without a process restart; while disabled the surface stays
// dark — same 404 body as the app-level unknown-route handler, plus a code.
optimizeRouter.use((_req: Request, res: Response, next: NextFunction) => {
  if (process.env['REFLECTION_LOOP_ENABLED'] !== 'true') {
    res.status(404).json({ error: 'Not found', code: 'FEATURE_DISABLED' });
    return;
  }
  next();
});

optimizeRouter.use(authenticate);

const optimizeRequestSchema = z.object({
  raw_prompt: z.string().trim().min(1).max(8_000),
  goal: z.string().trim().max(2_000).optional(),
  target_model_family: z.enum(TARGET_MODEL_FAMILIES).optional(),
  variable_values: z
    .record(z.string().regex(/^[A-Za-z0-9_]{1,64}$/), z.string().max(4_000))
    .refine((values) => Object.keys(values).length <= 20, 'At most 20 variable values are allowed')
    .optional(),
});

// ============================================================================
// START OPTIMIZATION (one BullMQ job per optimization; inline without Redis)
// ============================================================================

optimizeRouter.post(
  '/',
  enforceQuota('enhance_prompt'),
  async (req: RequestWithSubscription, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = optimizeRequestSchema.parse(req.body);

      // §8 tier gate: FREE gets P0 + the single-pass fast path; PRO/PREMIUM
      // get the full loop. enforceQuota attached the Subscription-derived
      // tier (never ApiSubscription — separate system).
      const tier = req.subscription?.tier ?? 'FREE';
      const mode: ReflectionJobMode = tier === 'FREE' ? 'fast_path' : 'full_loop';

      const jobId = await enqueueReflectionJob({
        userId: req.user.id,
        mode,
        singlePassTier: req.subscription?.promptQuality ?? 'basic',
        rawPrompt: data.raw_prompt,
        goal: data.goal,
        targetModelFamily: data.target_model_family,
        variableValues: data.variable_values,
      });

      res.status(202).json({ jobId, mode });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      promptLogger.error({ err: error, userId: req.user?.id }, 'Failed to start reflection optimization');
      res.status(500).json({ error: 'Failed to start optimization' });
    }
  }
);

// ============================================================================
// STREAM PROGRESS (SSE — conventions match /prompts/enhance/stream)
// ============================================================================

optimizeRouter.get(
  '/:jobId/stream',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const jobId = req.params['jobId'];
      if (!jobId) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // Ownership before any SSE bytes: a non-owner gets a plain 404 JSON,
      // indistinguishable from a job that never existed.
      const snapshot = await getReflectionJob(jobId);
      if (!snapshot || snapshot.userId !== req.user.id) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let isEnded = false;
      let unsubscribe: (() => void) | null = null;
      let heartbeat: NodeJS.Timeout | null = null;

      const cleanup = (): void => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe) {
          const stop = unsubscribe;
          unsubscribe = null;
          stop();
        }
      };

      const writeEvent = (payload: Record<string, unknown>): void => {
        if (!isEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      const endStream = (withDone: boolean): void => {
        if (isEnded) {
          return;
        }
        isEnded = true;
        cleanup();
        if (withDone) {
          res.write('data: [DONE]\n\n');
        }
        res.end();
      };

      const onMessage = (message: ReflectionJobStreamMessage): void => {
        switch (message.type) {
          case 'progress':
            writeEvent({
              type: 'progress',
              phase: message.phase,
              label: message.label,
              rolloutsUsed: message.rolloutsUsed,
            });
            return;
          case 'result':
            writeEvent({ type: 'result', result: message.result });
            endStream(true);
            return;
          case 'error':
            // Mirrors enhance/stream onError: error event, then end (no [DONE]).
            writeEvent({ type: 'error', message: message.message });
            endStream(false);
            return;
        }
      };

      req.on('close', () => {
        isEnded = true;
        cleanup();
      });

      // SSE comments are protocol-safe and invisible to EventSource clients;
      // they only keep proxies from reaping a stream between stage events.
      heartbeat = setInterval(() => {
        if (!isEnded) {
          res.write(': heartbeat\n\n');
        }
      }, HEARTBEAT_INTERVAL_MS);

      const subscription = await subscribeToReflectionJob(jobId, onMessage);
      if (!subscription) {
        // Job evaporated between the ownership check and subscribing (TTL).
        writeEvent({ type: 'error', message: 'Optimization job not found' });
        endStream(false);
        return;
      }
      if (isEnded) {
        subscription();
        return;
      }
      unsubscribe = subscription;
    } catch (error) {
      promptLogger.error({ err: error }, 'Reflection stream error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream optimization' });
        return;
      }
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to stream optimization' })}\n\n`);
      res.end();
    }
  }
);

// ============================================================================
// POLL JOB STATE (fallback for clients without SSE)
// ============================================================================

optimizeRouter.get(
  '/:jobId',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const jobId = req.params['jobId'];
      if (!jobId) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const snapshot = await getReflectionJob(jobId);
      if (!snapshot || snapshot.userId !== req.user.id) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      res.json({
        jobId: snapshot.jobId,
        status: snapshot.status,
        progress: snapshot.progress,
        result: snapshot.result,
        error: snapshot.error,
      });
    } catch (error) {
      promptLogger.error({ err: error }, 'Failed to read reflection job');
      res.status(500).json({ error: 'Failed to read optimization job' });
    }
  }
);
