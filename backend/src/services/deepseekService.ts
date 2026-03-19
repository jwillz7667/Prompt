import { type TierFeatures } from './subscriptionService.js';
import { promptLogger } from '../utils/logger.js';

export type PromptMode = 'standard' | 'max';
export type PromptModality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d';
export type EnhancementTier = 'basic' | 'standard' | 'advanced';

export interface EnhancePromptRequest {
  prompt: string;
  tier: EnhancementTier;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  mode?: PromptMode;
  modality?: PromptModality;
  subModality?: string;
  customInstructions?: string;
  targetCharacterLength?: number;
  attachedContextSummary?: string;
}

export interface EnhancePromptResult {
  enhancedPrompt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  processingMs: number;
}

export interface ThreadTurnContext {
  originalPrompt: string;
  enhancedPrompt: string;
}

export interface EnhancePromptInThreadRequest extends EnhancePromptRequest {
  previousTurns: ThreadTurnContext[];
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: EnhancePromptResult) => void;
  onError: (error: Error) => void;
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const STANDARD_MODEL = 'deepseek-chat';
const MAX_MODEL = 'deepseek-reasoner';
const STANDARD_TEMPERATURE = 0.35;
const MAX_TEMPERATURE = 0.2;
const STANDARD_MAX_TOKENS = 3072;
const MAX_MAX_TOKENS = 6144;
const THREAD_CONTEXT_CHAR_BUDGET = 220_000;

const QUALITY_PROFILES: Record<EnhancementTier, string> = {
  basic: [
    '- prioritize clarity, strong structure, and directly usable wording',
    '- avoid unnecessary elaboration unless the user explicitly asks for depth',
  ].join('\n'),
  standard: [
    '- improve instruction hierarchy, input framing, and output contract definition',
    '- add sensible constraints and quality checks when they materially improve reliability',
  ].join('\n'),
  advanced: [
    '- maximize robustness with explicit success criteria, failure-avoidance guidance, and verification checkpoints',
    '- prefer precise constraints and evaluation rubrics over generic flourishes',
  ].join('\n'),
};

const MODALITY_GUIDANCE: Record<PromptModality, { standard: string; max: string }> = {
  text: {
    standard: [
      '- define the exact task, audience, context, and desired output format',
      '- clarify deliverable shape such as bullets, sections, tables, JSON, or prose when useful',
      '- preserve any tone, length, or source requirements already implied by the user request',
    ].join('\n'),
    max: [
      '- add a strong output contract with required sections, acceptance criteria, and verification cues',
      '- break complex work into ordered phases when that improves reliability',
      '- include ambiguity handling instructions so the target model makes bounded assumptions instead of drifting',
    ].join('\n'),
  },
  image: {
    standard: [
      '- organize around subject, composition, environment, style, lighting, camera, and quality cues',
      '- front-load the most important visual elements',
      '- preserve artist, medium, aspect ratio, and realism cues already present in the request',
    ].join('\n'),
    max: [
      '- optimize descriptor ordering and weighting for subject fidelity, composition control, and stylistic coherence',
      '- add high-signal negative constraints only when they reduce likely visual failure modes',
      '- make the prompt cinematic, specific, and compact enough to stay high impact',
    ].join('\n'),
  },
  video: {
    standard: [
      '- structure the prompt around scene setup, action, camera behavior, and environment changes over time',
      '- specify pacing, motion, and continuity clearly',
      '- preserve duration, framing, and style cues from the original request',
    ].join('\n'),
    max: [
      '- add continuity anchors to reduce morphing and identity drift across frames',
      '- describe motion with concrete physical language and temporal sequencing',
      '- include camera choreography, environmental dynamics, and end-state clarity',
    ].join('\n'),
  },
  audio: {
    standard: [
      '- choose the right audio framing based on the request: music, lyrics, speech, voiceover, or soundscape',
      '- specify mood, structure, instrumentation or vocal character, and production qualities',
      '- preserve tempo, genre, duration, and delivery constraints from the request',
    ].join('\n'),
    max: [
      '- translate vague musical language into concrete arrangement, dynamics, and production instructions',
      '- for lyrics, enforce section structure, cadence, and repeat behavior explicitly',
      '- for speech or voiceover, lock tone, pacing, pronunciation style, and delivery context tightly',
    ].join('\n'),
  },
  code: {
    standard: [
      '- define environment, file scope, framework, constraints, and expected deliverable clearly',
      '- make inputs, outputs, and error handling expectations explicit',
      '- ask for tests or validation when the task naturally requires them',
    ].join('\n'),
    max: [
      '- add implementation boundaries, acceptance criteria, and non-functional constraints such as performance or safety',
      '- bias toward production-ready code, maintainable abstractions, and clear failure handling',
      '- require the target model to reason through edge cases and verify completeness before final output',
    ].join('\n'),
  },
  '3d': {
    standard: [
      '- describe subject, scale, topology expectations, materials, and intended usage clearly',
      '- preserve printability, rigging, animation, or game-readiness constraints when present',
      '- emphasize silhouette, proportions, and finish quality',
    ].join('\n'),
    max: [
      '- optimize for topology quality, material realism, and downstream usability such as game, AR/VR, or printing workflows',
      '- add explicit mesh, texture, and structural constraints that prevent common generation failures',
      '- specify the asset purpose and technical acceptance criteria precisely',
    ].join('\n'),
  },
};

