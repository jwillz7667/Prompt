import {
  ProviderError,
  toClientStreamError,
  type ClientStreamError,
  type LlmChatRequest,
  type LlmChatResult,
  type LlmStreamCallbacks,
} from '../llm/index.js';
import type { ChatConfig } from './config.js';
import {
  DEFAULT_CONVERSATION_TITLE,
  buildChatContext,
  deriveConversationTitle,
  toMessagePreview,
} from './context-builder.js';
import { ChatError } from './errors.js';
import type { FairUseLimiter, FairUseReservation } from './fair-use.js';
import {
  MINORS_REFUSAL_MESSAGE,
  SELF_HARM_SUPPORT_MESSAGE,
  type ModerateMessage,
  type ModerationVerdict,
} from './moderation.js';
import {
  DuplicateClientMessageError,
  decodeConversationCursor,
  encodeConversationCursor,
  type ChatMessageStatus,
  type ChatRepo,
  type ConversationRecord,
  type ConversationSummaryRecord,
  type MessageRecord,
} from './repo.js';
import type {
  CreateConversationBody,
  ReportMessageBody,
  SendMessageBody,
  UpdateConversationBody,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Client DTOs (camelCase; provider/model never leave the server)
// ---------------------------------------------------------------------------

export interface ConversationDto {
  id: string;
  title: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummaryDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
}

export type MessageStatusDto = 'complete' | 'stopped' | 'truncated' | 'failed';

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatusDto;
  createdAt: string;
}

export type ChatStreamEvent =
  | { type: 'start'; userMessageId: string; assistantMessageId: string }
  | { type: 'token'; content: string }
  | {
      type: 'complete';
      assistantMessageId: string;
      status: 'complete' | 'truncated';
      usage: { inputTokens: number; outputTokens: number };
      conversation: { id: string; title: string; updatedAt: string };
    }
  | ClientStreamError;

/** Transport for one streamed reply. `open` must be called before the first `send`. */
export interface ChatStreamSink {
  readonly signal: AbortSignal;
  open(): void;
  send(event: ChatStreamEvent): void;
}

export interface ChatLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface ChatServiceDeps {
  repo: ChatRepo;
  streamChat: (request: LlmChatRequest, callbacks: LlmStreamCallbacks) => Promise<LlmChatResult>;
  moderate: ModerateMessage;
  fairUse: FairUseLimiter;
  config: ChatConfig;
  logger: ChatLogger;
}

function statusToDto(status: ChatMessageStatus): MessageStatusDto {
  switch (status) {
    case 'COMPLETE':
      return 'complete';
    case 'STOPPED':
      return 'stopped';
    case 'TRUNCATED':
      return 'truncated';
    case 'FAILED':
      return 'failed';
  }
}

