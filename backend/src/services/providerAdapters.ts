import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

import { promptLogger } from '../utils/logger.js';

/**
 * Uniform non-streaming completion across AI providers, used by the
 * multi-provider compare feature. DeepSeek is always available (it is a
 * REQUIRED env var); the others activate when their API key is set, so the
 * compare surface grows as keys are added without a code change.
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

const PROVIDER_KEYS: Record<CompareProvider, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

function apiKeyFor(provider: CompareProvider): string | undefined {
  const value = process.env[PROVIDER_KEYS[provider]];
  return value && value.trim().length > 0 ? value : undefined;
}

export function getAvailableProviders(): CompareProvider[] {
  return COMPARE_PROVIDERS.filter((provider) => apiKeyFor(provider) !== undefined);
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

interface OpenAICompatibleResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

async function completeDeepseek(
  apiKey: string,
  request: ProviderCompletionRequest
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const model = process.env['DEEPSEEK_COMPARE_MODEL'] || 'deepseek-chat';
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage },
      ],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as OpenAICompatibleResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from DeepSeek');
  }
  return {
    content,
    model: data.model || model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function completeAnthropic(
  apiKey: string,
  request: ProviderCompletionRequest
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const model = process.env['ANTHROPIC_COMPARE_MODEL'] || 'claude-sonnet-5';
  const client = new Anthropic({ apiKey });
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
  request: ProviderCompletionRequest
): Promise<Omit<ProviderCompletionResult, 'processingMs'>> {
  const model = process.env['OPENAI_COMPARE_MODEL'] || 'gpt-4.1';
  const client = new OpenAI({ apiKey });
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
  request: ProviderCompletionRequest
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

  const result = await generativeModel.generateContent(request.userMessage);
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

export async function completeWithProvider(
  provider: CompareProvider,
  request: ProviderCompletionRequest
): Promise<ProviderCompletionResult> {
  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    throw new Error(`Provider ${provider} is not configured (${PROVIDER_KEYS[provider]} unset)`);
  }

  const startTime = Date.now();
  let result: Omit<ProviderCompletionResult, 'processingMs'>;
  switch (provider) {
    case 'deepseek':
      result = await completeDeepseek(apiKey, request);
      break;
    case 'anthropic':
      result = await completeAnthropic(apiKey, request);
      break;
    case 'openai':
      result = await completeOpenai(apiKey, request);
      break;
    case 'gemini':
      result = await completeGemini(apiKey, request);
      break;
  }

  const processingMs = Date.now() - startTime;
  promptLogger.info(
    { provider, model: result.model, processingMs, outputTokens: result.outputTokens },
    'Provider completion finished'
  );
  return { ...result, processingMs };
}
