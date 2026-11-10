/** Central provider model selection. Thinking must be explicit to avoid hidden reasoning spend. */
export const DEEPSEEK_FLASH_MODEL = 'deepseek-flash';
// Compatibility export used by older route definitions.
export const DEEPSEEK_V4_FLASH_MODEL = DEEPSEEK_FLASH_MODEL;

export interface DeepSeekThinkingConfig {
  type: 'enabled' | 'disabled';
}

export const DEEPSEEK_THINKING_ENABLED: DeepSeekThinkingConfig = { type: 'enabled' };
export const DEEPSEEK_THINKING_DISABLED: DeepSeekThinkingConfig = { type: 'disabled' };

// Env-overridable so the next model deprecation is an ops change, not a
// deploy. Read at call time (not module scope) so dotenv load order and test
// overrides both work.
export function getDeepseekModel(): string {
  const configured = process.env['DEEPSEEK_MODEL']?.trim();
  return !configured ||
    [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v4-flash',
      'deepseek-v4-flash-vision-exp',
    ].includes(configured)
    ? DEEPSEEK_FLASH_MODEL
    : configured;
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
  shouldThink: boolean,
): DeepSeekModelSelection {
  if (requestedModel && LEGACY_THINKING_MODELS.has(requestedModel)) {
    return { model: getDeepseekModel(), thinking: DEEPSEEK_THINKING_ENABLED };
  }
  if (requestedModel && LEGACY_NON_THINKING_MODELS.has(requestedModel)) {
    return { model: getDeepseekModel(), thinking: DEEPSEEK_THINKING_DISABLED };
  }
  return {
    model:
      !requestedModel?.trim() ||
      ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].includes(requestedModel)
        ? getDeepseekModel()
        : requestedModel.trim(),
    thinking: shouldThink ? DEEPSEEK_THINKING_ENABLED : DEEPSEEK_THINKING_DISABLED,
  };
}
