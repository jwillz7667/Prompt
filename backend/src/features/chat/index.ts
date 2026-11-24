import type { Router } from 'express';

import { createLogger } from '../../utils/logger.js';
import { prisma } from '../../utils/prisma.js';
import { getRedis, isRedisAvailable } from '../../utils/redis.js';
import { streamChat } from '../llm/index.js';
import { loadChatConfig, type ChatConfig } from './config.js';
import { createFairUseLimiter, isFairUseCounterClient } from './fair-use.js';
import { createModerator, type ModerateMessage } from './moderation.js';
import { createChatRepo } from './repo.js';
import { createChatRouter } from './routes.js';
import { createChatService, type ChatServiceDeps } from './service.js';

export { ChatConfigError, loadChatConfig, type ChatConfig } from './config.js';
export { ChatError, type ChatErrorCode } from './errors.js';
export {
  CHAT_SYSTEM_PROMPT,
  DEFAULT_CONVERSATION_TITLE,
  buildChatContext,
  deriveConversationTitle,
  estimateTokens,
} from './context-builder.js';
export {
  MINORS_REFUSAL_MESSAGE,
  SELF_HARM_SUPPORT_MESSAGE,
  createModerator,
  verdictFromCategories,
  type ModerateMessage,
  type ModerationVerdict,
} from './moderation.js';
export { chatUsageKey, createFairUseLimiter, type FairUseLimiter } from './fair-use.js';
export { createChatRepo, type ChatRepo } from './repo.js';
export { createChatRouter } from './routes.js';
export {
  createChatService,
  type ChatService,
  type ChatServiceDeps,
  type ChatStreamEvent,
} from './service.js';

const chatLogger = createLogger({ module: 'chat' });

/**
 * Wires the chat feature against the process-wide Prisma client, Redis and
 * LLM gateway. Every dependency can be overridden (tests swap the moderator
 * or config without touching process.env).
 */
export function buildChatRouter(
  overrides: Partial<Omit<ChatServiceDeps, 'config'>> & { config?: ChatConfig } = {},
): Router {
  const config = overrides.config ?? loadChatConfig(process.env);
  const repo = overrides.repo ?? createChatRepo(prisma);
  const moderate: ModerateMessage =
    overrides.moderate ??
    createModerator({
      isEnabled: config.moderation.isEnabled,
      apiKey: config.moderation.apiKey,
      timeoutMs: config.moderation.timeoutMs,
      logger: chatLogger,
    });
  const service = createChatService({
    repo,
    config,
    moderate,
    streamChat: overrides.streamChat ?? streamChat,
    fairUse:
      overrides.fairUse ??
      createFairUseLimiter({
        dailyLimit: config.dailyMessageLimit,
        resolveClient: () => {
          if (!isRedisAvailable()) return undefined;
          const client = getRedis();
          return isFairUseCounterClient(client) ? client : undefined;
        },
        countMessagesSince: (userId, since) => repo.countUserMessagesSince(userId, since),
        logger: chatLogger,
      }),
    logger: overrides.logger ?? chatLogger,
  });
  return createChatRouter({ service, logger: overrides.logger ?? chatLogger });
}
