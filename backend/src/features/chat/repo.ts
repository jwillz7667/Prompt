import {
  Prisma,
  type ChatMessageStatus,
  type ChatReportReason,
  type ChatRole,
  type PrismaClient,
} from '@prisma/client';

/**
 * Every query that can be reached with a client-supplied id filters by the
 * owning userId, so tenant isolation holds even if a handler forgets a check.
 * Methods taking a bare conversationId are only called with an id that a
 * userId-scoped lookup already returned.
 */

const conversationSelect = {
  id: true,
  title: true,
  systemPrompt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChatConversationSelect;

const conversationSummarySelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  lastMessagePreview: true,
} satisfies Prisma.ChatConversationSelect;

const messageSelect = {
  id: true,
  role: true,
  content: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

export type ConversationRecord = Prisma.ChatConversationGetPayload<{
  select: typeof conversationSelect;
}>;
export type ConversationSummaryRecord = Prisma.ChatConversationGetPayload<{
  select: typeof conversationSummarySelect;
}>;
export type MessageRecord = Prisma.ChatMessageGetPayload<{ select: typeof messageSelect }>;

export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

export class DuplicateClientMessageError extends Error {
  constructor() {
    super('clientMessageId already used in this conversation');
    this.name = 'DuplicateClientMessageError';
  }
}

export interface AssistantFinalization {
  content: string;
  status: ChatMessageStatus;
  inputTokens?: number;
  outputTokens?: number;
  provider?: string;
  model?: string;
}

/**
 * Rows that exist only while a reply streams: empty assistant messages that
 * have not been marked FAILED. A FAILED empty reply is a real, visible row the
 * client can retry (regenerate) after the stream failed before any output.
 */
const notPlaceholder: Prisma.ChatMessageWhereInput = {
  NOT: { role: 'ASSISTANT', content: '', status: { not: 'FAILED' } },
};

/** Assistant rows with actual output (reportable content). */
const hasOutput: Prisma.ChatMessageWhereInput = { NOT: { role: 'ASSISTANT', content: '' } };

export interface ConversationCursor {
  updatedAt: Date;
  id: string;
}

/**
 * Opaque keyset cursor. It carries the anchor's (updatedAt, id) instead of
 * re-reading the anchor row, whose updatedAt moves whenever it gets a reply
 * and which may be deleted between pages.
 */
export function encodeConversationCursor(cursor: ConversationCursor): string {
  return Buffer.from(
    JSON.stringify({ u: cursor.updatedAt.toISOString(), i: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeConversationCursor(raw: string): ConversationCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const updatedAt = Reflect.get(parsed, 'u');
    const id = Reflect.get(parsed, 'i');
    if (typeof updatedAt !== 'string' || typeof id !== 'string' || id.length === 0) return null;
    const date = new Date(updatedAt);
    return Number.isNaN(date.getTime()) ? null : { updatedAt: date, id };
  } catch {
    return null;
  }
}

export interface ReplyCommit {
  conversationId: string;
  assistantMessageId: string;
  finalization: AssistantFinalization;
  /** Regenerate: the reply being replaced, removed in the same transaction. */
  replacedMessageId?: string;
  touch: { lastMessagePreview: string; title?: string };
}

// Bounds the history read per turn; the token budget trims further.
const MAX_HISTORY_MESSAGES = 200;

export function createChatRepo(db: PrismaClient) {
  return {
    /** Keyset page ordered by (updatedAt desc, id desc), continuing strictly after `cursor`. */
    async listConversations(
      userId: string,
      options: { cursor?: ConversationCursor; limit: number },
    ): Promise<Page<ConversationSummaryRecord>> {
      const anchor = options.cursor;
      const keyset: Prisma.ChatConversationWhereInput = anchor
        ? {
            OR: [
              { updatedAt: { lt: anchor.updatedAt } },
              { updatedAt: anchor.updatedAt, id: { lt: anchor.id } },
            ],
          }
        : {};
      const rows = await db.chatConversation.findMany({
        where: { userId, ...keyset },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: options.limit + 1,
        select: conversationSummarySelect,
      });
      return { items: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
    },

    createConversation(
      userId: string,
      data: { title?: string; systemPrompt?: string },
    ): Promise<ConversationRecord> {
      return db.chatConversation.create({
        data: {
          userId,
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          systemPrompt: data.systemPrompt?.trim() ? data.systemPrompt : null,
        },
        select: conversationSelect,
      });
    },

    findConversation(userId: string, conversationId: string): Promise<ConversationRecord | null> {
      return db.chatConversation.findFirst({
        where: { id: conversationId, userId },
        select: conversationSelect,
      });
    },

    async updateConversation(
      userId: string,
      conversationId: string,
      data: { title?: string; systemPrompt?: string | null },
    ): Promise<ConversationRecord | null> {
      const { count } = await db.chatConversation.updateMany({
        where: { id: conversationId, userId },
        data: {
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          ...(data.systemPrompt !== undefined
            ? { systemPrompt: data.systemPrompt?.trim() ? data.systemPrompt : null }
            : {}),
        },
      });
      if (count === 0) return null;
      return db.chatConversation.findFirst({
        where: { id: conversationId, userId },
        select: conversationSelect,
      });
    },

    async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
      const { count } = await db.chatConversation.deleteMany({
        where: { id: conversationId, userId },
      });
      return count > 0;
    },

    /** Newest-first keyset page, returned oldest-first; `null` when `before` is not in this conversation. */
    async listMessages(
      userId: string,
      conversationId: string,
      options: { before?: string; limit: number },
    ): Promise<Page<MessageRecord> | null> {
      let keyset: Prisma.ChatMessageWhereInput = {};
      if (options.before) {
        const anchor = await db.chatMessage.findFirst({
          where: { id: options.before, conversationId, conversation: { userId } },
          select: { id: true, createdAt: true },
        });
        if (!anchor) return null;
        keyset = {
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { lt: anchor.id } },
          ],
        };
      }
      const rows = await db.chatMessage.findMany({
        where: { conversationId, conversation: { userId }, AND: [notPlaceholder, keyset] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: options.limit + 1,
        select: messageSelect,
      });
      return {
        items: rows.slice(0, options.limit).reverse(),
        hasMore: rows.length > options.limit,
      };
    },

    async hasClientMessage(conversationId: string, clientMessageId: string): Promise<boolean> {
      const row = await db.chatMessage.findUnique({
        where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
        select: { id: true },
      });
      return row !== null;
    },

    /** Most recent messages strictly before `before` (or all), oldest first, placeholders excluded. */
    async recentHistory(
      conversationId: string,
      before?: { createdAt: Date; id: string },
    ): Promise<MessageRecord[]> {
      const keyset: Prisma.ChatMessageWhereInput = before
        ? {
            OR: [
              { createdAt: { lt: before.createdAt } },
              { createdAt: before.createdAt, id: { lt: before.id } },
            ],
          }
        : {};
      const rows = await db.chatMessage.findMany({
        where: { conversationId, AND: [notPlaceholder, keyset] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_HISTORY_MESSAGES,
        select: messageSelect,
      });
      return rows.reverse();
    },

    /**
     * Inserts the user message and an empty assistant placeholder in one
     * transaction. The placeholder is stamped 1ms later so (createdAt, id)
     * ordering never depends on cuid ordering within a millisecond.
     */
    async createExchange(
      conversationId: string,
      content: string,
      clientMessageId: string,
    ): Promise<{ userMessageId: string; assistantMessageId: string }> {
      const now = Date.now();
      try {
        const [user, assistant] = await db.$transaction([
          db.chatMessage.create({
            data: {
              conversationId,
              role: 'USER',
              content,
              status: 'COMPLETE',
              clientMessageId,
              createdAt: new Date(now),
            },
            select: { id: true },
          }),
          db.chatMessage.create({
            data: {
              conversationId,
              role: 'ASSISTANT',
              content: '',
              status: 'STOPPED',
              createdAt: new Date(now + 1),
            },
            select: { id: true },
          }),
        ]);
        return { userMessageId: user.id, assistantMessageId: assistant.id };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new DuplicateClientMessageError();
        }
        throw error;
      }
    },

    async createAssistantPlaceholder(conversationId: string): Promise<string> {
      const row = await db.chatMessage.create({
        data: { conversationId, role: 'ASSISTANT', content: '', status: 'STOPPED' },
        select: { id: true },
      });
      return row.id;
    },

    async finalizeAssistant(messageId: string, data: AssistantFinalization): Promise<void> {
      await db.chatMessage.update({
        where: { id: messageId },
        data: {
          content: data.content,
          status: data.status,
          inputTokens: data.inputTokens ?? null,
          outputTokens: data.outputTokens ?? null,
          provider: data.provider ?? null,
          model: data.model ?? null,
        },
      });
    },

    /**
     * Finalizes a reply, removes the reply it replaces and bumps the
     * conversation atomically, so a failure part-way can never leave a
     * delivered reply half-saved (or the replaced one already gone).
     */
    commitReply(commit: ReplyCommit): Promise<{ id: string; title: string; updatedAt: Date }> {
      const { finalization } = commit;
      return db.$transaction(async (tx) => {
        await tx.chatMessage.update({
          where: { id: commit.assistantMessageId },
          data: {
            content: finalization.content,
            status: finalization.status,
            inputTokens: finalization.inputTokens ?? null,
            outputTokens: finalization.outputTokens ?? null,
            provider: finalization.provider ?? null,
            model: finalization.model ?? null,
          },
        });
        if (commit.replacedMessageId) {
          await tx.chatMessage.deleteMany({
            where: { conversationId: commit.conversationId, id: commit.replacedMessageId },
          });
        }
        return tx.chatConversation.update({
          where: { id: commit.conversationId },
          data: commit.touch,
          select: { id: true, title: true, updatedAt: true },
        });
      });
    },

    async deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
      if (messageIds.length === 0) return;
      await db.chatMessage.deleteMany({ where: { conversationId, id: { in: messageIds } } });
    },

    findAssistantMessage(
      userId: string,
      conversationId: string,
      messageId: string,
    ): Promise<MessageRecord | null> {
      return db.chatMessage.findFirst({
        where: { id: messageId, conversationId, role: 'ASSISTANT', conversation: { userId } },
        select: messageSelect,
      });
    },

    /** Newest visible message of any role; regenerate is only valid on this one. */
    findLatestMessage(conversationId: string): Promise<MessageRecord | null> {
      return db.chatMessage.findFirst({
        where: { conversationId, AND: [notPlaceholder] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: messageSelect,
      });
    },

    async findFirstUserMessage(conversationId: string): Promise<string | null> {
      const row = await db.chatMessage.findFirst({
        where: { conversationId, role: 'USER' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { content: true },
      });
      return row?.content ?? null;
    },

    findReportableMessage(
      userId: string,
      messageId: string,
    ): Promise<{ id: string; content: string } | null> {
      return db.chatMessage.findFirst({
        where: {
          id: messageId,
          role: 'ASSISTANT',
          conversation: { userId },
          AND: [hasOutput],
        },
        select: { id: true, content: true },
      });
    },

    /**
     * The reported text is copied onto the report: regenerating or deleting
     * the conversation removes the message, and the report must still reach
     * human review with what the user saw.
     */
    async createReport(data: {
      userId: string;
      messageId: string;
      messageContent: string;
      reason: ChatReportReason;
      details?: string;
    }): Promise<string> {
      const row = await db.chatMessageReport.create({
        data: {
          userId: data.userId,
          messageId: data.messageId,
          messageContent: data.messageContent,
          reason: data.reason,
          details: data.details?.trim() ? data.details.trim() : null,
        },
        select: { id: true },
      });
      return row.id;
    },

    /** Fair-use fallback when Redis is down; walks the per-user conversation index then each conversation's message index. */
    countUserMessagesSince(userId: string, since: Date): Promise<number> {
      return db.chatMessage.count({
        where: { role: 'USER', createdAt: { gte: since }, conversation: { userId } },
      });
    },
  };
}

export type ChatRepo = ReturnType<typeof createChatRepo>;
export type { ChatMessageStatus, ChatReportReason, ChatRole };
