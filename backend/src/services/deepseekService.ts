import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { type TierFeatures } from './subscriptionService.js';
import { imageAnalysisService, type PromptImageAttachment } from './imageAnalysisService.js';
import { promptLogger } from '../utils/logger.js';

export type PromptMode = 'standard' | 'max';
export type ConversationMode = 'optimize' | 'chat';
export type PromptModality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d';
export type EnhancementTier = 'basic' | 'standard' | 'advanced';

export interface EnhancePromptRequest {
  prompt: string;
  tier: EnhancementTier;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  mode?: PromptMode;
  conversationMode?: ConversationMode;
  modality?: PromptModality;
  subModality?: string;
  customInstructions?: string;
  imageAttachment?: PromptImageAttachment;
}

export interface EnhancePromptResult {
  enhancedPrompt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  processingMs: number;
  imageAttachment?: PromptImageAttachment;
}

export interface ThreadTurnContext {
  originalPrompt: string;
  enhancedPrompt: string;
  imageAttachment?: PromptImageAttachment;
}

export interface EnhancePromptInThreadRequest extends EnhancePromptRequest {
  previousTurns: ThreadTurnContext[];
}

export interface StreamCallbacks {
  onToken: (token: string) => void | Promise<void>;
  onComplete: (result: EnhancePromptResult) => void | Promise<void>;
  onError: (error: Error) => void | Promise<void>;
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

// Vision-capable OpenAI models used when a request includes an image. DeepSeek's
// chat endpoint is text-only, so any image would collapse to a short analysis
// blurb — we route those through GPT-4.1 vision so the model actually sees the
// pixels and can maintain visual context across a whole thread.
const OPENAI_VISION_STANDARD_MODEL = 'gpt-4.1-mini';
const OPENAI_VISION_MAX_MODEL = 'gpt-4.1';

const QUALITY_PROFILES: Record<EnhancementTier, string> = {
  basic: [
    '- provide a clear, straightforward improvement over the original prompt',
    '- add basic structure: define the task, specify the desired output format, and set a reasonable length',
    '- keep the enhanced prompt short and focused — no advanced techniques, no elaborate scaffolding',
    '- do NOT include XML tags, reasoning chains, self-verification, or expert personas',
    '- the result should be a modest improvement that clarifies intent and adds minimal structure',
  ].join('\n'),
  standard: [
    '- improve instruction hierarchy, input framing, and output contract definition',
    '- add sensible constraints and quality checks when they materially improve reliability',
    '- use structured sections (task, context, format, constraints) to organize the prompt',
    '- add Chain-of-Thought triggers for analytical tasks',
  ].join('\n'),
  advanced: [
    '- apply every cutting-edge prompt engineering technique that improves reliability for this specific task:',
    '  * Meta Chain-of-Thought: embed explicit reasoning scaffolds that guide the target model through multi-step deliberation before producing output',
    '  * Structured XML semantics: wrap distinct prompt sections in semantic XML tags (<task>, <context>, <constraints>, <output_contract>, <verification>) for 15-20% parsing improvement',
    '  * Self-Refine hooks: instruct the target model to draft, critique its own output against success criteria, then revise before returning the final result',
    '  * Persona-calibrated framing: assign a precise expert identity with domain depth, reasoning style, and epistemic standards',
    '  * Recursive decomposition: break complex objectives into ordered sub-tasks with explicit dependency chains and intermediate checkpoints',
    '  * Calibrated confidence prompting: require the target model to flag uncertainty levels and distinguish established facts from inferences',
    '  * Negative constraint engineering: add high-signal NEVER rules that preempt the most likely failure modes for this specific task type',
    '  * Output contract specification: define exact deliverable shape, acceptance criteria, and quality rubric so the target model self-evaluates',
    '  * Few-shot reasoning traces: when examples are warranted, include the reasoning path (not just input→output) so the model learns the thought process',
    '  * Multi-perspective simulation: for analytical tasks, instruct the model to evaluate from multiple stakeholder or methodological viewpoints before synthesizing',
    '  * Chain of Verification: instruct the model to formulate verification questions targeting its own subclaims, answer them in isolation, then synthesize a more reliable final output',
    '  * Contrastive reasoning: when examples are used, include both correct AND incorrect reasoning traces so the model learns what mistakes to avoid',
    '  * Step-back abstraction: for complex problems, instruct the model to identify underlying principles first before tackling specifics',
    '- the enhanced prompt should be comprehensive, production-grade, and dramatically superior to what an unassisted user would write',
    '- prefer precise constraints and evaluation rubrics over generic flourishes',
  ].join('\n'),
};

const CHAT_MODALITY_GUIDANCE: Record<PromptModality, string> = {
  text: '- answer clearly and directly; use structure only when it improves comprehension',
  image: '- help the user iterate on visual direction, prompt wording, composition, and generation tradeoffs',
  video: '- speak concretely about scene progression, motion, camera language, and continuity',
  audio: '- respond with practical guidance for music, lyrics, narration, voiceover, or sound design requests',
  code: '- give production-minded technical help, explain tradeoffs precisely, and include code only when useful',
  '3d': '- respond with concrete guidance on form, materials, topology, technical constraints, and downstream use',
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
  const conversationMode: ConversationMode = request.conversationMode ?? 'optimize';
  const modality = request.modality ?? detectModality(request.prompt);
  const model = request.model ?? (mode === 'max' ? MAX_MODEL : STANDARD_MODEL);
  const temperature = request.temperature ?? (mode === 'max' ? MAX_TEMPERATURE : STANDARD_TEMPERATURE);
  const maxTokens = Math.min(
    request.maxTokens ?? (mode === 'max' ? MAX_MAX_TOKENS : STANDARD_MAX_TOKENS),
    mode === 'max' ? 8192 : 4096
  );

  return {
    ...request,
    prompt: normalizePromptText(request.prompt, modality, request.imageAttachment, conversationMode),
    mode,
    conversationMode,
    modality,
    model,
    temperature,
    maxTokens,
  };
}

function normalizePromptText(
  prompt: string,
  modality: PromptModality,
  imageAttachment: PromptImageAttachment | undefined,
  conversationMode: ConversationMode
): string {
  const trimmed = prompt.trim();
  if (trimmed) {
    return trimmed;
  }

  if (!imageAttachment) {
    return trimmed;
  }

  if (conversationMode === 'chat') {
    switch (modality) {
      case 'video':
        return 'Use the uploaded image as context and help the user discuss how to turn it into a stronger video concept.';
      case 'image':
        return 'Use the uploaded image as context and help the user improve or discuss the prompt for it.';
      default:
        return 'Use the uploaded image as the main context for the conversation and help the user move the work forward.';
    }
  }

  switch (modality) {
    case 'video':
      return 'Turn this uploaded image into a production-ready video generation prompt that preserves the scene while adding believable motion.';
    case 'image':
      return 'Turn this uploaded image into a stronger image generation prompt while preserving its visual identity.';
    default:
      return 'Use the uploaded image as the primary reference while rewriting the prompt.';
  }
}

function buildOptimizeSystemPrompt(request: ReturnType<typeof normalizeRequest>, threadAware = false): string {
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
        'Thread / refinement handling (CRITICAL):',
        '- when prior turns exist, the user\'s newest message is almost always a REFINEMENT INSTRUCTION for the most recent enhanced prompt — NOT a brand-new raw request',
        '- start from the most recent assistant output (the prior enhanced prompt) and apply the user\'s new instruction to it',
        '- preserve ALL prior decisions, structure, tone, constraints, and style unless the user explicitly asks to change them',
        '- when the user input is wrapped in <refinement_request>, treat <prior_enhanced_prompt> as the base and apply <user_refinement_instruction> as a targeted edit',
        '- only start from scratch if the user clearly changes topic, says "new prompt", or asks for something unrelated to the existing thread',
        '- do not acknowledge the refinement, do not explain what you changed — return the full revised prompt only',
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
    ...(request.imageAttachment
      ? [
          '- when a source image is provided, treat the source image analysis as canonical scene context',
          '- preserve visible subject identity, composition, environment, and lighting unless the user explicitly asks to transform them',
        ]
      : []),
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

function buildChatSystemPrompt(request: ReturnType<typeof normalizeRequest>, threadAware = false): string {
  const modeGuidance = request.mode === 'max'
    ? [
        'MAX mode objective:',
        '- provide a materially stronger answer by reasoning carefully, tightening structure, and surfacing tradeoffs explicitly',
        '- stay concise unless the user asks for more depth',
      ].join('\n')
    : [
        'Standard mode objective:',
        '- provide a direct, helpful answer quickly',
        '- stay clear, concrete, and easy to use',
      ].join('\n');

  const threadGuidance = threadAware
    ? [
        'Thread handling (CRITICAL):',
        '- this is an ongoing conversation — ALWAYS treat prior user messages and your prior replies as the active working context',
        '- read the full conversation history above before answering — the newest user message is a continuation, not a fresh start',
        '- if the user previously uploaded an image (see <source_image_analysis> in earlier turns), keep that visual context in mind for every subsequent reply',
        '- do not restart, reintroduce yourself, or ask the user to repeat context they already provided',
        '- only change direction if the user clearly says "new topic" or "start over"',
      ].join('\n')
    : '';

  const subModalityGuidance = buildSubModalityGuidance(request.modality, request.subModality);

  return [
    'You are Promptomize\'s collaborative AI assistant inside a prompt-building workspace.',
    'Answer the user directly and help them continue the conversation.',
    '',
    'Core rules:',
    '- answer the user instead of rewriting their request into a prompt unless they explicitly ask for a rewrite',
    '- keep the reply actionable and grounded in the user\'s latest message',
    '- when the user asks to improve or rewrite a prompt, provide the improved prompt directly and keep commentary minimal unless asked',
    '- respect explicit constraints, tone, length, and formatting requirements',
    ...(request.imageAttachment
      ? [
          '- when a source image is present, treat the image analysis as canonical visual context unless the user asks to transform it',
        ]
      : []),
    '',
    modeGuidance,
    '',
    `Modality guidance for ${request.modality}:`,
    CHAT_MODALITY_GUIDANCE[request.modality],
    ...(subModalityGuidance ? ['', 'Sub-modality guidance:', subModalityGuidance] : []),
    ...(threadGuidance ? ['', threadGuidance] : []),
  ].join('\n');
}

function buildSystemPrompt(request: ReturnType<typeof normalizeRequest>, threadAware = false): string {
  if (request.conversationMode === 'chat') {
    return buildChatSystemPrompt(request, threadAware);
  }

  return buildOptimizeSystemPrompt(request, threadAware);
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

function buildLengthConstraint(prompt: string, customInstructions?: string): string | null {
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

function buildOptimizeUserMessage(request: ReturnType<typeof normalizeRequest>): string {
  const sections = [
    '<prompt_transformation_request>',
    `<conversation_mode>${request.conversationMode}</conversation_mode>`,
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

  const lengthConstraint = buildLengthConstraint(
    request.prompt,
    request.customInstructions
  );

  if (lengthConstraint) {
    sections.push('<hard_length_constraint>');
    sections.push(lengthConstraint);
    sections.push('</hard_length_constraint>');
  }

  if (request.imageAttachment) {
    sections.push('<source_image>');
    sections.push(`<mime_type>${request.imageAttachment.mimeType}</mime_type>`);
    sections.push(`<dimensions>${request.imageAttachment.width}x${request.imageAttachment.height}</dimensions>`);
    if (request.imageAttachment.analysis?.trim()) {
      sections.push('<visual_analysis>');
      sections.push(request.imageAttachment.analysis.trim());
      sections.push('</visual_analysis>');
    }
    sections.push('</source_image>');
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

function buildOptimizeRefinementUserMessage(
  request: ReturnType<typeof normalizeRequest>,
  priorEnhancedPrompt: string
): string {
  const sections = [
    '<refinement_request>',
    `<conversation_mode>${request.conversationMode}</conversation_mode>`,
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

  const lengthConstraint = buildLengthConstraint(
    request.prompt,
    request.customInstructions
  );

  if (lengthConstraint) {
    sections.push('<hard_length_constraint>');
    sections.push(lengthConstraint);
    sections.push('</hard_length_constraint>');
  }

  if (request.imageAttachment) {
    sections.push('<source_image>');
    sections.push(`<mime_type>${request.imageAttachment.mimeType}</mime_type>`);
    sections.push(`<dimensions>${request.imageAttachment.width}x${request.imageAttachment.height}</dimensions>`);
    if (request.imageAttachment.analysis?.trim()) {
      sections.push('<visual_analysis>');
      sections.push(request.imageAttachment.analysis.trim());
      sections.push('</visual_analysis>');
    }
    sections.push('</source_image>');
  }

  sections.push('<prior_enhanced_prompt>');
  sections.push(priorEnhancedPrompt);
  sections.push('</prior_enhanced_prompt>');

  sections.push('<user_refinement_instruction>');
  sections.push(request.prompt);
  sections.push('</user_refinement_instruction>');
  sections.push('</refinement_request>');
  sections.push('');
  sections.push('Apply the <user_refinement_instruction> to <prior_enhanced_prompt>. Preserve its structure, intent, and all prior constraints unless the user explicitly asks to change them. Do not start from scratch. Return only the full revised prompt — no explanation, no preamble, no diff.');

  return sections.join('\n');
}

function buildChatUserMessage(request: ReturnType<typeof normalizeRequest>): string {
  const sections: string[] = [];

  if (request.imageAttachment) {
    sections.push('Source image context:');
    sections.push(`- MIME type: ${request.imageAttachment.mimeType}`);
    sections.push(`- Dimensions: ${request.imageAttachment.width}x${request.imageAttachment.height}`);
    if (request.imageAttachment.analysis?.trim()) {
      sections.push(`- Visual analysis: ${request.imageAttachment.analysis.trim()}`);
    }
    sections.push('');
  }

  if (request.customInstructions?.trim()) {
    sections.push('Additional instructions:');
    sections.push(request.customInstructions.trim());
    sections.push('');
  }

  const lengthConstraint = buildLengthConstraint(
    request.prompt,
    request.customInstructions
  );

  if (lengthConstraint) {
    sections.push(`Length constraint: ${lengthConstraint}`);
    sections.push('');
  }

  sections.push(request.prompt);
  return sections.join('\n');
}

function buildUserMessage(request: ReturnType<typeof normalizeRequest>): string {
  if (request.conversationMode === 'chat') {
    return buildChatUserMessage(request);
  }

  return buildOptimizeUserMessage(request);
}

function sanitizeModelOutput(content: string, conversationMode: ConversationMode): string {
  if (conversationMode === 'chat') {
    return content.trim();
  }

  return content
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^(?:enhanced prompt|rewritten prompt|optimized prompt)\s*:\s*/i, '')
    .trim();
}

async function requestCompletion(
  request: DeepSeekRequest,
  apiKey: string,
  conversationMode: ConversationMode
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
  const content = sanitizeModelOutput(parsed.choices?.[0]?.message?.content ?? '', conversationMode);

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
  conversationMode: ConversationMode,
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
    await callbacks.onError(new Error(`DeepSeek API error: ${response.status}`));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    await callbacks.onError(new Error('DeepSeek stream body unavailable'));
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
            await callbacks.onToken(delta);
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

    await callbacks.onComplete({
      enhancedPrompt: sanitizeModelOutput(collected, conversationMode),
      model: request.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      processingMs: Date.now() - startedAt,
    });
  } catch (error) {
    await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

function buildMessages(request: ReturnType<typeof normalizeRequest>, threadAware = false): DeepSeekMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(request, threadAware) },
    { role: 'user', content: buildUserMessage(request) },
  ];
}

function buildThreadMessages(request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }): DeepSeekMessage[] {
  if (request.conversationMode === 'chat') {
    return buildChatThreadMessages(request);
  }

  return buildOptimizeThreadMessages(request);
}

/**
 * Smart budget-based trimming that prioritizes keeping both the foundation
 * turn (index 0) AND the most recent turns, since those two ends hold the
 * most signal for follow-up refinements. When the char budget is exhausted
 * we drop from the MIDDLE of the conversation rather than silently losing
 * the whole early context (which is what caused the "AI forgets after 3-4
 * turns" regression — a single large response could trigger the old backward
 * break and evict every earlier turn).
 */
function selectTurnsWithinBudget(
  previousTurns: ThreadTurnContext[],
  alreadyUsedChars: number
): ThreadTurnContext[] {
  if (previousTurns.length === 0) return [];

  const charCost = (turn: ThreadTurnContext) =>
    turn.originalPrompt.length +
    turn.enhancedPrompt.length +
    (turn.imageAttachment?.analysis?.length ?? 0) +
    64;

  // Fast path: if every turn fits, keep them all in order.
  const totalRequired = previousTurns.reduce(
    (sum, turn) => sum + charCost(turn),
    alreadyUsedChars
  );
  if (totalRequired <= THREAD_CONTEXT_CHAR_BUDGET) {
    return [...previousTurns];
  }

  // Budget exceeded: always keep the foundation turn (#0) plus as many of the
  // most recent turns as fit. Middle turns are dropped.
  const foundation = previousTurns[0];
  if (!foundation) return [];
  let usedChars = alreadyUsedChars + charCost(foundation);

  const recentTurns: ThreadTurnContext[] = [];
  for (let i = previousTurns.length - 1; i >= 1; i -= 1) {
    const turn = previousTurns[i];
    if (!turn) continue;
    const cost = charCost(turn);
    if (usedChars + cost > THREAD_CONTEXT_CHAR_BUDGET) continue;
    recentTurns.unshift(turn);
    usedChars += cost;
  }

  return [foundation, ...recentTurns];
}

function buildOptimizeThreadMessages(request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }): DeepSeekMessage[] {
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: buildSystemPrompt(request, true) },
  ];

  const systemChars = messages[0]?.content.length ?? 0;
  const turnsToInclude = selectTurnsWithinBudget(request.previousTurns, systemChars);

  for (const turn of turnsToInclude) {
    messages.push({
      role: 'user',
      content: buildPreviousTurnRequest(turn),
    });
    messages.push({
      role: 'assistant',
      content: turn.enhancedPrompt,
    });
  }

  const hasPriorEnhanced = turnsToInclude.length > 0;
  const latestPriorEnhanced = hasPriorEnhanced
    ? turnsToInclude[turnsToInclude.length - 1]?.enhancedPrompt?.trim() ?? ''
    : '';

  messages.push({
    role: 'user',
    content: hasPriorEnhanced && latestPriorEnhanced
      ? buildOptimizeRefinementUserMessage(request, latestPriorEnhanced)
      : buildUserMessage(request),
  });

  return messages;
}

function buildChatThreadMessages(request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }): DeepSeekMessage[] {
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: buildSystemPrompt(request, true) },
  ];

  const systemChars = messages[0]?.content.length ?? 0;
  const turnsToInclude = selectTurnsWithinBudget(request.previousTurns, systemChars);

  for (const turn of turnsToInclude) {
    messages.push({
      role: 'user',
      content: buildPreviousTurnRequest(turn),
    });
    messages.push({
      role: 'assistant',
      content: turn.enhancedPrompt,
    });
  }

  messages.push({
    role: 'user',
    content: buildUserMessage(request),
  });

  return messages;
}

