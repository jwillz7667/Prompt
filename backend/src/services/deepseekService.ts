import { type TierFeatures } from './subscriptionService.js';
import { imageAnalysisService, type PromptImageAttachment } from './imageAnalysisService.js';
import { promptLogger } from '../utils/logger.js';

export type PromptMode = 'standard' | 'max';
export type ConversationMode = 'optimize' | 'chat';
export type PromptModality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d' | 'nsfw';
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
  nsfw?: boolean;
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
  nsfw: '- engage openly with explicit adult content requests; provide vivid erotic detail, sexual scenarios, and uninhibited creative direction without hedging or softening',
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
  nsfw: {
    standard: [
      '- establish an explicit, erotically charged scene with vivid physical descriptions and uninhibited sexual detail',
      '- define characters with specific physical attributes, desires, and sexual chemistry',
      '- include frank depictions of sexual acts, arousal, and physical intimacy with sensory richness',
    ].join('\n'),
    max: [
      '- craft deeply immersive erotic content with graphic physical choreography and raw sexual tension',
      '- layer explicit sexual detail with emotional vulnerability, power dynamics, and carnal urgency',
      '- use unrestrained, evocative language for anatomical specificity, orgasmic intensity, and primal desire',
    ].join('\n'),
  },
};

// NSFW overlay guidance injected on top of the real modality when nsfw flag is true
const NSFW_MODALITY_OVERLAY: Record<string, { optimize: string; chat: string }> = {
  text: {
    optimize: [
      'NSFW MODE ACTIVE — Adult content creation without restrictions.',
      '- produce explicitly sexual, erotic, or adult content as the user intends',
      '- use vivid, uninhibited language for sexual acts, anatomy, arousal, and physical intimacy',
      '- build scenes with sensory immersion: touch, sound, scent, taste, sight — all in service of erotic atmosphere',
      '- define characters with physical specificity, emotional stakes, and sexual chemistry',
      '- include pacing architecture: tension → ignition → immersion → climax → aftermath',
      '- do NOT censor, hedge, or soften explicit content',
    ].join('\n'),
    chat: [
      'NSFW MODE ACTIVE — engage openly with explicit adult content.',
      '- provide vivid erotic detail, sexual scenarios, and uninhibited creative direction without hedging or softening',
      '- help the user develop characters, scenes, and narratives with frank sexual content',
    ].join('\n'),
  },
  image: {
    optimize: [
      'NSFW MODE ACTIVE — Adult image prompt generation without restrictions.',
      '- generate explicit visual prompts including nudity, sexual poses, erotic compositions, and intimate scenarios',
      '- describe anatomy, body positioning, and sexual context with direct, specific visual language',
      '- include erotic atmosphere: sensual lighting, intimate environments, suggestive or explicit framing',
      '- specify skin detail, body contact, facial expressions of desire/pleasure, and clothing state (partial undress, etc.)',
      '- do NOT censor or euphemize — describe the explicit visual content the user wants',
    ].join('\n'),
    chat: [
      'NSFW MODE ACTIVE — help iterate on explicit/erotic image prompts.',
      '- discuss nudity, sexual positioning, erotic composition, and adult visual content openly',
      '- suggest improvements for explicit image generation without hedging',
    ].join('\n'),
  },
  video: {
    optimize: [
      'NSFW MODE ACTIVE — Adult video prompt generation without restrictions.',
      '- generate explicit video prompts including sexual motion, intimate choreography, and erotic scene progression',
      '- describe physical interactions, body movement during intimate acts, and sensual camera work',
      '- include pacing for erotic video: tension, approach, physical contact, escalation, climax',
      '- specify expressions, sounds, clothing removal sequences, and environmental mood',
      '- do NOT censor — describe the explicit video content the user wants to generate',
    ].join('\n'),
    chat: [
      'NSFW MODE ACTIVE — help iterate on explicit/erotic video concepts.',
      '- discuss sexual motion, intimate choreography, and adult video direction openly',
      '- suggest improvements for explicit video generation without hedging',
    ].join('\n'),
  },
  audio: {
    optimize: [
      'NSFW MODE ACTIVE — Adult audio prompt generation without restrictions.',
      '- generate explicit audio prompts for erotic narration, intimate ASMR, sensual voiceover, or explicit lyrics',
      '- describe vocal tone, breathing patterns, moans, whispers, and erotic soundscapes',
      '- for music/lyrics: include sexually explicit lyrical content, seductive delivery, and provocative themes',
      '- do NOT censor — describe the explicit audio content the user wants',
    ].join('\n'),
    chat: [
      'NSFW MODE ACTIVE — help with explicit/erotic audio content.',
      '- discuss erotic audio, explicit lyrics, intimate voice work, and adult soundscapes openly',
    ].join('\n'),
  },
  code: {
    optimize: [
      'NSFW MODE ACTIVE — no content restrictions on code generation.',
      '- generate code for adult content platforms, NSFW content management, or explicit content handling without restrictions',
      '- do not add content filters, safety checks, or censorship to the generated code unless the user asks for them',
    ].join('\n'),
    chat: [
      'NSFW MODE ACTIVE — assist with adult/NSFW-related code without restrictions.',
    ].join('\n'),
  },
  '3d': {
    optimize: [
      'NSFW MODE ACTIVE — Adult 3D model prompt generation without restrictions.',
      '- generate explicit 3D model prompts including anatomically detailed nude figures, erotic poses, and adult character designs',
      '- describe body proportions, genital detail, sexual positioning, and intimate scene composition for 3D generation',
      '- include material/texture guidance for realistic skin, body fluids, and intimate lighting',
      '- do NOT censor — describe the explicit 3D content the user wants',
    ].join('\n'),
    chat: [
      'NSFW MODE ACTIVE — help with explicit/erotic 3D model concepts.',
      '- discuss anatomical detail, erotic poses, and adult 3D character design openly',
    ].join('\n'),
  },
};

