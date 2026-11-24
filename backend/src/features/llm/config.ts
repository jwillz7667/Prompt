import { z } from 'zod';

export const LLM_PROVIDER_NAMES = ['deepseek', 'openrouter', 'local'] as const;
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

/** How a provider expects the "think before answering" switch to be expressed. */
export type ReasoningStyle = 'deepseek-thinking' | 'openrouter-reasoning' | 'chat-template-kwargs';

export interface LlmProviderConfig {
  name: LlmProviderName;
  /** Base URL without a trailing slash; `/chat/completions` and `/models` are appended. */
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsImages: boolean;
  reasoningStyle: ReasoningStyle;
  extraHeaders: Readonly<Record<string, string>>;
  extraBody: Readonly<Record<string, unknown>>;
}

export interface LlmTimeouts {
  /** Time to first token; exceeding it is a failover trigger. */
  ttftMs: number;
  /** Maximum gap between streamed events once output has started. */
  idleMs: number;
  /** Hard ceiling for a whole request, streamed or not. */
  totalMs: number;
}

export interface LlmBreakerConfig {
  longCooldownMs: number;
  shortCooldownMs: number;
  failureThreshold: number;
  failureWindowMs: number;
}

export interface LlmConfig {
  chain: readonly LlmProviderConfig[];
  skipped: ReadonlyArray<{ name: LlmProviderName; reason: string }>;
  /** Resolved DeepSeek model id, even when DeepSeek is not in the chain (used for logging/compat). */
  deepseekModel: string;
  timeouts: LlmTimeouts;
  breaker: LlmBreakerConfig;
  /** Extra attempts on the last remaining provider for transient failures. */
  lastProviderRetries: number;
}