function buildPreviousTurnRequest(turn: ThreadTurnContext): string {
  const sections: string[] = [];

  if (turn.imageAttachment?.analysis?.trim()) {
    sections.push('<source_image_analysis>');
    if (turn.imageAttachment.mimeType) {
      sections.push(`mime_type: ${turn.imageAttachment.mimeType}`);
    }
    if (turn.imageAttachment.width && turn.imageAttachment.height) {
      sections.push(`dimensions: ${turn.imageAttachment.width}x${turn.imageAttachment.height}`);
    }
    sections.push(turn.imageAttachment.analysis.trim());
    sections.push('</source_image_analysis>');
  }

  if (turn.originalPrompt.trim()) {
    sections.push(turn.originalPrompt.trim());
  }

  if (sections.length === 0) {
    return 'Image-driven request with no additional text instructions.';
  }

  return sections.join('\n\n');
}

async function enrichRequestWithImageAnalysis<T extends EnhancePromptRequest>(request: T): Promise<T> {
  if (!request.imageAttachment) {
    return request;
  }

  return {
    ...request,
    imageAttachment: await imageAnalysisService.enrichAttachmentForPrompt(
      request.imageAttachment,
      request.prompt,
      request.modality ?? detectModality(request.prompt)
    ),
  };
}

function getApiKey(): string {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable not configured');
  }
  return apiKey;
}

