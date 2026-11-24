import { z } from 'zod';

import { getLlmConfig, type LlmConfig, type LlmProviderConfig } from './config.js';
import { llmLogger } from './gateway.js';
import type { FetchLike, LlmLogger } from './openai-compatible-provider.js';

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

const MODELS_PROBE_TIMEOUT_MS = 10_000;

/**
 * Asks the provider which models it serves and warns loudly when the
 * configured id is missing — the failure mode behind silent 400s after an
 * upstream rename. Never throws: a provider being down at boot is not a
 * reason to refuse traffic that may fail over elsewhere.
 */
export async function probeConfiguredModel(
  provider: LlmProviderConfig,
  deps: { logger: LlmLogger; fetch?: FetchLike },
): Promise<void> {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const fields = { provider: provider.name, model: provider.model };
  try {
    const response = await doFetch(`${provider.baseUrl}/models`, {
      method: 'GET',
      headers: {
        ...provider.extraHeaders,
        Accept: 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      signal: AbortSignal.timeout(MODELS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      deps.logger.error(
        { ...fields, status: response.status },
        'LLM provider model listing failed at boot; check credentials and base URL',
      );
      return;
    }
    const parsed = modelsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      deps.logger.warn(fields, 'LLM provider model listing had an unexpected shape');
      return;
    }
    const ids = parsed.data.data.map((model) => model.id);
    if (!ids.includes(provider.model)) {
      deps.logger.error(
        { ...fields, availableSample: ids.slice(0, 20) },
        'CONFIGURED LLM MODEL IS NOT LISTED BY PROVIDER — requests will likely fail with 400',
      );
      return;
    }
    deps.logger.info(fields, 'LLM provider model verified');
  } catch (error) {
    deps.logger.warn({ ...fields, err: error }, 'LLM provider model listing unreachable at boot');
  }
}

/**
 * Boot-time check called from index.ts. Parses the config (throwing
 * LlmConfigError on malformed values so a bad deploy fails its health check
 * instead of serving errors), logs the effective chain, and fires the
 * non-blocking model probes.
 */
export function validateLlmConfig(
  deps: { logger?: LlmLogger; fetch?: FetchLike; probeModels?: boolean } = {},
): LlmConfig {
  const logger = deps.logger ?? llmLogger;
  const config = getLlmConfig();

  for (const skipped of config.skipped) {
    logger.warn(
      { provider: skipped.name, reason: skipped.reason },
      'LLM provider listed in LLM_PROVIDER_CHAIN is not configured; skipping it',
    );
  }
  const chain = config.chain.map((provider) => ({
    provider: provider.name,
    model: provider.model,
    baseUrl: provider.baseUrl,
    supportsImages: provider.supportsImages,
  }));
  if (chain.length === 0) {
    logger.error({}, 'No LLM provider is configured; every AI request will fail');
  } else {
    logger.info({ chain, timeouts: config.timeouts }, 'LLM provider chain');
  }

  const shouldProbe = deps.probeModels ?? process.env['NODE_ENV'] !== 'test';
  if (shouldProbe) {
    for (const provider of config.chain) {
      void probeConfiguredModel(provider, { logger, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    }
  }
  return config;
}
