import { Router, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';

import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { beginSse, endSse, toClientStreamError, writeSse } from '../llm/index.js';
import { ChatError } from './errors.js';
import type { ChatLogger, ChatService, ChatStreamSink } from './service.js';
import {
  conversationParamsSchema,
  createConversationBodySchema,
  getConversationQuerySchema,
  listConversationsQuerySchema,
  messageParamsSchema,
  regenerateParamsSchema,
  reportMessageBodySchema,
  sendMessageBodySchema,
  updateConversationBodySchema,
} from './schemas.js';

type AuthedHandler = (req: AuthenticatedRequest, res: Response, userId: string) => Promise<void>;

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ChatError('VALIDATION_ERROR');
  return result.data;
}

// `res` close with an unfinished response is the reliable disconnect signal;
// `req` close fires as soon as the request body has been consumed.
function createSseSink(res: Response): ChatStreamSink {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return {
    signal: controller.signal,
    open: () => beginSse(res),
    send: (event) => {
      writeSse(res, event);
    },
  };
}

export function createChatRouter(deps: { service: ChatService; logger: ChatLogger }): Router {
  const { service, logger } = deps;
  const router = Router();

  const handle =
    (handler: AuthedHandler): RequestHandler =>
    (req: AuthenticatedRequest, res) => {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated', code: 'TOKEN_MISSING' });
        return;
      }
      handler(req, res, userId).catch((error: unknown) => {
        if (error instanceof ChatError) {
          if (!res.headersSent) res.status(error.httpStatus).json(error.toBody());
          return;
        }
        logger.error({ err: error, path: req.path, userId }, 'Chat request failed');
        if (res.headersSent) return;
        res
          .status(500)
          .json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' });
      });
    };

  /**
   * Request-level failures (validation, 404, 409, 429) are thrown before the
   * service opens the stream and become plain JSON responses. Once SSE is
   * open, every outcome ends with `data: [DONE]`.
   */
  const handleStream = (
    run: (req: AuthenticatedRequest, userId: string, sink: ChatStreamSink) => Promise<void>,
  ) =>
    handle(async (req, res, userId) => {
      const sink = createSseSink(res);
      try {
        await run(req, userId, sink);
      } catch (error) {
        // The client left before the stream opened; nothing to answer or log.
        if (sink.signal.aborted && !res.headersSent) return;
        if (!res.headersSent) throw error;
        logger.error({ err: error, path: req.path, userId }, 'Chat stream failed');
        writeSse(res, toClientStreamError(error));
      }
      if (res.headersSent && !res.writableEnded) {
        res.write('data: [DONE]\n\n');
        endSse(res);
      }
    });

  router.use(authenticate);

  router.get(
    '/conversations',
    handle(async (req, res, userId) => {
      const query = parse(listConversationsQuerySchema, req.query);
      res.json(await service.listConversations(userId, query));
    }),
  );

  router.post(
    '/conversations',
    handle(async (req, res, userId) => {
      const body = parse(createConversationBodySchema, req.body);
      res.status(201).json({ conversation: await service.createConversation(userId, body) });
    }),
  );

  router.get(
    '/conversations/:id',
    handle(async (req, res, userId) => {
      const { id } = parse(conversationParamsSchema, req.params);
      const query = parse(getConversationQuerySchema, req.query);
      res.json(await service.getConversation(userId, id, query));
    }),
  );

  router.patch(
    '/conversations/:id',
    handle(async (req, res, userId) => {
      const { id } = parse(conversationParamsSchema, req.params);
      const body = parse(updateConversationBodySchema, req.body);
      res.json({ conversation: await service.updateConversation(userId, id, body) });
    }),
  );

  router.delete(
    '/conversations/:id',
    handle(async (req, res, userId) => {
      const { id } = parse(conversationParamsSchema, req.params);
      await service.deleteConversation(userId, id);
      res.status(204).end();
    }),
  );

  router.post(
    '/conversations/:id/messages/stream',
    requireEntitlement,
    handleStream(async (req, userId, sink) => {
      const { id } = parse(conversationParamsSchema, req.params);
      const body = parse(sendMessageBodySchema, req.body);
      await service.streamReply(userId, id, body, sink);
    }),
  );

  router.post(
    '/conversations/:id/messages/:messageId/regenerate/stream',
    requireEntitlement,
    handleStream(async (req, userId, sink) => {
      const { id, messageId } = parse(regenerateParamsSchema, req.params);
      await service.streamRegeneration(userId, id, messageId, sink);
    }),
  );

  // Deliberately not entitlement-gated: a lapsed subscriber must still be able
  // to report AI output they already received (App Store guideline 1.2).
  router.post(
    '/messages/:messageId/report',
    handle(async (req, res, userId) => {
      const { messageId } = parse(messageParamsSchema, req.params);
      const body = parse(reportMessageBodySchema, req.body);
      await service.reportMessage(userId, messageId, body);
      res.status(201).json({ reported: true });
    }),
  );

  return router;
}