export async function enhancePrompt(request: EnhancePromptRequest): Promise<EnhancePromptResult> {
  const enrichedRequest = await enrichRequestWithImageAnalysis(request);
  const normalized = normalizeRequest(enrichedRequest);
  const apiKey = getApiKey();

  const result = await requestCompletion(
    {
      model: normalized.model,
      messages: buildMessages(normalized),
      temperature: normalized.temperature,
      max_tokens: normalized.maxTokens,
      stream: false,
    },
    apiKey,
    normalized.conversationMode
  );

  return {
    ...result,
    imageAttachment: normalized.imageAttachment,
  };
}

export async function enhancePromptStream(
  request: EnhancePromptRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const enrichedRequest = await enrichRequestWithImageAnalysis(request);
    const normalized = normalizeRequest(enrichedRequest);
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
      normalized.conversationMode,
      {
        ...callbacks,
        onComplete: (result) => {
          callbacks.onComplete({
            ...result,
            imageAttachment: normalized.imageAttachment,
          });
        },
      }
    );
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

function hasImageContext(request: EnhancePromptInThreadRequest): boolean {
  if (request.imageAttachment?.dataUrl) return true;
  return request.previousTurns.some((turn) => !!turn.imageAttachment?.dataUrl);
}

function selectVisionModel(mode: PromptMode): string {
  return mode === 'max' ? OPENAI_VISION_MAX_MODEL : OPENAI_VISION_STANDARD_MODEL;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not configured');
  }
  return new OpenAI({ apiKey });
}

