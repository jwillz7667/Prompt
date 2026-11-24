import { z } from 'zod';

export interface ChatConfig {
  maxOutputTokens: number;
  contextTokenBudget: number;
  dailyMessageLimit: number;
  moderation: { isEnabled: boolean; apiKey: string | undefined; timeoutMs: number };
}

export class ChatConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid chat configuration: ${issues.join('; ')}`);
    this.name = 'ChatConfigError';
  }
}

const blankToUndefined = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const positiveInt = (fallback: number) =>
  blankToUndefined.pipe(
    z
      .string()
      .regex(/^\d+$/, 'must be a whole number')
      .transform(Number)
      .pipe(z.number().int().min(1))
      .optional()
      .transform((value) => value ?? fallback),
  );

const envSchema = z.object({
  CHAT_MAX_OUTPUT_TOKENS: positiveInt(2048),
  CHAT_CONTEXT_TOKEN_BUDGET: positiveInt(12_000),
  CHAT_DAILY_MESSAGE_LIMIT: positiveInt(150),
  CHAT_MODERATION_ENABLED: blankToUndefined.pipe(z.enum(['true', 'false']).optional()),
  OPENAI_API_KEY: blankToUndefined,
});

const MODERATION_TIMEOUT_MS = 2_000;

/** Pure parse of the chat environment; malformed values throw ChatConfigError (fail fast at boot). */
export function loadChatConfig(env: NodeJS.ProcessEnv): ChatConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ChatConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const values = parsed.data;
  return {
    maxOutputTokens: values.CHAT_MAX_OUTPUT_TOKENS,
    contextTokenBudget: values.CHAT_CONTEXT_TOKEN_BUDGET,
    dailyMessageLimit: values.CHAT_DAILY_MESSAGE_LIMIT,
    moderation: {
      isEnabled: values.CHAT_MODERATION_ENABLED !== 'false' && values.OPENAI_API_KEY !== undefined,
      apiKey: values.OPENAI_API_KEY,
      timeoutMs: MODERATION_TIMEOUT_MS,
    },
  };
}