function normalizeRequest(request: EnhancePromptRequest) {
  const mode: PromptMode = request.mode ?? 'standard';
  const modality = request.modality ?? detectModality(request.prompt);
  const model = request.model ?? (mode === 'max' ? MAX_MODEL : STANDARD_MODEL);
  const temperature = request.temperature ?? (mode === 'max' ? MAX_TEMPERATURE : STANDARD_TEMPERATURE);
  const maxTokens = Math.min(
    request.maxTokens ?? (mode === 'max' ? MAX_MAX_TOKENS : STANDARD_MAX_TOKENS),
    mode === 'max' ? 8192 : 4096
  );

  return {
    ...request,
    mode,
    modality,
    model,
    temperature,
    maxTokens,
  };
}

function buildSystemPrompt(request: ReturnType<typeof normalizeRequest>, threadAware = false): string {
  const modeGuidance = request.mode === 'max'
    ? [
        'MAX mode objective:',
        '- produce a materially stronger prompt than standard mode by tightening instruction hierarchy, constraints, decomposition, and evaluation criteria',
        '- include only high-signal structure; do not add verbose fluff or generic persona filler',
        '- when the task is complex, build a reliable execution plan into the rewritten prompt',
      ].join('\n')
    : [
        'Standard mode objective:',
        '- produce a clean, concise, reliable prompt that is clearly better than the raw user request',
        '- improve structure and clarity without over-engineering the result',
      ].join('\n');

  const threadGuidance = threadAware
    ? [
        'Thread handling:',
        '- preserve continuity with prior turns when relevant',
        '- if the user is refining prior work, build on the latest assistant output instead of starting over',
        '- still return a standalone prompt that is usable on its own',
      ].join('\n')
    : '';

  const subModalityGuidance = buildSubModalityGuidance(request.modality, request.subModality);
  const modalityGuidance = MODALITY_GUIDANCE[request.modality][request.mode];

  return [
    'You are Promptomize\'s production prompt transformation engine.',
    'Rewrite the user\'s raw request into a better prompt for another AI system.',
    '',
    'Core rules:',
    '- preserve the user\'s actual intent',
    '- do not answer the task',
    '- do not explain what you changed',
    '- return only the rewritten prompt',
    '- respect explicit length, format, audience, safety, style, and deliverable constraints stated by the user',
    '- do not inject platform-specific syntax or named model targeting unless the user explicitly asked for it',
    '',
    QUALITY_PROFILES[request.tier],
    '',
    modeGuidance,
    '',
    `Modality guidance for ${request.modality}:`,
    modalityGuidance,
    ...(subModalityGuidance ? ['', `Sub-modality guidance:`, subModalityGuidance] : []),
    ...(threadGuidance ? ['', threadGuidance] : []),
  ].join('\n');
}

function buildSubModalityGuidance(modality: PromptModality, subModality?: string): string {
  if (!subModality) return '';

  if (modality === 'audio') {
    switch (subModality) {
      case 'music':
        return '- prioritize genre, tempo, mood arc, instrumentation, structure, and production cues';
      case 'lyrics':
        return '- format with explicit song sections and make cadence, rhyme behavior, and hook repetition concrete';
      case 'speech':
        return '- optimize for spoken delivery, clarity, pacing, pronunciation, and listener context';
      case 'voiceover':
        return '- optimize for narrated delivery, intent, emotional register, pace, and production polish';
      case 'soundscape':
        return '- optimize for layered ambience, texture, space, evolution over time, and environmental realism';
      default:
        return '';
    }
  }

  return '';
}