function buildVisionThreadMessages(
  request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }
): ChatCompletionMessageParam[] {
  const systemContent = buildSystemPrompt(request, true);
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
  ];

  const turnsToInclude = selectTurnsWithinBudget(request.previousTurns, systemContent.length);

  for (const turn of turnsToInclude) {
    const priorUserText = buildPreviousTurnRequest(turn);
    if (turn.imageAttachment?.dataUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: priorUserText },
          {
            type: 'image_url',
            image_url: { url: turn.imageAttachment.dataUrl, detail: 'auto' },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: priorUserText });
    }

    messages.push({ role: 'assistant', content: turn.enhancedPrompt });
  }

  const hasPrior = turnsToInclude.length > 0;
  const latestPriorEnhanced = hasPrior
    ? turnsToInclude[turnsToInclude.length - 1]?.enhancedPrompt?.trim() ?? ''
    : '';

  const latestText = request.conversationMode === 'chat'
    ? buildChatUserMessage(request)
    : hasPrior && latestPriorEnhanced
      ? buildOptimizeRefinementUserMessage(request, latestPriorEnhanced)
      : buildOptimizeUserMessage(request);

  if (request.imageAttachment?.dataUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: latestText },
        {
          type: 'image_url',
          image_url: { url: request.imageAttachment.dataUrl, detail: 'auto' },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: latestText });
  }

  return messages;
}