export function conversationToDto(record: ConversationRecord): ConversationDto {
  return {
    id: record.id,
    title: record.title,
    systemPrompt: record.systemPrompt,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function summaryToDto(record: ConversationSummaryRecord): ConversationSummaryDto {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessagePreview: record.lastMessagePreview,
  };
}

export function messageToDto(record: MessageRecord): MessageDto {
  return {
    id: record.id,
    role: record.role === 'USER' ? 'user' : 'assistant',
    content: record.content,
    status: statusToDto(record.status),
    createdAt: record.createdAt.toISOString(),
  };
}

const REPORT_REASON = {
  harmful: 'HARMFUL',
  inaccurate: 'INACCURATE',
  inappropriate: 'INAPPROPRIATE',
  other: 'OTHER',
} as const;

const FIXED_RESPONSES: Record<Exclude<ModerationVerdict, 'allow'>, string> = {
  refuse_minors: MINORS_REFUSAL_MESSAGE,
  self_harm_support: SELF_HARM_SUPPORT_MESSAGE,
};

interface TurnPlan {
  userId: string;
  conversation: ConversationRecord;
  userMessageId: string;
  assistantMessageId: string;
  newUserMessage: string;
  history: MessageRecord[];
  verdict: ModerationVerdict;
  reservation: FairUseReservation;
  /** Send: the user message is removed with a reply that never produced output, so the client can resend. */
  userMessageIdToDropOnSilentFailure?: string;
  /** Regenerate: the reply being replaced; removed once the new one has any output. */
  replacedMessageId?: string;
  /** Set once the reply's rows are committed; nothing may be discarded after that. */
  isReplyCommitted?: boolean;
}

export function createChatService(deps: ChatServiceDeps) {
  const { repo, logger } = deps;

  const reserveFairUse = async (userId: string): Promise<FairUseReservation> => {
    const result = await deps.fairUse.reserve(userId);
    if (!result.isAllowed) {
      logger.warn({ userId }, 'Chat daily fair-use limit reached');
      throw new ChatError('FAIR_USE_LIMIT', { resetAt: result.resetAt });
    }
    return result.reservation;
  };

  /**
   * A turn whose stream already started (the client holds its message ids)
   * but produced no output. A send keeps the user's message and marks the
   * empty reply FAILED so the client can retry it with regenerate; a
   * regenerate drops its placeholder and keeps the reply it was replacing.
   */
  const failTurnWithoutOutput = async (plan: TurnPlan): Promise<void> => {
    await plan.reservation.release();
    if (plan.replacedMessageId) {
      await repo.deleteMessages(plan.conversation.id, [plan.assistantMessageId]);
      return;
    }
    await repo.finalizeAssistant(plan.assistantMessageId, { content: '', status: 'FAILED' });
  };

  /** Removes rows of a turn the client never learned about and hands the fair-use slot back. */
  const discardSilentTurn = async (plan: TurnPlan): Promise<void> => {
    await plan.reservation.release();
    await repo.deleteMessages(
      plan.conversation.id,
      [plan.assistantMessageId, plan.userMessageIdToDropOnSilentFailure].filter(
        (id): id is string => id !== undefined,
      ),
    );
  };

  const persistReply = async (
    plan: TurnPlan,
    reply: {
      content: string;
      status: ChatMessageStatus;
      result?: LlmChatResult;
      shouldAutoTitle: boolean;
    },
  ): Promise<{ id: string; title: string; updatedAt: Date }> => {
    let title: string | undefined;
    if (reply.shouldAutoTitle && plan.conversation.title === DEFAULT_CONVERSATION_TITLE) {
      const firstUserMessage = await repo.findFirstUserMessage(plan.conversation.id);
      title = firstUserMessage
        ? (deriveConversationTitle(firstUserMessage) ?? undefined)
        : undefined;
    }
    const conversation = await repo.commitReply({
      conversationId: plan.conversation.id,
      assistantMessageId: plan.assistantMessageId,
      finalization: {
        content: reply.content,
        status: reply.status,
        inputTokens: reply.result?.usage.inputTokens,
        outputTokens: reply.result?.usage.outputTokens,
        provider: reply.result?.provider,
        model: reply.result?.model,
      },
      ...(plan.replacedMessageId ? { replacedMessageId: plan.replacedMessageId } : {}),
      touch: { lastMessagePreview: toMessagePreview(reply.content), ...(title ? { title } : {}) },
    });
    plan.isReplyCommitted = true;
    return conversation;
  };

  const sendComplete = (
    sink: ChatStreamSink,
    plan: TurnPlan,
    status: 'complete' | 'truncated',
    usage: { inputTokens: number; outputTokens: number },
    conversation: { id: string; title: string; updatedAt: Date },
  ): void => {
    sink.send({
      type: 'complete',
      assistantMessageId: plan.assistantMessageId,
      status,
      usage,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt.toISOString(),
      },
    });
  };

  const runFixedResponse = async (
    plan: TurnPlan,
    verdict: Exclude<ModerationVerdict, 'allow'>,
    sink: ChatStreamSink,
  ): Promise<void> => {
    const content = FIXED_RESPONSES[verdict];
    logger.warn(
      { userId: plan.userId, conversationId: plan.conversation.id, verdict },
      'Chat message answered by moderation without calling the model',
    );
    sink.send({ type: 'token', content });
    // Flagged text never becomes a conversation title.
    const conversation = await persistReply(plan, {
      content,
      status: 'COMPLETE',
      shouldAutoTitle: false,
    });
    sendComplete(sink, plan, 'complete', { inputTokens: 0, outputTokens: 0 }, conversation);
  };

  const runModelTurn = async (plan: TurnPlan, sink: ChatStreamSink): Promise<void> => {
    const messages = buildChatContext({
      customInstructions: plan.conversation.systemPrompt,
      history: plan.history,
      newUserMessage: plan.newUserMessage,
      tokenBudget: deps.config.contextTokenBudget,
    });

    let content = '';
    let result: LlmChatResult;
    try {
      result = await deps.streamChat(
        {
          messages,
          maxTokens: deps.config.maxOutputTokens,
          reasoning: 'off',
          signal: sink.signal,
          purpose: 'chat',
        },
        {
          onToken: (token) => {
            content += token;
            sink.send({ type: 'token', content: token });
          },
        },
      );
    } catch (error) {
      if (sink.signal.aborted) {
        await handleClientAbort(plan, content);
        return;
      }
      logger.error(
        {
          err: error,
          userId: plan.userId,
          conversationId: plan.conversation.id,
          hasOutput: content.length > 0,
        },
        'Chat reply failed',
      );
      if (content.length === 0) {
        await failTurnWithoutOutput(plan);
      } else {
        await plan.reservation.release();
        await persistReply(plan, { content, status: 'FAILED', shouldAutoTitle: false });
      }
      sink.send(toClientStreamError(error));
      return;
    }

    if (result.content.length === 0) {
      const error = new ProviderError({
        kind: result.finishReason === 'content_filter' ? 'content_filter' : 'interrupted',
        provider: result.provider,
        message: `provider finished with no content (finishReason=${result.finishReason})`,
      });
      logger.error(
        { err: error, userId: plan.userId, conversationId: plan.conversation.id },
        'Chat reply was empty',
      );
      await failTurnWithoutOutput(plan);
      sink.send(toClientStreamError(error));
      return;
    }

    // A filtered or length-capped answer is still useful; the client marks it as cut off.
    const isTruncated =
      result.finishReason === 'length' || result.finishReason === 'content_filter';
    const conversation = await persistReply(plan, {
      content: result.content,
      status: isTruncated ? 'TRUNCATED' : 'COMPLETE',
      result,
      shouldAutoTitle: true,
    });
    sendComplete(
      sink,
      plan,
      isTruncated ? 'truncated' : 'complete',
      { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      conversation,
    );
  };

  const handleClientAbort = async (plan: TurnPlan, content: string): Promise<void> => {
    logger.info(
      { userId: plan.userId, conversationId: plan.conversation.id, hasOutput: content.length > 0 },
      'Chat reply stopped by client',
    );
    if (content.length === 0) {
      // The user deliberately stopped: keep their message, drop only the empty reply.
      await plan.reservation.release();
      await repo.deleteMessages(plan.conversation.id, [plan.assistantMessageId]);
      return;
    }
    await persistReply(plan, { content, status: 'STOPPED', shouldAutoTitle: true });
  };

  /** Streams one turn; never throws for provider failures (they become an error event). */
  const runTurn = async (plan: TurnPlan, sink: ChatStreamSink): Promise<void> => {
    sink.open();
    sink.send({
      type: 'start',
      userMessageId: plan.userMessageId,
      assistantMessageId: plan.assistantMessageId,
    });
    if (plan.verdict === 'allow') await runModelTurn(plan, sink);
    else await runFixedResponse(plan, plan.verdict, sink);
  };

  return {
    async listConversations(
      userId: string,
      options: { cursor?: string; limit: number },
    ): Promise<{ conversations: ConversationSummaryDto[]; nextCursor: string | null }> {
      const cursor = options.cursor ? decodeConversationCursor(options.cursor) : undefined;
      if (cursor === null) throw new ChatError('INVALID_CURSOR');
      const page = await repo.listConversations(userId, {
        limit: options.limit,
        ...(cursor ? { cursor } : {}),
      });
      const last = page.items.at(-1);
      return {
        conversations: page.items.map(summaryToDto),
        nextCursor:
          page.hasMore && last
            ? encodeConversationCursor({ updatedAt: last.updatedAt, id: last.id })
            : null,
      };
    },

    async createConversation(
      userId: string,
      body: CreateConversationBody,
    ): Promise<ConversationDto> {
      return conversationToDto(await repo.createConversation(userId, body));
    },

    async getConversation(
      userId: string,
      conversationId: string,
      options: { before?: string; limit: number },
    ): Promise<{ conversation: ConversationDto; messages: MessageDto[]; hasMore: boolean }> {
      const conversation = await repo.findConversation(userId, conversationId);
      if (!conversation) throw new ChatError('NOT_FOUND');
      const page = await repo.listMessages(userId, conversationId, options);
      if (!page) throw new ChatError('INVALID_CURSOR');
      return {
        conversation: conversationToDto(conversation),
        messages: page.items.map(messageToDto),
        hasMore: page.hasMore,
      };
    },

    async updateConversation(
      userId: string,
      conversationId: string,
      body: UpdateConversationBody,
    ): Promise<ConversationDto> {
      const updated = await repo.updateConversation(userId, conversationId, body);
      if (!updated) throw new ChatError('NOT_FOUND');
      return conversationToDto(updated);
    },

    async deleteConversation(userId: string, conversationId: string): Promise<void> {
      if (!(await repo.deleteConversation(userId, conversationId))) {
        throw new ChatError('NOT_FOUND');
      }
    },

    async reportMessage(userId: string, messageId: string, body: ReportMessageBody): Promise<void> {
      const message = await repo.findReportableMessage(userId, messageId);
      if (!message) throw new ChatError('NOT_FOUND');
      const reportId = await repo.createReport({
        userId,
        messageId: message.id,
        messageContent: message.content,
        reason: REPORT_REASON[body.reason],
        details: body.details,
      });
      // Surfaces in log alerting so a human reviews reported AI output promptly.
      logger.warn({ userId, messageId, reportId, reason: body.reason }, 'Chat message reported');
    },

    /**
     * Throws ChatError before `sink.open()` for request-level failures (404,
     * 409, 429), so the route can still answer with a plain HTTP status.
     */
    async streamReply(
      userId: string,
      conversationId: string,
      body: SendMessageBody,
      sink: ChatStreamSink,
    ): Promise<void> {
      const conversation = await repo.findConversation(userId, conversationId);
      if (!conversation) throw new ChatError('NOT_FOUND');
      if (await repo.hasClientMessage(conversation.id, body.clientMessageId)) {
        throw new ChatError('DUPLICATE_MESSAGE');
      }

      const reservation = await reserveFairUse(userId);
      let plan: TurnPlan;
      try {
        const [verdict, history] = await Promise.all([
          deps.moderate(body.content, sink.signal),
          repo.recentHistory(conversation.id),
        ]);
        const exchange = await repo
          .createExchange(conversation.id, body.content, body.clientMessageId)
          .catch((error: unknown) => {
            throw error instanceof DuplicateClientMessageError
              ? new ChatError('DUPLICATE_MESSAGE')
              : error;
          });
        plan = {
          userId,
          conversation,
          ...exchange,
          newUserMessage: body.content,
          history,
          verdict,
          reservation,
          userMessageIdToDropOnSilentFailure: exchange.userMessageId,
        };
      } catch (error) {
        await reservation.release();
        throw error;
      }
      await runTurnSafely(plan, sink);
    },

    async streamRegeneration(
      userId: string,
      conversationId: string,
      messageId: string,
      sink: ChatStreamSink,
    ): Promise<void> {
      const conversation = await repo.findConversation(userId, conversationId);
      if (!conversation) throw new ChatError('NOT_FOUND');
      const target = await repo.findAssistantMessage(userId, conversation.id, messageId);
      // An empty FAILED reply is a retry target; any other empty row is an in-flight placeholder.
      if (!target || (target.content.length === 0 && target.status !== 'FAILED')) {
        throw new ChatError('NOT_FOUND');
      }
      // Newest message of any role: a later user message (for example one
      // whose reply was stopped before any output) means this reply is stale,
      // and answering it again would land after that message.
      const latest = await repo.findLatestMessage(conversation.id);
      if (latest?.id !== target.id) throw new ChatError('NOT_LATEST_MESSAGE');

      const earlier = await repo.recentHistory(conversation.id, target);
      let promptIndex = earlier.length - 1;
      while (promptIndex >= 0 && earlier[promptIndex]?.role !== 'USER') promptIndex -= 1;
      const prompt = earlier[promptIndex];
      if (!prompt) throw new ChatError('NOT_FOUND');

      const reservation = await reserveFairUse(userId);
      let plan: TurnPlan;
      try {
        // Re-checked: a refused message must never reach the model through regenerate.
        const verdict = await deps.moderate(prompt.content, sink.signal);
        const assistantMessageId = await repo.createAssistantPlaceholder(conversation.id);
        plan = {
          userId,
          conversation,
          userMessageId: prompt.id,
          assistantMessageId,
          newUserMessage: prompt.content,
          history: earlier.slice(0, promptIndex),
          verdict,
          reservation,
          replacedMessageId: target.id,
        };
      } catch (error) {
        await reservation.release();
        throw error;
      }
      await runTurnSafely(plan, sink);
    },
  };

  /**
   * Last-resort guard for unexpected failures (database, serialization) after
   * the turn rows exist: free the slot, clean up, and end the stream with an
   * error event instead of leaving the client hanging.
   */
  async function runTurnSafely(plan: TurnPlan, sink: ChatStreamSink): Promise<void> {
    let hasOpened = false;
    const trackedSink: ChatStreamSink = {
      signal: sink.signal,
      open: () => {
        hasOpened = true;
        sink.open();
      },
      send: (event) => sink.send(event),
    };
    try {
      await runTurn(plan, trackedSink);
    } catch (error) {
      logger.error(
        {
          err: error,
          userId: plan.userId,
          conversationId: plan.conversation.id,
          isReplyCommitted: plan.isReplyCommitted === true,
        },
        'Chat turn failed unexpectedly',
      );
      // A committed reply was delivered and saved; never delete it (or the
      // user's message) because a later step failed.
      if (!plan.isReplyCommitted) {
        const cleanup = hasOpened ? failTurnWithoutOutput(plan) : discardSilentTurn(plan);
        await cleanup.catch((cleanupError: unknown) => {
          logger.warn({ err: cleanupError }, 'Failed to clean up chat turn');
        });
      }
      if (!hasOpened) trackedSink.open();
      trackedSink.send(toClientStreamError(error));
    }
  }
}

export type ChatService = ReturnType<typeof createChatService>;
