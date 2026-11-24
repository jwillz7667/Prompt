import {
  DEFAULT_DEEPSEEK_MODEL,
  getLlmConfig,
  resolveDeepseekModelAlias,
} from '../features/llm/index.js';

/** Central DeepSeek model selection. Thinking must be explicit to avoid hidden reasoning spend. */
export const DEEPSEEK_FLASH_MODEL = DEFAULT_DEEPSEEK_MODEL;
// Compatibility export used by older route definitions.
export const DEEPSEEK_V4_FLASH_MODEL = DEEPSEEK_FLASH_MODEL;

export interface DeepSeekThinkingConfig {
  type: 'enabled' | 'disabled';
}

export const DEEPSEEK_THINKING_ENABLED: DeepSeekThinkingConfig = { type: 'enabled' };
export const DEEPSEEK_THINKING_DISABLED: DeepSeekThinkingConfig = { type: 'disabled' };

/**
 * The configured DeepSeek model (LLM_DEEPSEEK_MODEL, then DEEPSEEK_MODEL, then
 * deepseek-flash), used exactly as configured apart from the documented
 * retired-id aliases in features/llm/config.ts.
 */
export function getDeepseekModel(): string {
  return getLlmConfig().deepseekModel;
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
 * Resolves a caller-supplied model id (possibly a retired alias) plus the
 * desired thinking state into the model + explicit thinking parameter to send
 * upstream. Unknown explicit ids pass through untouched.
 */
export function resolveDeepseekModel(
  requestedModel: string | undefined,
  shouldThink: boolean,
): DeepSeekModelSelection {
  const requested = requestedModel?.trim();
  if (requested && LEGACY_THINKING_MODELS.has(requested)) {
    return { model: getDeepseekModel(), thinking: DEEPSEEK_THINKING_ENABLED };
  }
  if (requested && LEGACY_NON_THINKING_MODELS.has(requested)) {
    return { model: getDeepseekModel(), thinking: DEEPSEEK_THINKING_DISABLED };
  }
  return {
    model: requested ? resolveDeepseekModelAlias(requested) : getDeepseekModel(),
    thinking: shouldThink ? DEEPSEEK_THINKING_ENABLED : DEEPSEEK_THINKING_DISABLED,
  };
}
