/**
 * Platform Syntax Adapters
 *
 * Provides platform-specific syntax transformations for different AI tools.
 * Each adapter knows the conventions and special syntax for its platform.
 */

import type { TargetPlatform, PromptModality } from '../types.js';

// ============================================================================
// PLATFORM SYNTAX RULES
// ============================================================================

interface PlatformAdapter {
  platform: TargetPlatform;
  modality: PromptModality;
  syntaxRules: string[];
  appendParameters?: (prompt: string, options?: Record<string, string | number>) => string;
  formatHints: string[];
}

// ============================================================================
// IMAGE PLATFORM ADAPTERS
// ============================================================================

const midjourneyAdapter: PlatformAdapter = {
  platform: 'midjourney',
  modality: 'image',
  syntaxRules: [
    'Parameters go at the end: --ar, --v, --s, --q, --c',
    '--ar X:Y sets aspect ratio (16:9, 4:5, 1:1, 9:16)',
    '--v 6.1 specifies version (latest is 6.1)',
    '--s 0-1000 controls stylization (higher = more artistic)',
    '--q 0.25-1 controls quality/detail level',
    '--c 0-100 controls chaos/variety',
    '--no [term] excludes concepts (negative prompt)',
    '--style raw for less processing',
    'Multi-prompts use :: for weighting (cat::2 dog::1)',
    'Permutations use {opt1, opt2} for variations',
  ],
  appendParameters: (prompt: string, options?: Record<string, string | number>) => {
    const params: string[] = [];

    if (options?.aspectRatio) params.push(`--ar ${options.aspectRatio}`);
    if (options?.version) params.push(`--v ${options.version}`);
    if (options?.stylize) params.push(`--s ${options.stylize}`);
    if (options?.quality) params.push(`--q ${options.quality}`);
    if (options?.chaos) params.push(`--c ${options.chaos}`);

    return params.length > 0 ? `${prompt} ${params.join(' ')}` : prompt;
  },
  formatHints: [
    'Keep prompts under 150 words',
    'Lead with subject, end with style/quality',
    'Use specific artist/style references',
    'Avoid starting with "A photo of" or "An image of"',
  ],
};

const dalleAdapter: PlatformAdapter = {
  platform: 'dalle',
  modality: 'image',
  syntaxRules: [
    'Natural language descriptions work best',
    'No special parameter syntax',
    'Be specific but conversational',
    'Avoid technical photography jargon',
    'Style and artistic references in plain English',
    'Quality modifiers less impactful than in MJ',
  ],
  formatHints: [
    'Write as complete sentences',
    'Describe the scene as you would to another person',
    'Include emotional/atmospheric qualities',
    'Less is more - overly detailed prompts can confuse',
  ],
};

const stableDiffusionAdapter: PlatformAdapter = {
  platform: 'stable-diffusion',
  modality: 'image',
  syntaxRules: [
    'Use weight syntax: (keyword:1.3) for emphasis',
    'Negative prompts in separate field',
    'LoRA references: <lora:name:weight>',
    'Embedding references: embedding:name',
    'Prompt weighting: (term:0.5-1.5)',
    'BREAK separates prompt sections',
    'Quality tags: masterpiece, best quality, detailed',
  ],
  formatHints: [
    'Start with quality tags for checkpoint models',
    'Use weighting for emphasis (1.0-1.4 typical)',
    'Separate concepts with commas',
    'Negative prompt as important as positive',
    'Match prompt style to model training data',
  ],
};

const fluxAdapter: PlatformAdapter = {
  platform: 'flux',
  modality: 'image',
  syntaxRules: [
    'Clean, natural language prompts preferred',
    'Less modifier stacking than SD/MJ',
    'Good text rendering capability',
    'Handles longer descriptive prompts well',
    'No special syntax required',
  ],
  formatHints: [
    'Write naturally, like describing to an artist',
    'Include text in quotes for text-in-image',
    'Be specific about composition and framing',
    'Quality modifiers less necessary',
  ],
};

// ============================================================================
// VIDEO PLATFORM ADAPTERS
// ============================================================================