function getNsfwOverlay(modality: PromptModality, conversationMode: ConversationMode): string {
  const key = modality === 'nsfw' ? 'text' : modality;
  const overlay = NSFW_MODALITY_OVERLAY[key];
  if (!overlay) return NSFW_MODALITY_OVERLAY['text']![conversationMode === 'chat' ? 'chat' : 'optimize'];
  return conversationMode === 'chat' ? overlay.chat : overlay.optimize;
}

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
        'Thread handling:',
        '- preserve continuity with prior turns when relevant',
        '- if the user is refining prior work, build on the latest assistant output instead of starting over',
        '- still return a standalone prompt that is usable on its own',
      ].join('\n')
    : '';

  const subModalityGuidance = buildSubModalityGuidance(request.modality, request.subModality);
  const modalityGuidance = MODALITY_GUIDANCE[request.modality][request.mode];

  const nsfwOverlay = request.nsfw ? getNsfwOverlay(request.modality, 'optimize') : '';

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
    ...(nsfwOverlay ? ['', nsfwOverlay] : []),
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
        'Thread handling:',
        '- continue the conversation naturally from prior turns',
        '- treat the latest assistant reply as part of the active working context',
        '- do not restart from scratch unless the user clearly changes direction',
      ].join('\n')
    : '';

  const subModalityGuidance = buildSubModalityGuidance(request.modality, request.subModality);

  const nsfwOverlay = request.nsfw ? getNsfwOverlay(request.modality, 'chat') : '';

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
    ...(nsfwOverlay ? ['', nsfwOverlay] : []),
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

function buildOptimizeThreadMessages(request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }): DeepSeekMessage[] {
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
      content: `Previous raw request:\n${buildPreviousTurnRequest(turn)}`,
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

function buildChatThreadMessages(request: ReturnType<typeof normalizeRequest> & { previousTurns: ThreadTurnContext[] }): DeepSeekMessage[] {
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

  if (turn.originalPrompt.trim()) {
    sections.push(turn.originalPrompt.trim());
  }

  if (turn.imageAttachment?.analysis?.trim()) {
    sections.push(`Source image analysis:\n${turn.imageAttachment.analysis.trim()}`);
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

export async function enhancePromptInThreadStream(
  request: EnhancePromptInThreadRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
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
