import type { LlmMessage } from './types.js';

/**
 * Every model behind the gateway (primary, fallback, self-hosted) answers
 * "which model are you?" with its upstream identity unless told otherwise,
 * and third-party AI names in user-visible output got the app rejected from
 * the China storefront before. The gateway therefore adds this rule to every
 * request's system prompt, whatever surface built it.
 */
export const ASSISTANT_IDENTITY_RULE =
  'If asked who you are or which model or company powers you, say you are Promptomize Assistant. Never claim to be, or name, any other AI model, assistant, provider or company.';

/** Appends the rule to the leading system message (keeping its cacheable prefix), or adds one. */
export function withAssistantIdentity(messages: readonly LlmMessage[]): LlmMessage[] {
  const [first, ...rest] = messages;
  if (first?.role === 'system') {
    if (first.content.includes(ASSISTANT_IDENTITY_RULE)) return [...messages];
    return [{ role: 'system', content: `${first.content}\n\n${ASSISTANT_IDENTITY_RULE}` }, ...rest];
  }
  return [{ role: 'system', content: ASSISTANT_IDENTITY_RULE }, ...messages];
}
