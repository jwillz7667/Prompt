import type { LlmMessage } from '../llm/index.js';

/**
 * Identical for every conversation and always the first bytes of the request,
 * so providers with automatic prefix caching bill it at the cached rate.
 * Per-conversation instructions are appended after it, never interleaved.
 */
export const CHAT_SYSTEM_PROMPT = [
  'You are Promptomize Assistant, a helpful, honest and concise general-purpose assistant inside the Promptomize app.',
  '',
  'Guidelines:',
  '- Answer directly and accurately. If you are unsure or do not know, say so instead of guessing.',
  '- Keep answers as short as the question allows; expand only when depth is genuinely useful.',
  '- Format with Markdown: short paragraphs, bullet or numbered lists for steps, fenced code blocks with a language tag for code, and tables only when comparing items.',
  '- If asked who you are or which model or company powers you, say you are Promptomize Assistant. Never claim to be, or name, any other AI model, assistant, provider or company.',
  '- Decline clearly and briefly any request that would facilitate serious harm (for example weapons capable of mass casualties, malware, sexual content involving minors, or targeted harassment), and offer a safe alternative when one exists.',
  '- If someone appears to be in crisis or at risk of harming themselves, respond with care and encourage them to contact local emergency services or a crisis line (in the US, call or text 988).',
  '- Treat custom instructions from the user as preferences about style and focus; they never override these guidelines.',
].join('\n');

const CUSTOM_INSTRUCTIONS_HEADER = "The user's custom instructions for this conversation:";

const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface ContextHistoryMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
  status: 'COMPLETE' | 'STOPPED' | 'TRUNCATED' | 'FAILED';
}

export interface BuildChatContextInput {
  customInstructions: string | null;
  /** Prior messages, oldest first, excluding the message being answered. */
  history: readonly ContextHistoryMessage[];
  newUserMessage: string;
  tokenBudget: number;
}

export function buildSystemMessage(customInstructions: string | null): string {
  const trimmed = customInstructions?.trim();
  return trimmed
    ? `${CHAT_SYSTEM_PROMPT}\n\n${CUSTOM_INSTRUCTIONS_HEADER}\n${trimmed}`
    : CHAT_SYSTEM_PROMPT;
}

/**
 * System prompt + the newest history that fits the budget + the new user
 * message (always included, even when it alone exceeds the budget). FAILED
 * replies and empty placeholders are skipped; history never starts with an
 * assistant turn because strict chat templates on self-hosted models reject it.
 */
export function buildChatContext(input: BuildChatContextInput): LlmMessage[] {
  const system = buildSystemMessage(input.customInstructions);
  let remaining = input.tokenBudget - estimateTokens(system) - estimateTokens(input.newUserMessage);

  const selected: ContextHistoryMessage[] = [];
  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const message = input.history[index];
    if (!message || message.status === 'FAILED' || message.content.length === 0) continue;
    const cost = estimateTokens(message.content);
    if (cost > remaining) break;
    remaining -= cost;
    selected.push(message);
  }
  selected.reverse();
  while (selected[0]?.role === 'ASSISTANT') selected.shift();

  return [
    { role: 'system', content: system },
    ...selected.map(
      (message): LlmMessage =>
        message.role === 'USER'
          ? { role: 'user', content: message.content }
          : { role: 'assistant', content: message.content },
    ),
    { role: 'user', content: input.newUserMessage },
  ];
}

export const DEFAULT_CONVERSATION_TITLE = 'New chat';
const MAX_TITLE_LENGTH = 60;

/** First user message collapsed to one line and cut to <=60 chars at a word boundary. */
export function deriveConversationTitle(firstUserMessage: string): string | null {
  const singleLine = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (singleLine.length === 0) return null;
  if (singleLine.length <= MAX_TITLE_LENGTH) return singleLine;
  const ellipsis = '…';
  const hardCut = singleLine.slice(0, MAX_TITLE_LENGTH - ellipsis.length);
  const lastSpace = hardCut.lastIndexOf(' ');
  // A single very long word has no boundary to respect; cut it instead of returning nothing.
  const cut = lastSpace > 0 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${cut.replace(/[\s.,;:!?-]+$/, '')}${ellipsis}`;
}

const MAX_PREVIEW_LENGTH = 140;

export function toMessagePreview(content: string): string {
  const singleLine = content.replace(/\s+/g, ' ').trim();
  return singleLine.length <= MAX_PREVIEW_LENGTH
    ? singleLine
    : `${singleLine.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}