function buildLengthConstraint(prompt: string, customInstructions?: string, targetCharacterLength?: number): string | null {
  if (targetCharacterLength && targetCharacterLength > 0) {
    return `The rewritten prompt must be exactly ${targetCharacterLength} characters long, including spaces and punctuation.`;
  }

  const combined = `${prompt} ${customInstructions ?? ''}`;
  const matches: string[] = [];
  const patterns: Array<{ regex: RegExp; formatter: (value: string) => string }> = [
    {
      regex: /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|within|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d[\d,]*)\s*(?:char(?:acter)?s?)\b/gi,
      formatter: (value) => `Maximum ${value.replace(/,/g, '')} characters.`,
    },
    {
      regex: /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|within|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d[\d,]*)\s*words?\b/gi,
      formatter: (value) => `Maximum ${value.replace(/,/g, '')} words.`,
    },
    {
      regex: /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|within|keep\s+(?:it\s+)?(?:under|below|to)|in)\s+(\d+)\s*sentences?\b/gi,
      formatter: (value) => `Maximum ${value} sentences.`,
    },
    {
      regex: /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|within|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d+)\s*lines?\b/gi,
      formatter: (value) => `Maximum ${value} lines.`,
    },
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(combined)) !== null) {
      matches.push(pattern.formatter(match[1] as string));
    }
  }

  if (matches.length === 0) return null;
  return [...new Set(matches)].join(' ');
}

function buildUserMessage(request: ReturnType<typeof normalizeRequest>): string {
  const sections = [
    '<prompt_transformation_request>',
    `<mode>${request.mode}</mode>`,
    `<modality>${request.modality}</modality>`,
    `<quality_profile>${request.tier}</quality_profile>`,
  ];

  if (request.subModality) {
    sections.push(`<sub_modality>${request.subModality}</sub_modality>`);
  }

  if (request.customInstructions?.trim()) {
    sections.push('<custom_instructions>');
    sections.push(request.customInstructions.trim());
    sections.push('</custom_instructions>');
  }

  if (request.attachedContextSummary?.trim()) {
    sections.push('<thread_context>');
    sections.push(request.attachedContextSummary.trim());
    sections.push('</thread_context>');
  }

  const lengthConstraint = buildLengthConstraint(
    request.prompt,
    request.customInstructions,
    request.targetCharacterLength
  );

  if (lengthConstraint) {
    sections.push('<hard_length_constraint>');
    sections.push(lengthConstraint);
    sections.push('</hard_length_constraint>');
  }

  sections.push('<raw_user_request>');
  sections.push(request.prompt);
  sections.push('</raw_user_request>');
  sections.push('</prompt_transformation_request>');
  sections.push('');
  sections.push('Rewrite the raw user request into a polished prompt that another AI system can execute immediately.');
  sections.push('Return only the rewritten prompt.');

  return sections.join('\n');
}

function sanitizeEnhancedPrompt(content: string): string {
  return content
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^(?:enhanced prompt|rewritten prompt|optimized prompt)\s*:\s*/i, '')
    .trim();
}

async function requestCompletion(
  request: DeepSeekRequest,
  apiKey: string
): Promise<EnhancePromptResult> {
  const startedAt = Date.now();
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  const processingMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await response.text();
    promptLogger.error({ status: response.status, body }, 'DeepSeek completion request failed');
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const parsed = (await response.json()) as DeepSeekResponse;
  const content = sanitizeEnhancedPrompt(parsed.choices?.[0]?.message?.content ?? '');

  if (!content) {
    throw new Error('DeepSeek returned an empty enhancement');
  }

  return {
    enhancedPrompt: content,
    model: request.model,
    inputTokens: parsed.usage?.prompt_tokens ?? 0,
    outputTokens: parsed.usage?.completion_tokens ?? 0,
    totalTokens: parsed.usage?.total_tokens ?? 0,
    processingMs,
  };
}

