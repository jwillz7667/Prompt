import {
  buildEnhancementMessages,
  cleanEnhancedOutput,
  type EnhancementTier,
  type PromptModality,
  type PromptTone,
} from './promptEnhancementEngine.js';
import {
  completeWithProvider,
  getAvailableProviders,
  type CompareProvider,
} from './providerAdapters.js';
import { promptLogger } from '../utils/logger.js';

export interface CompareRequest {
  prompt: string;
  providers: CompareProvider[];
  modality?: PromptModality;
  tone?: PromptTone;
  tier: EnhancementTier;
  customInstructions?: string;
}

export interface CompareVariantResult {
  provider: CompareProvider;
  status: 'ok' | 'error';
  enhancedPrompt?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  processingMs?: number;
  error?: string;
}

export class CompareValidationError extends Error {
  readonly availableProviders: CompareProvider[];

  constructor(message: string, availableProviders: CompareProvider[]) {
    super(message);
    this.name = 'CompareValidationError';
    this.availableProviders = availableProviders;
  }
}

// Hard cap on fan-out per request; also the Zod max in the route. One compare
// call costs up to this many upstream completions.
export const MAX_COMPARE_PROVIDERS = 4;

export async function compareEnhancements(request: CompareRequest): Promise<CompareVariantResult[]> {
  const available = getAvailableProviders();
  const unavailable = request.providers.filter((provider) => !available.includes(provider));
  if (unavailable.length > 0) {
    throw new CompareValidationError(
      `Providers not configured: ${unavailable.join(', ')}`,
      available
    );
  }

  const messages = buildEnhancementMessages({
    prompt: request.prompt,
    tier: request.tier,
    modality: request.modality,
    tone: request.tone,
    customInstructions: request.customInstructions,
  });

  // Fan out concurrently — bounded by MAX_COMPARE_PROVIDERS (≤4), so no
  // batching machinery is needed. allSettled: one provider failing must not
  // sink the comparison; the client renders per-provider errors inline.
  const settled = await Promise.allSettled(
    request.providers.map((provider) => completeWithProvider(provider, messages))
  );

  return settled.map((outcome, index) => {
    const provider = request.providers[index] as CompareProvider;
    if (outcome.status === 'fulfilled') {
      return {
        provider,
        status: 'ok' as const,
        enhancedPrompt: cleanEnhancedOutput(outcome.value.content),
        model: outcome.value.model,
        inputTokens: outcome.value.inputTokens,
        outputTokens: outcome.value.outputTokens,
        processingMs: outcome.value.processingMs,
      };
    }
    const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    promptLogger.warn({ provider, reason }, 'Compare variant failed');
    return {
      provider,
      status: 'error' as const,
      // Upstream error bodies can contain request echoes; keep it short and
      // provider-attributed rather than forwarding verbatim.
      error: reason.slice(0, 200),
    };
  });
}