const soraAdapter: PlatformAdapter = {
  platform: 'sora',
  modality: 'video',
  syntaxRules: [
    'Detailed scene descriptions with physics',
    'Explicit camera movement specification',
    'Include duration and pacing notes',
    'Rigidity cues for consistency',
    'Natural language, no special syntax',
  ],
  formatHints: [
    'Describe motion with physics terms',
    'Include temporal sequence (0-3s, 3-6s, etc.)',
    'Specify camera behavior explicitly',
    'Note what should remain constant',
  ],
};

const runwayAdapter: PlatformAdapter = {
  platform: 'runway',
  modality: 'video',
  syntaxRules: [
    'Works well with image-to-video workflows',
    'Motion brush for specific area animation',
    'Camera control via natural language',
    'Shorter clips (4-16 seconds) optimal',
  ],
  formatHints: [
    'Be specific about motion direction and speed',
    'Include reference image description if extending',
    'Note lighting consistency needs',
    'Specify style coherence requirements',
  ],
};

// ============================================================================
// AUDIO PLATFORM ADAPTERS
// ============================================================================

const sunoAdapter: PlatformAdapter = {
  platform: 'suno',
  modality: 'audio',
  syntaxRules: [
    'Structure tags: [Intro] [Verse] [Chorus] [Bridge] [Outro]',
    'Genre and style in plain text',
    'Lyrics with structure tags for songs',
    'Instrumental prompts without lyrics',
    'Style reference artists work well',
  ],
  formatHints: [
    'Use structure tags for song organization',
    'Include specific genre and subgenre',
    'Reference tempo (BPM) when possible',
    'Describe instrumentation specifically',
    '4-7 descriptive adjectives optimal',
  ],
};

const udioAdapter: PlatformAdapter = {
  platform: 'udio',
  modality: 'audio',
  syntaxRules: [
    'Clean genre and style descriptions',
    'Artist references effective',
    'Mood and energy descriptors',
    'Less structure-tag dependent than other music generators',
  ],
  formatHints: [
    'Focus on sonic characteristics',
    'Include production style notes',
    'Reference specific decades/eras',
    'Describe texture and timbre',
  ],
};

// ============================================================================
// VIDEO PLATFORM ADAPTERS (continued)
// ============================================================================

const pikaAdapter: PlatformAdapter = {
  platform: 'pika',
  modality: 'video',
  syntaxRules: [
    'Motion descriptions with specific verbs (float, spin, zoom, pan)',
    'Camera movement specification (orbit, dolly, tracking shot)',
    'Style references for visual consistency',
    'Animation speed and easing hints (slow motion, timelapse)',
    'Natural language, no special syntax needed',
  ],
  formatHints: [
    'Use concise motion verbs to describe action',
    'Include visual style descriptors (cinematic, anime, painterly)',
    'Keep prompts under 200 words',
    'Specify subject clearly before describing motion',
  ],
};

const klingAdapter: PlatformAdapter = {
  platform: 'kling',
  modality: 'video',
  syntaxRules: [
    'Cinematic camera movements (crane shot, steadicam, handheld)',
    'Lighting descriptions (golden hour, rim lighting, volumetric fog)',
    'Physics interactions (gravity, fluid dynamics, particle effects)',
    'Temporal sequences with scene progression',
    'Detailed environment and atmosphere descriptions',
  ],
  formatHints: [
    'Write detailed scene compositions with layered depth',
    'Include specific camera lens references (35mm, anamorphic)',
    'Keep prompts around 250 words for optimal results',
    'Describe both foreground action and background atmosphere',
  ],
};

// ============================================================================
// AUDIO PLATFORM ADAPTERS (continued)
// ============================================================================

const musicgenAdapter: PlatformAdapter = {
  platform: 'musicgen',
  modality: 'audio',
  syntaxRules: [
    'Genre and mood keywords (upbeat jazz, melancholic ambient)',
    'Instrument descriptors (acoustic guitar, synthesizer pads)',
    'No structure tags — plain text descriptions only',
    'Tempo and energy descriptors (slow, driving, relaxed)',
    'Comma-separated descriptor style works best',
  ],
  formatHints: [
    'Keep prompts very concise (30-80 words)',
    'Use comma-separated descriptors rather than sentences',
    'Focus on sonic characteristics, not lyrics or song structure',
    'Include tempo, mood, and instrumentation in that order',
  ],
};