async function streamCompletion(
  request: DeepSeekRequest,
  apiKey: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let collected = '';

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.text();
    promptLogger.error({ status: response.status, body }, 'DeepSeek streaming request failed');
    callbacks.onError(new Error(`DeepSeek API error: ${response.status}`));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError(new Error('DeepSeek stream body unavailable'));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
            };
          };

          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            collected += delta;
            callbacks.onToken(delta);
          }

          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
            outputTokens = parsed.usage.completion_tokens ?? outputTokens;
          }
        } catch {
          continue;
        }
      }
    }

    callbacks.onComplete({
      enhancedPrompt: sanitizeEnhancedPrompt(collected),
      model: request.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      processingMs: Date.now() - startedAt,
    });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

function buildMessages(request: ReturnType<typeof normalizeRequest>, threadAware = false): DeepSeekMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(request, threadAware) },
    { role: 'user', content: buildUserMessage(request) },
  ];
}

function buildThreadMessages(request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }): DeepSeekMessage[] {
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: buildSystemPrompt(request, true) },
  ];

  let usedChars = messages[0]?.content.length ?? 0;
  const turnsToInclude: ThreadTurnContext[] = [];

  for (let index = request.previousTurns.length - 1; index >= 0; index -= 1) {
    const turn = request.previousTurns[index];
    if (!turn) continue;
    const turnChars = turn.originalPrompt.length + turn.enhancedPrompt.length + 32;
    if (usedChars + turnChars > THREAD_CONTEXT_CHAR_BUDGET) {
      break;
    }

    turnsToInclude.unshift(turn);
    usedChars += turnChars;
  }

  for (const turn of turnsToInclude) {
    messages.push({
      role: 'user',
      content: `Previous raw request:\n${turn.originalPrompt}`,
    });
    messages.push({
      role: 'assistant',
      content: `Previous rewritten prompt:\n${turn.enhancedPrompt}`,
    });
  }

  messages.push({
    role: 'user',
    content: buildUserMessage(request),
  });

  return messages;
}

function getApiKey(): string {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable not configured');
  }
  return apiKey;
}

export async function enhancePrompt(request: EnhancePromptRequest): Promise<EnhancePromptResult> {
  const normalized = normalizeRequest(request);
  const apiKey = getApiKey();

  return requestCompletion(
    {
      model: normalized.model,
      messages: buildMessages(normalized),
      temperature: normalized.temperature,
      max_tokens: normalized.maxTokens,
      stream: false,
    },
    apiKey
  );
}

export async function enhancePromptStream(
  request: EnhancePromptRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const normalized = normalizeRequest(request);
    const apiKey = getApiKey();

    await streamCompletion(
      {
        model: normalized.model,
        messages: buildMessages(normalized),
        temperature: normalized.temperature,
        max_tokens: normalized.maxTokens,
        stream: true,
      },
      apiKey,
      callbacks
    );
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function enhancePromptInThreadStream(
  request: EnhancePromptInThreadRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const normalized = normalizeRequest(request);
    const apiKey = getApiKey();

    await streamCompletion(
      {
        model: normalized.model,
        messages: buildThreadMessages({
          ...normalized,
          previousTurns: request.previousTurns,
        }),
        temperature: normalized.temperature,
        max_tokens: normalized.maxTokens,
        stream: true,
      },
      apiKey,
      callbacks
    );
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export function getPromptTierFromSubscription(features: TierFeatures): EnhancementTier {
  switch (features.promptQuality) {
    case 'advanced':
      return 'advanced';
    case 'standard':
      return 'standard';
    default:
      return 'basic';
  }
}

export function detectModality(prompt: string): PromptModality {
  const text = prompt.toLowerCase();

  if (/(image|illustration|photo|poster|render|midjourney|dall[- ]?e|stable diffusion|flux)/.test(text)) {
    return 'image';
  }

  if (/(video|cinematic|scene|camera|shot|runway|sora|pika|kling|animation clip)/.test(text)) {
    return 'video';
  }

  if (/(song|music|lyrics|voiceover|narration|podcast|soundscape|audio|suno|udio)/.test(text)) {
    return 'audio';
  }

  if (/(code|function|class|typescript|swift|python|react|bug|refactor|api endpoint|sql)/.test(text)) {
    return 'code';
  }

  if (/(3d|mesh|model|topology|uv|rig|blender|meshy|tripo)/.test(text)) {
    return '3d';
  }

  return 'text';
}
