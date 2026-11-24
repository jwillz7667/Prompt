import { z } from 'zod';

const id = z.string().trim().min(1).max(64);

const pageLimit = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

const nonBlank = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0, 'must not be blank');

export const conversationParamsSchema = z.object({ id });
export const messageParamsSchema = z.object({ messageId: id });
export const regenerateParamsSchema = z.object({ id, messageId: id });

export const listConversationsQuerySchema = z.object({
  // Opaque (base64url) keyset cursor from a previous page's nextCursor.
  cursor: z.string().trim().min(1).max(256).optional(),
  limit: pageLimit(50, 30),
});

export const getConversationQuerySchema = z.object({
  before: id.optional(),
  limit: pageLimit(100, 50),
});

export const createConversationBodySchema = z.object({
  title: nonBlank(120).optional(),
  systemPrompt: z.string().max(4000).optional(),
});

export const updateConversationBodySchema = z
  .object({
    title: nonBlank(120).optional(),
    systemPrompt: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.systemPrompt !== undefined,
    'provide title or systemPrompt',
  );

export const sendMessageBodySchema = z.object({
  content: nonBlank(16_000),
  clientMessageId: z.uuid(),
});

export const REPORT_REASONS = ['harmful', 'inaccurate', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportMessageBodySchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(1000).optional(),
});

export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;
export type UpdateConversationBody = z.infer<typeof updateConversationBodySchema>;
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export type ReportMessageBody = z.infer<typeof reportMessageBodySchema>;