// ============================================================================
// 3D PLATFORM ADAPTERS
// ============================================================================

const meshyAdapter: PlatformAdapter = {
  platform: 'meshy',
  modality: '3d',
  syntaxRules: [
    'Object-focused descriptions (single subject preferred)',
    'Material and texture descriptions (metallic, wooden, glass)',
    'Polygon count hints (low-poly, high-detail, game-ready)',
    'UV mapping and topology notes when relevant',
    'Style references (stylized, realistic, cartoon)',
  ],
  formatHints: [
    'Focus on a single, well-defined object or character',
    'Include material properties and surface finish',
    'Mention intended use (game asset, 3D print, rendering)',
    'Keep prompts under 150 words for best results',
  ],
};

const tripo3dAdapter: PlatformAdapter = {
  platform: 'tripo3d',
  modality: '3d',
  syntaxRules: [
    'Mesh quality descriptors (clean topology, quad-dominant)',
    'Surface detail level (smooth, highly detailed, sculpted)',
    'Geometry complexity hints (simple, intricate, organic)',
    'Scale and proportion references',
    'Single object focus for best generation quality',
  ],
  formatHints: [
    'Describe one object at a time for clean topology',
    'Emphasize clean, manifold geometry for downstream use',
    'Include scale references (palm-sized, life-size, miniature)',
    'Keep prompts under 150 words',
  ],
};

// ============================================================================
// PLATFORM REGISTRY
// ============================================================================

const platformAdapters: Record<string, PlatformAdapter> = {
  midjourney: midjourneyAdapter,
  dalle: dalleAdapter,
  'stable-diffusion': stableDiffusionAdapter,
  flux: fluxAdapter,
  sora: soraAdapter,
  runway: runwayAdapter,
  pika: pikaAdapter,
  kling: klingAdapter,
  suno: sunoAdapter,
  udio: udioAdapter,
  musicgen: musicgenAdapter,
  meshy: meshyAdapter,
  tripo3d: tripo3dAdapter,
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the adapter for a specific platform
 */
export function getPlatformAdapter(platform: TargetPlatform): PlatformAdapter | undefined {
  return platformAdapters[platform];
}

/**
 * Get syntax rules for a platform
 */
export function getPlatformSyntaxRules(platform: TargetPlatform): string[] {
  return platformAdapters[platform]?.syntaxRules ?? [];
}

/**
 * Get format hints for a platform
 */
export function getPlatformFormatHints(platform: TargetPlatform): string[] {
  return platformAdapters[platform]?.formatHints ?? [];
}

/**
 * Build platform-specific syntax guidance for the system prompt
 */
export function buildPlatformGuidance(platform: TargetPlatform): string {
  const adapter = platformAdapters[platform];
  if (!adapter) {
    return '';
  }

  const syntaxSection = adapter.syntaxRules.length > 0
    ? `<platform_syntax platform="${platform}">
${adapter.syntaxRules.map((rule) => `- ${rule}`).join('\n')}
</platform_syntax>`
    : '';

  const hintsSection = adapter.formatHints.length > 0
    ? `<format_hints>
${adapter.formatHints.map((hint) => `- ${hint}`).join('\n')}
</format_hints>`
    : '';

  return `${syntaxSection}\n\n${hintsSection}`.trim();
}

/**
 * Apply platform-specific parameters to a prompt (e.g., image generator --ar)
 */
export function applyPlatformParameters(
  prompt: string,
  platform: TargetPlatform,
  options?: Record<string, string | number>
): string {
  const adapter = platformAdapters[platform];
  if (adapter?.appendParameters) {
    return adapter.appendParameters(prompt, options);
  }
  return prompt;
}

/**
 * Get all supported platforms for a modality
 */
export function getSupportedPlatforms(modality: PromptModality): TargetPlatform[] {
  return Object.values(platformAdapters)
    .filter((adapter) => adapter.modality === modality)
    .map((adapter) => adapter.platform);
}
