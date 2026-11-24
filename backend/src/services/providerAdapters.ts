import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

import { getLlmConfig } from '../features/llm/index.js';
import { promptLogger } from '../utils/logger.js';
import { DEEPSEEK_THINKING_DISABLED, resolveDeepseekModel } from './deepseekModels.js';
import { requestCompletion } from './deepseekService.js';

/**
 * Uniform non-streaming completion across AI providers, used by the
 * multi-provider compare feature. The 'deepseek' entry runs through the LLM
 * gateway (so it inherits provider failover) and is available whenever the
 * gateway chain is non-empty; the others activate when their API key is set,
 * so the compare surface grows as keys are added without a code change.
 *
 * Model ids are env-overridable so a model deprecation is an ops change,
 * not a deploy.
 */

export type CompareProvider = 'deepseek' | 'anthropic' | 'openai' | 'gemini';

export const COMPARE_PROVIDERS: readonly CompareProvider[] = [
  'deepseek',
  'anthropic',
  'openai',
  'gemini',
] as const;

export interface ProviderCompletionRequest {
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderCompletionResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  processingMs: number;
}

type DirectProvider = Exclude<CompareProvider, 'deepseek'>;

const PROVIDER_KEYS: Record<DirectProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

function apiKeyFor(provider: DirectProvider): string | undefined {
  const value = process.env[PROVIDER_KEYS[provider]];
  return value && value.trim().length > 0 ? value : undefined;
}

function isAvailable(provider: CompareProvider): boolean {
  return provider === 'deepseek'
    ? getLlmConfig().chain.length > 0
    : apiKeyFor(provider) !== undefined;
}

export function getAvailableProviders(): CompareProvider[] {
  return COMPARE_PROVIDERS.filter(isAvailable);
}

async function completeDeepseek(
  request: ProviderCompletionRequest,
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  // Compare is a non-thinking surface; a legacy id in DEEPSEEK_COMPARE_MODEL
  // is remapped, and thinking is always sent explicitly (V4 Flash defaults it
  // ON and bills the CoT as output tokens).
  const { model } = resolveDeepseekModel(process.env['DEEPSEEK_COMPARE_MODEL'] || undefined, false);
  const result = await requestCompletion(
    {
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage },
      ],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
      thinking: DEEPSEEK_THINKING_DISABLED,
    },
    'chat',
  );
  return {
    content: result.enhancedPrompt,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

async function completeAnthropic(
  apiKey: string,
  request: ProviderCompletionRequest,
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const model = process.env['ANTHROPIC_COMPARE_MODEL'] || 'claude-sonnet-5';
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const message = await client.messages.create({
    model,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    system: request.systemPrompt,
    messages: [{ role: 'user', content: request.userMessage }],
  });

  const content = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!content) {
    throw new Error('Empty response from Anthropic');
  }
  return {
    content,
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

async function completeOpenai(
  apiKey: string,
  request: ProviderCompletionRequest,
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const model = process.env['OPENAI_COMPARE_MODEL'] || 'gpt-4.1';
  const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
  const completion = await client.chat.completions.create({
    model,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userMessage },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  return {
    content,
    model: completion.model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

async function completeGemini(
  apiKey: string,
  request: ProviderCompletionRequest,
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const model = process.env['GEMINI_COMPARE_MODEL'] || 'gemini-2.5-flash';
  const client = new GoogleGenerativeAI(apiKey);
  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: request.systemPrompt,
    generationConfig: {
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
    },
  });

  const result = await generativeModel.generateContent(request.userMessage, { timeout: 60_000 });
  const content = result.response.text();
  if (!content) {
    throw new Error('Empty response from Gemini');
  }
  const usage = result.response.usageMetadata;
  return {
    content,
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

async function completeDirect(
  provider: DirectProvider,
  request: ProviderCompletionRequest,
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    throw new Error(`Provider ${provider} is not configured (${PROVIDER_KEYS[provider]} unset)`);
  }
  switch (provider) {
    case 'anthropic':
      return completeAnthropic(apiKey, request);
    case 'openai':
      return completeOpenai(apiKey, request);
    case 'gemini':
      return completeGemini(apiKey, request);
  }
}

export async function completeWithProvider(
  provider: CompareProvider,
  request: ProviderCompletionRequest,
): Promise<ProviderCompletionResult> {
  const startTime = Date.now();
  const result =
    provider === 'deepseek'
      ? await completeDeepseek(request)
      : await completeDirect(provider, request);

  const processingMs = Date.now() - startTime;
  promptLogger.info(
    { provider, model: result.model, processingMs, outputTokens: result.outputTokens },
    'Provider completion finished',
  );
  return { ...result, processingMs };
}
