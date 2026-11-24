import { z } from 'zod';

/**
 * Pre-model filter for user chat messages (App Store guideline 1.2 "method for
 * filtering objectionable material"). Only two categories are acted on here;
 * everything else is passed to the model, whose own safety training applies.
 */
export type ModerationVerdict = 'allow' | 'refuse_minors' | 'self_harm_support';

export type ModerateMessage = (text: string, signal?: AbortSignal) => Promise<ModerationVerdict>;

export interface ModerationLogger {
  warn(fields: Record<string, unknown>, message: string): void;
}

export interface ModeratorDeps {
  isEnabled: boolean;
  apiKey: string | undefined;
  timeoutMs: number;
  logger: ModerationLogger;
  fetch?: typeof fetch;
  endpoint?: string;
}

export const MODERATION_ENDPOINT = 'https://api.openai.com/v1/moderations';
const MODERATION_MODEL = 'omni-moderation-latest';

export const MINORS_REFUSAL_MESSAGE =
  "I can't help with that. I won't create or engage with any content that sexualizes minors.";

export const SELF_HARM_SUPPORT_MESSAGE = [
  "I'm really sorry you're going through this, and I'm glad you reached out. You don't have to handle it alone.",
  '',
  "If you're in immediate danger or think you might act on these thoughts, please contact emergency services now.",
  '',
  'You can talk to someone right away, for free and confidentially:',
  '- **In the US:** call or text **988** to reach the 988 Suicide & Crisis Lifeline, available 24/7.',
  '- **Outside the US:** find a local helpline at [findahelpline.com](https://findahelpline.com).',
  '',
  "If you'd like, you can also tell me more about what's been happening. I'm here to listen.",
].join('\n');

const moderationResponseSchema = z.object({
  results: z
    .array(
      z.object({
        flagged: z.boolean(),
        categories: z.record(z.string(), z.boolean().nullable()),
      }),
    )
    .min(1),
});

const SELF_HARM_CATEGORIES = ['self-harm/intent', 'self-harm/instructions'] as const;

export function verdictFromCategories(
  categories: Readonly<Record<string, boolean | null>>,
): ModerationVerdict {
  if (categories['sexual/minors'] === true) return 'refuse_minors';
  if (SELF_HARM_CATEGORIES.some((category) => categories[category] === true)) {
    return 'self_harm_support';
  }
  return 'allow';
}

/**
 * Fails open: an outage, timeout or malformed reply allows the message with a
 * warning, because blocking every chat on a third-party moderation outage is
 * worse than relying on the model's own safety for those seconds.
 */
export function createModerator(deps: ModeratorDeps): ModerateMessage {
  const { apiKey } = deps;
  if (!deps.isEnabled || !apiKey) return () => Promise.resolve('allow');
  // Resolved per call so test stubs of the global fetch apply.
  const doFetch: typeof fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const endpoint = deps.endpoint ?? MODERATION_ENDPOINT;

  return async (text, signal) => {
    const timeout = AbortSignal.timeout(deps.timeoutMs);
    const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
    try {
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
        signal: combined,
      });
      if (!response.ok) {
        deps.logger.warn(
          { status: response.status },
          'Chat moderation unavailable; allowing message',
        );
        return 'allow';
      }
      const parsed = moderationResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        deps.logger.warn({}, 'Chat moderation returned an unexpected shape; allowing message');
        return 'allow';
      }
      const merged: Record<string, boolean | null> = {};
      for (const result of parsed.data.results) {
        for (const [category, isFlagged] of Object.entries(result.categories)) {
          merged[category] = merged[category] === true || isFlagged === true;
        }
      }
      return verdictFromCategories(merged);
    } catch (error) {
      if (signal?.aborted) throw error;
      deps.logger.warn(
        { err: error, timedOut: timeout.aborted },
        'Chat moderation failed; allowing message',
      );
      return 'allow';
    }
  };
}
