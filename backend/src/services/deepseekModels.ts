/**
 * Central DeepSeek model configuration.
 *
 * The legacy `deepseek-chat` / `deepseek-reasoner` model names are deprecated
 * upstream on 2026-07-24 and now alias to `deepseek-v4-flash` non-thinking /
 * thinking modes. V4 Flash defaults thinking ON and bills thinking as output
 * tokens (`usage.completion_tokens` includes reasoning), so EVERY request must
 * set the `thinking` parameter explicitly — omitting it silently enables
 * thinking and inflates output-token spend on paths that never read the CoT.
 *
 * API shape (chat completions): `"thinking": {"type": "enabled" | "disabled"}`;
 * when enabled, the chain-of-thought is returned in `reasoning_content`
 * alongside `content`.
 */

export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek-v4-flash';

export interface DeepSeekThinkingConfig {
  type: 'enabled' | 'disabled';
}

export const DEEPSEEK_THINKING_ENABLED: DeepSeekThinkingConfig = { type: 'enabled' };
export const DEEPSEEK_THINKING_DISABLED: DeepSeekThinkingConfig = { type: 'disabled' };

// Env-overridable so the next model deprecation is an ops change, not a
// deploy. Read at call time (not module scope) so dotenv load order and test
// overrides both work.
export function getDeepseekModel(): string {
  return process.env['DEEPSEEK_MODEL'] || DEEPSEEK_V4_FLASH_MODEL;
}

export interface DeepSeekModelSelection {
  model: string;
  thinking: DeepSeekThinkingConfig;
}

// Legacy ids still arrive from older iOS/web clients and stale env overrides;
// each implied a fixed thinking mode, so honor that instead of the caller's
// mode-derived preference.
const LEGACY_THINKING_MODELS: ReadonlySet<string> = new Set(['deepseek-reasoner']);
const LEGACY_NON_THINKING_MODELS: ReadonlySet<string> = new Set(['deepseek-chat']);

/**
 * Resolves a caller-supplied model id (possibly a deprecated legacy name)
 * plus the desired thinking state into the model + explicit thinking
 * parameter to send upstream.
 */
export function resolveDeepseekModel(
  requestedModel: string | undefined,
  shouldThink: boolean
): DeepSeekModelSelection {
  if (requestedModel && LEGACY_THINKING_MODELS.has(requestedModel)) {
    return { model: getDeepseekModel(), thinking: DEEPSEEK_THINKING_ENABLED };
  }
  if (requestedModel && LEGACY_NON_THINKING_MODELS.has(requestedModel)) {
    return { model: getDeepseekModel(), thinking: DEEPSEEK_THINKING_DISABLED };
  }
  return {
    model: requestedModel ?? getDeepseekModel(),
    thinking: shouldThink ? DEEPSEEK_THINKING_ENABLED : DEEPSEEK_THINKING_DISABLED,
  };
}