async function streamOpenAIVisionCompletion(
  messages: ChatCompletionMessageParam[],
  model: string,
  temperature: number,
  maxTokens: number,
  conversationMode: ConversationMode,
  callbacks: StreamCallbacks
): Promise<void> {
  const startedAt = Date.now();
  let collected = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const client = getOpenAIClient();
    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        collected += delta;
        await callbacks.onToken(delta);
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }
    }

    await callbacks.onComplete({
      enhancedPrompt: sanitizeModelOutput(collected, conversationMode),
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      processingMs: Date.now() - startedAt,
    });
  } catch (error) {
    promptLogger.error({ err: error }, 'OpenAI vision streaming failed');
    await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

async function enhancePromptInThreadVisionStream(
  request: EnhancePromptInThreadRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  const enrichedRequest = await enrichRequestWithImageAnalysis(request);
  const normalized = normalizeRequest(enrichedRequest);
  const messages = buildVisionThreadMessages({
    ...normalized,
    previousTurns: request.previousTurns,
  });
  const model = selectVisionModel(normalized.mode);

  await streamOpenAIVisionCompletion(
    messages,
    model,
    normalized.temperature,
    normalized.maxTokens,
    normalized.conversationMode,
    {
      ...callbacks,
      onComplete: (result) => {
        callbacks.onComplete({
          ...result,
          imageAttachment: normalized.imageAttachment,
        });
      },
    }
  );
}

export async function enhancePromptInThreadStream(
  request: EnhancePromptInThreadRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    // Any image anywhere in the thread (current turn or prior turn) routes
    // through a vision-capable OpenAI model so the AI actually sees the
    // pixels. DeepSeek is text-only and would only receive a text summary,
    // which is why "images don't get used as context" was reported.
    if (hasImageContext(request)) {
      await enhancePromptInThreadVisionStream(request, callbacks);
      return;
    }

    const enrichedRequest = await enrichRequestWithImageAnalysis(request);
    const normalized = normalizeRequest(enrichedRequest);
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
      normalized.conversationMode,
      {
        ...callbacks,
        onComplete: (result) => {
          callbacks.onComplete({
            ...result,
            imageAttachment: normalized.imageAttachment,
          });
        },
      }
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
