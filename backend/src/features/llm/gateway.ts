import { getRedis, isRedisAvailable } from '../../utils/redis.js';
import { logger as appLogger } from '../../utils/logger.js';
import {
  bypassPermit,
  createCircuitBreaker,
  createFallbackBreakerStore,
  createMemoryBreakerStore,
  createRedisBreakerStore,
  isRedisBreakerClient,
  type BreakerPermit,
  type CircuitBreaker,
} from './circuit-breaker.js';
import { getLlmConfig, type LlmConfig, type LlmTimeouts } from './config.js';
import { ProviderError } from './errors.js';
import {
  TokenConsumerError,
  createOpenAiCompatibleProvider,
  type LlmLogger,
  type LlmProvider,
} from './openai-compatible-provider.js';
import {
  messagesContainImages,
  type LlmChatRequest,
  type LlmChatResult,
  type LlmStreamCallbacks,
} from './types.js';

export interface LlmGateway {
  streamChat(request: LlmChatRequest, callbacks: LlmStreamCallbacks): Promise<LlmChatResult>;
  completeChat(request: LlmChatRequest): Promise<LlmChatResult>;
}

export interface LlmGatewayDeps {
  providers: readonly LlmProvider[];
  breaker: CircuitBreaker;
  timeouts: LlmTimeouts;
  lastProviderRetries: number;
  logger: LlmLogger;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_RETRY_DELAY_MS = 4_000;

function retryDelayMs(attempt: number, error: ProviderError): number {
  const backoff = Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return error.retryAfterMs !== undefined
    ? Math.min(Math.max(error.retryAfterMs, backoff), MAX_RETRY_DELAY_MS)
    : backoff;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps a failure that must reach the caller as-is: no failover, no retry. */
class TerminalAttemptError extends Error {
  constructor(readonly error: ProviderError) {
    super(error.message, { cause: error });
    this.name = 'TerminalAttemptError';
  }
}

function callerAbortedError(provider: string): ProviderError {
  return new ProviderError({ kind: 'interrupted', provider, message: 'request aborted by caller' });
}

/**
 * Walks the provider chain: skips providers whose breaker is open, fails over
 * only while nothing has been emitted to the caller (two providers are never
 * spliced into one answer), and retries the last remaining provider for
 * transient failures.
 */
export function createLlmGateway(deps: LlmGatewayDeps): LlmGateway {
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.logger;

  const run = async (
    request: LlmChatRequest,
    mode: 'stream' | 'complete',
    attemptProvider: (
      provider: LlmProvider,
      model: string,
      onEmit: () => void,
    ) => Promise<LlmChatResult>,
  ): Promise<LlmChatResult> => {
    if (deps.providers.length === 0) {
      throw new ProviderError({
        kind: 'not_configured',
        provider: 'gateway',
        message: 'no LLM provider is configured',
      });
    }
    const needsImages = messagesContainImages(request.messages);
    const candidates = deps.providers.filter((provider) => !needsImages || provider.supportsImages);
    if (candidates.length === 0) {
      throw new ProviderError({
        kind: 'not_configured',
        provider: 'gateway',
        message: 'no configured LLM provider accepts image input',
      });
    }

    let lastError: ProviderError | undefined;
    const skippedOpen: string[] = [];
    const attempted = new Set<string>();
    // Skipped only for transient reasons and never tried by this request: when
    // nothing else is left, one attempt here beats a guaranteed failure.
    let lastResort: { provider: LlmProvider; model: string } | undefined;

    const attemptOnce = async (
      provider: LlmProvider,
      model: string,
      permit: BreakerPermit,
      attempt: number,
    ): Promise<LlmChatResult> => {
      attempted.add(provider.name);
      let hasEmitted = false;
      try {
        const result = await attemptProvider(provider, model, () => {
          hasEmitted = true;
        });
        await deps.breaker.recordSuccess(permit);
        log.info(
          {
            provider: result.provider,
            model: result.model,
            mode,
            purpose: request.purpose,
            latencyMs: result.latencyMs,
            finishReason: result.finishReason,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cachedInputTokens: result.usage.cachedInputTokens,
            failedOver: lastError !== undefined || skippedOpen.length > 0,
          },
          'LLM request completed',
        );
        return result;
      } catch (thrown) {
        if (thrown instanceof TokenConsumerError) {
          await deps.breaker.release(permit);
          throw thrown.original;
        }
        const error =
          thrown instanceof ProviderError
            ? thrown
            : new ProviderError({
                kind: 'overloaded',
                provider: provider.name,
                message: 'unexpected provider failure',
                hasStreamedOutput: hasEmitted,
                cause: thrown,
              });
        const isCallerAbort = request.signal?.aborted === true;
        if (isCallerAbort) await deps.breaker.release(permit);
        else await deps.breaker.recordFailure(permit, error);

        log.warn(
          {
            provider: provider.name,
            model,
            mode,
            purpose: request.purpose,
            attempt,
            kind: error.kind,
            status: error.status,
            hasStreamedOutput: error.hasStreamedOutput,
            err: error,
          },
          'LLM provider attempt failed',
        );

        if (isCallerAbort || !error.isFailoverEligible) throw new TerminalAttemptError(error);
        throw error;
      }
    };

    for (const [index, provider] of candidates.entries()) {
      const isLast = index === candidates.length - 1;
      const maxAttempts = isLast ? 1 + deps.lastProviderRetries : 1;
      const model = request.modelOverrides?.[provider.name] ?? provider.defaultModel;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (request.signal?.aborted) throw callerAbortedError(provider.name);
        const decision = await deps.breaker.tryAcquire(provider.name);
        if (!decision.isAllowed) {
          skippedOpen.push(provider.name);
          if (!decision.isProviderWide && !attempted.has(provider.name)) {
            lastResort = { provider, model };
          }
          break;
        }

        try {
          return await attemptOnce(provider, model, decision.permit, attempt);
        } catch (thrown) {
          if (thrown instanceof TerminalAttemptError) throw thrown.error;
          if (!(thrown instanceof ProviderError)) throw thrown;
          lastError = thrown;
          if (thrown.isProviderWide) break;
          if (attempt + 1 < maxAttempts) await sleep(retryDelayMs(attempt, thrown));
        }
      }
    }

    if (lastResort && !attempted.has(lastResort.provider.name)) {
      if (request.signal?.aborted) throw callerAbortedError(lastResort.provider.name);
      log.warn(
        { provider: lastResort.provider.name, mode, purpose: request.purpose },
        'No LLM provider available through the breaker; making a last-resort attempt',
      );
      try {
        return await attemptOnce(
          lastResort.provider,
          lastResort.model,
          bypassPermit(lastResort.provider.name),
          0,
        );
      } catch (thrown) {
        if (thrown instanceof TerminalAttemptError) throw thrown.error;
        throw thrown;
      }
    }

    if (lastError) throw lastError;
    throw new ProviderError({
      kind: 'overloaded',
      provider: 'gateway',
      message: `all LLM providers are circuit-open (${skippedOpen.join(', ')})`,
    });
  };

  return {
    streamChat(request, callbacks) {
      return run(request, 'stream', (provider, model, onEmit) =>
        provider.stream(request, {
          model,
          timeouts: deps.timeouts,
          onToken: (token) => {
            onEmit();
            return callbacks.onToken(token);
          },
        }),
      );
    },
    completeChat(request) {
      return run(request, 'complete', (provider, model) =>
        provider.complete(request, { model, timeoutMs: deps.timeouts.totalMs }),
      );
    },
  };
}

export function createLlmGatewayFromConfig(config: LlmConfig, logger: LlmLogger): LlmGateway {
  const fallback = createMemoryBreakerStore();
  const store = createFallbackBreakerStore({
    resolvePrimary: () => {
      if (!isRedisAvailable()) return undefined;
      const client = getRedis();
      return isRedisBreakerClient(client) ? createRedisBreakerStore(client) : undefined;
    },
    fallback,
    logger,
  });
  return createLlmGateway({
    providers: config.chain.map((providerConfig) =>
      createOpenAiCompatibleProvider(providerConfig, { logger }),
    ),
    breaker: createCircuitBreaker({ store, config: config.breaker, logger }),
    timeouts: config.timeouts,
    lastProviderRetries: config.lastProviderRetries,
    logger,
  });
}

const gatewayLogger: LlmLogger = {
  info: (fields, message) => appLogger.info({ module: 'llm', ...fields }, message),
  warn: (fields, message) => appLogger.warn({ module: 'llm', ...fields }, message),
  error: (fields, message) => appLogger.error({ module: 'llm', ...fields }, message),
};

let defaultGateway: LlmGateway | undefined;

function getDefaultGateway(): LlmGateway {
  defaultGateway ??= createLlmGatewayFromConfig(getLlmConfig(), gatewayLogger);
  return defaultGateway;
}

/** Rebuilds the process-wide gateway (fresh providers and in-process breaker state) from `config`. */
export function resetDefaultLlmGateway(config: LlmConfig = getLlmConfig()): void {
  defaultGateway = createLlmGatewayFromConfig(config, gatewayLogger);
}

export function streamChat(
  request: LlmChatRequest,
  callbacks: LlmStreamCallbacks,
): Promise<LlmChatResult> {
  return getDefaultGateway().streamChat(request, callbacks);
}

export function completeChat(request: LlmChatRequest): Promise<LlmChatResult> {
  return getDefaultGateway().completeChat(request);
}

export { gatewayLogger as llmLogger };