export class LlmConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid LLM configuration: ${issues.join('; ')}`);
    this.name = 'LlmConfigError';
  }
}

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Generic attribution only: OpenRouter shows these on its dashboards, and the
// app's App Store review history forbids naming third-party AI vendors anyway.
const OPENROUTER_APP_REFERER = 'https://promptomize.app';
const OPENROUTER_APP_TITLE = 'Promptomize';

/**
 * Retired DeepSeek ids that DeepSeek itself still aliases server-side. Kept so
 * stale env overrides and old clients keep working; any other explicit value
 * is sent upstream exactly as configured, so a new model never needs a deploy.
 */
const DEEPSEEK_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'deepseek-chat': DEFAULT_DEEPSEEK_MODEL,
  'deepseek-reasoner': DEFAULT_DEEPSEEK_MODEL,
  'deepseek-v4-flash': DEFAULT_DEEPSEEK_MODEL,
};

export function resolveDeepseekModelAlias(model: string): string {
  const trimmed = model.trim();
  return DEEPSEEK_MODEL_ALIASES[trimmed] ?? trimmed;
}

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const optionalUrl = optionalString.pipe(
  z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, ''))
    .optional(),
);

const intAtLeast = (minimum: number, fallback: number) =>
  optionalString.pipe(
    z
      .string()
      .regex(/^\d+$/, 'must be a whole number of milliseconds/count')
      .transform(Number)
      .pipe(z.number().int().min(minimum))
      .optional()
      .transform((value) => value ?? fallback),
  );

const positiveInt = (fallback: number) => intAtLeast(1, fallback);
const nonNegativeInt = (fallback: number) => intAtLeast(0, fallback);

const optionalBoolean = optionalString.pipe(
  z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .optional(),
);

const providerPrefsSchema = optionalString.pipe(
  z
    .string()
    .transform((raw, ctx) => {
      try {
        const value: unknown = JSON.parse(raw);
        return value;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(z.record(z.string(), z.unknown()))
    .optional(),
);

const chainSchema = optionalString.pipe(
  z
    .string()
    .default('deepseek,openrouter')
    .transform((raw) =>
      raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    )
    .pipe(
      z
        .array(z.enum(LLM_PROVIDER_NAMES))
        .refine((names) => new Set(names).size === names.length, 'must not repeat a provider'),
    ),
);

const envSchema = z.object({
  LLM_PROVIDER_CHAIN: chainSchema,

  LLM_DEEPSEEK_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  LLM_DEEPSEEK_BASE_URL: optionalUrl,
  LLM_DEEPSEEK_MODEL: optionalString,
  DEEPSEEK_MODEL: optionalString,
  LLM_DEEPSEEK_SUPPORTS_IMAGES: optionalBoolean,

  LLM_OPENROUTER_API_KEY: optionalString,
  LLM_OPENROUTER_BASE_URL: optionalUrl,
  LLM_OPENROUTER_MODEL: optionalString,
  LLM_OPENROUTER_PROVIDER_PREFS: providerPrefsSchema,
  LLM_OPENROUTER_SUPPORTS_IMAGES: optionalBoolean,

  LLM_LOCAL_BASE_URL: optionalUrl,
  LLM_LOCAL_API_KEY: optionalString,
  LLM_LOCAL_MODEL: optionalString,
  LLM_LOCAL_CF_ACCESS_CLIENT_ID: optionalString,
  LLM_LOCAL_CF_ACCESS_CLIENT_SECRET: optionalString,
  LLM_LOCAL_SUPPORTS_IMAGES: optionalBoolean,

  LLM_TTFT_TIMEOUT_MS: positiveInt(15_000),
  LLM_IDLE_TIMEOUT_MS: positiveInt(60_000),
  LLM_TOTAL_TIMEOUT_MS: positiveInt(180_000),
  LLM_BREAKER_LONG_COOLDOWN_MS: positiveInt(300_000),
  LLM_LAST_PROVIDER_RETRIES: nonNegativeInt(1),
});

type ParsedEnv = z.infer<typeof envSchema>;

type ProviderBuild = { config: LlmProviderConfig } | { skipReason: string };

function buildDeepseek(env: ParsedEnv, model: string): ProviderBuild {
  const apiKey = env.LLM_DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY;
  if (!apiKey) return { skipReason: 'LLM_DEEPSEEK_API_KEY (or DEEPSEEK_API_KEY) is not set' };
  return {
    config: {
      name: 'deepseek',
      baseUrl: env.LLM_DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
      apiKey,
      model,
      // deepseek-flash lists text+image input on GET /models.
      supportsImages: env.LLM_DEEPSEEK_SUPPORTS_IMAGES ?? true,
      reasoningStyle: 'deepseek-thinking',
      extraHeaders: {},
      extraBody: {},
    },
  };
}

function buildOpenrouter(env: ParsedEnv): ProviderBuild {
  if (!env.LLM_OPENROUTER_API_KEY) return { skipReason: 'LLM_OPENROUTER_API_KEY is not set' };
  return {
    config: {
      name: 'openrouter',
      baseUrl: env.LLM_OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL,
      apiKey: env.LLM_OPENROUTER_API_KEY,
      model: env.LLM_OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      supportsImages: env.LLM_OPENROUTER_SUPPORTS_IMAGES ?? false,
      reasoningStyle: 'openrouter-reasoning',
      extraHeaders: { 'HTTP-Referer': OPENROUTER_APP_REFERER, 'X-Title': OPENROUTER_APP_TITLE },
      extraBody: env.LLM_OPENROUTER_PROVIDER_PREFS
        ? { provider: env.LLM_OPENROUTER_PROVIDER_PREFS }
        : {},
    },
  };
}

function buildLocal(env: ParsedEnv): ProviderBuild {
  const missing = [
    env.LLM_LOCAL_BASE_URL ? null : 'LLM_LOCAL_BASE_URL',
    env.LLM_LOCAL_API_KEY ? null : 'LLM_LOCAL_API_KEY',
    env.LLM_LOCAL_MODEL ? null : 'LLM_LOCAL_MODEL',
  ].filter((name): name is string => name !== null);
  if (!env.LLM_LOCAL_BASE_URL || !env.LLM_LOCAL_API_KEY || !env.LLM_LOCAL_MODEL) {
    return { skipReason: `${missing.join(', ')} not set` };
  }
  const extraHeaders: Record<string, string> = {};
  if (env.LLM_LOCAL_CF_ACCESS_CLIENT_ID && env.LLM_LOCAL_CF_ACCESS_CLIENT_SECRET) {
    extraHeaders['CF-Access-Client-Id'] = env.LLM_LOCAL_CF_ACCESS_CLIENT_ID;
    extraHeaders['CF-Access-Client-Secret'] = env.LLM_LOCAL_CF_ACCESS_CLIENT_SECRET;
  }
  return {
    config: {
      name: 'local',
      baseUrl: env.LLM_LOCAL_BASE_URL,
      apiKey: env.LLM_LOCAL_API_KEY,
      model: env.LLM_LOCAL_MODEL,
      supportsImages: env.LLM_LOCAL_SUPPORTS_IMAGES ?? false,
      reasoningStyle: 'chat-template-kwargs',
      extraHeaders,
      extraBody: {},
    },
  };
}

/**
 * Pure parse of the LLM environment. Malformed values throw LlmConfigError
 * (fail fast); providers that are merely unconfigured are reported in
 * `skipped` so a deploy without, say, the home GPU still boots.
 */
export function loadLlmConfig(env: NodeJS.ProcessEnv): LlmConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new LlmConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const values = parsed.data;
  const cfPartial =
    Boolean(values.LLM_LOCAL_CF_ACCESS_CLIENT_ID) !==
    Boolean(values.LLM_LOCAL_CF_ACCESS_CLIENT_SECRET);
  if (cfPartial) {
    throw new LlmConfigError([
      'LLM_LOCAL_CF_ACCESS_CLIENT_ID and LLM_LOCAL_CF_ACCESS_CLIENT_SECRET must be set together',
    ]);
  }

  const deepseekModel = resolveDeepseekModelAlias(
    values.LLM_DEEPSEEK_MODEL ?? values.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
  );

  const chain: LlmProviderConfig[] = [];
  const skipped: Array<{ name: LlmProviderName; reason: string }> = [];
  for (const name of values.LLM_PROVIDER_CHAIN) {
    const build =
      name === 'deepseek'
        ? buildDeepseek(values, deepseekModel)
        : name === 'openrouter'
          ? buildOpenrouter(values)
          : buildLocal(values);
    if ('config' in build) chain.push(build.config);
    else skipped.push({ name, reason: build.skipReason });
  }

  return {
    chain,
    skipped,
    deepseekModel,
    timeouts: {
      ttftMs: values.LLM_TTFT_TIMEOUT_MS,
      idleMs: values.LLM_IDLE_TIMEOUT_MS,
      totalMs: values.LLM_TOTAL_TIMEOUT_MS,
    },
    breaker: {
      longCooldownMs: values.LLM_BREAKER_LONG_COOLDOWN_MS,
      shortCooldownMs: 30_000,
      failureThreshold: 3,
      failureWindowMs: 30_000,
    },
    lastProviderRetries: values.LLM_LAST_PROVIDER_RETRIES,
  };
}

let cachedConfig: LlmConfig | undefined;

/** Process-wide config, parsed on first use (boot calls validateLlmConfig first). */
export function getLlmConfig(): LlmConfig {
  cachedConfig ??= loadLlmConfig(process.env);
  return cachedConfig;
}

/** Drops the cached config so the next read re-parses the environment. */
export function reloadLlmConfig(): LlmConfig {
  cachedConfig = loadLlmConfig(process.env);
  return cachedConfig;
}
