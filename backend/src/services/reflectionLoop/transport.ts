import {
  enhancePrompt,
  requestCompletion,
  type DeepSeekMessage,
  type EnhancementTier,
} from '../deepseekService.js';
import type {
  ReflectionEngine,
  ReflectionEngineDeps,
  ReflectionLlmCall,
  SinglePassFn,
} from './engine.js';
import { createReflectionEngine } from './engine.js';

/**
 * Production wiring for the reflection loop. The engine itself is transport-
 * agnostic (everything is injected); this module binds it to the existing
 * hardened DeepSeek call path in deepseekService (timeouts, retries, backoff)
 * so the loop inherits the same upstream resilience as the live enhancement
 * surface. Tests construct the engine with mocks and never import this file.
 */

function getDeepseekApiKey(): string {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable not configured');
  }
  return apiKey;
}

export function createDeepseekReflectionLlmCall(): ReflectionLlmCall {
  return async (request) => {
    const messages: DeepSeekMessage[] =
      request.systemPrompt === null
        ? [{ role: 'user', content: request.userMessage }]
        : [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userMessage },
          ];

    // 'chat' sanitization trims only — JSON stage outputs must arrive intact
    // (the engine handles code-fence stripping during parsing itself).
    const result = await requestCompletion(
      {
        model: request.model,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
        thinking: request.thinking,
      },
      getDeepseekApiKey(),
      'chat'
    );

    return {
      content: result.enhancedPrompt,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  };
}

export interface SinglePassOptions {
  tier?: EnhancementTier | undefined;
}

/**
 * The one-call polish used for the free tier, the `already_strong` gate, and
 * §3 failure degradation: the existing production enhancement path in
 * standard (non-thinking) mode.
 */
export function createDeepseekSinglePass(options?: SinglePassOptions): SinglePassFn {
  return async (input) => {
    const result = await enhancePrompt({
      prompt: input.rawPrompt,
      tier: options?.tier ?? 'standard',
      mode: 'standard',
      conversationMode: 'optimize',
      ...(input.userGoal?.trim()
        ? { customInstructions: `The user's stated goal for this prompt: ${input.userGoal.trim()}` }
        : {}),
    });

    return {
      enhancedPrompt: result.enhancedPrompt,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  };
}

export interface ProductionReflectionEngineOptions {
  singlePassTier?: EnhancementTier | undefined;
  onProgress?: ReflectionEngineDeps['onProgress'];
}

export function createProductionReflectionEngine(
  options?: ProductionReflectionEngineOptions
): ReflectionEngine {
  return createReflectionEngine({
    llm: createDeepseekReflectionLlmCall(),
    singlePass: createDeepseekSinglePass({ tier: options?.singlePassTier }),
    onProgress: options?.onProgress,
  });
}
