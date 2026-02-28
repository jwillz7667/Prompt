/**
 * Prompt Enhancement Engine v2.0
 *
 * Built on cutting-edge prompt engineering research (2025-2026):
 * - Structured prompting with XML tags (15-20% improvement per Anthropic)
 * - Few-shot learning over abstract descriptions
 * - Automatic Chain-of-Thought integration
 * - Self-consistency and verification hooks
 * - Constraint-based prompting (NEVER/ALWAYS)
 * - Modality-aware domain optimization
 * - Meta-cognitive self-monitoring
 *
 * Sources:
 * - "The Prompt Report" (arXiv:2406.06608) - 58 prompting techniques taxonomy
 * - "Structured Prompting Enables More Robust Evaluation" (arXiv:2511.20836)
 * - "A Survey of Automatic Prompt Engineering" (arXiv:2502.11560)
 * - Anthropic's Claude best practices
 * - OpenAI's GPT optimization guides
 */

import { promptLogger } from '../utils/logger.js';
import {
  MetaPromptBuilder,
  type SubModality,
  type TargetPlatform,
} from './metaPrompts/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type PromptTone = 'professional' | 'casual' | 'academic' | 'creative' | 'technical' | 'friendly';
export type OutputLength = 'concise' | 'standard' | 'detailed';
export type PromptModality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d';
export type EnhancementTier = 'basic' | 'standard' | 'advanced';

export interface EnhancementRequest {
  prompt: string;
  tier: EnhancementTier;
  modality?: PromptModality;
  tone?: PromptTone;
  length?: OutputLength;
  targetModel?: 'claude' | 'gpt' | 'gemini' | 'llama' | 'general';
  customInstructions?: string;
  targetCharacterLength?: number;
  // V3 features
  subModality?: SubModality;
  targetPlatform?: TargetPlatform;
  includeNegativeExamples?: boolean;
}

export interface EnhancementResult {
  enhancedPrompt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  processingMs: number;
  techniqueApplied: string;
}

// ============================================================================
// CORE ENHANCEMENT SYSTEM PROMPT
// Research-backed meta-prompt for prompt transformation
// ============================================================================

function buildEnhancementSystemPrompt(
  tier: EnhancementTier,
  modality: PromptModality,
  request?: EnhancementRequest
): string {
  // Always use V3 meta-prompt builder for all requests
  // V3 system has modality-aware, research-backed prompts that work well
  // with modern reasoning models (no outdated persona-based patterns)
  if (request) {
    const builder = new MetaPromptBuilder({
      prompt: request.prompt,
      tier,
      modality,
      subModality: request.subModality,
      targetPlatform: request.targetPlatform,
      tone: request.tone,
      length: request.length,
      customInstructions: request.customInstructions,
      targetCharacterLength: request.targetCharacterLength,
    });
    return builder.buildSystemPrompt();
  }

  // Fallback for edge case without request (shouldn't happen in practice)
  const baseKnowledge = `<system>
You are an expert prompt engineer. Your task is to transform user prompts into highly effective versions that maximize AI output quality.

<research_foundation>
Your enhancement techniques are based on peer-reviewed research:
- Chain-of-Thought prompting (Wei et al., 2022) - step-by-step reasoning
- Tree-of-Thoughts (Yao et al., 2023) - exploring multiple reasoning paths
- Structured prompting (arXiv:2511.20836) - XML tags improve performance 15-20%
- Few-shot learning - concrete examples outperform abstract descriptions
- Self-consistency (Wang et al., 2022) - verification improves accuracy
</research_foundation>

<core_principles>
1. STRUCTURE OVER PROSE: Use clear sections, XML tags, or markdown headers
2. SHOW DON'T TELL: Include examples of desired output when helpful
3. EXPLICIT CONSTRAINTS: Use NEVER/ALWAYS lists for boundaries
4. REASONING TRIGGERS: Add "Let's think step by step" for complex tasks
5. VERIFICATION HOOKS: Include self-checking instructions
6. CONTEXT FIRST: Put background information before instructions
7. SPECIFIC OVER VAGUE: Quantify requirements (e.g., "3 paragraphs" not "brief")
</core_principles>`;

  const tierSpecificGuidance = getTierGuidance(tier);
  const modalityGuidance = getModalityGuidance(modality);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierSpecificGuidance}

${modalityGuidance}

${outputFormat}
</system>`;
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Add clear role/persona definition
- Structure with bullet points or numbered lists
- Specify expected output format
- Add one concrete example if helpful
</techniques_to_apply>

<output_length>Keep enhancements concise (100-200 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Define expert persona with specific expertise
- Use RISEN framework: Role, Instructions, Steps, End goal, Narrowing constraints
- Add Chain-of-Thought trigger for analytical tasks
- Include 1-2 concrete examples of desired output
- Specify format with clear structure
- Add basic verification step
</techniques_to_apply>

<output_length>Balanced enhancement (200-400 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED</enhancement_level>
<techniques_to_apply>
- Synthesize optimal expert persona with credentials
- Apply full RISEN+ framework with self-verification
- Embed Chain-of-Thought reasoning triggers
- Include 2-3 diverse few-shot examples
- Add NEVER/ALWAYS constraint lists
- Include edge case handling
- Add metacognitive verification hooks
- Use structured XML or markdown sections
- Specify quality criteria and success metrics
</techniques_to_apply>

<output_length>Comprehensive enhancement (400-800 words)</output_length>`;
  }
}

function getModalityGuidance(modality: PromptModality): string {
  switch (modality) {
    case 'image':
      return `<modality>IMAGE_GENERATION</modality>
<target_platforms>Midjourney, DALL-E, Stable Diffusion, Flux</target_platforms>
<domain_techniques>
- Lead with subject (weighted highest in most models)
- Stack descriptors: subject → style → lighting → camera → quality
- Use platform-specific syntax when detectable (--ar, --v for MJ)
- Include negative concepts to exclude (avoid: blurry, watermark)
- Reference art styles, artists, film stocks for aesthetic control
- Specify camera lens, angle, lighting setup for photorealistic work
- Keep under 150 words for optimal token weighting
</domain_techniques>
<example_structure>
[Subject with specific details], [environment/setting], [art style/medium],
[lighting description], [camera/lens], [quality modifiers]
</example_structure>`;

    case 'video':
      return `<modality>VIDEO_GENERATION</modality>
<target_platforms>Sora, Runway Gen-3, Pika, Kling</target_platforms>
<domain_techniques>
- Describe motion with physics language (forces, momentum, acceleration)
- Include temporal markers for pacing
- Add rigidity cues to prevent morphing ("maintains consistent appearance")
- Specify camera movement type (tracking, dolly, crane, static)
- Structure as: setup → action → resolution
- Include environmental dynamics (wind, particles, lighting changes)
</domain_techniques>`;

    case 'audio':
      return `<modality>AUDIO_GENERATION</modality>
<target_platforms>Suno, Udio, MusicGen, Stable Audio</target_platforms>
<domain_techniques>
- Specify genre and specific subgenre with 2-3 reference artists
- Include tempo (BPM range), key signature, and time signature
- List specific instruments with roles (lead, rhythm, bass, pad, texture)
- Use structure tags: [Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Drop] [Outro]
- Describe emotional arc with dynamics (pp→fff) and tension/release points
- Use sophisticated mood vocabulary (euphoric not happy, melancholic not sad)
- Reference production era or aesthetic (80s gated reverb, lo-fi tape saturation, modern radio-ready)
- For lyrics: use section tags, vocal delivery tags ([Whisper] [Rap] [Falsetto] [Belting]), 8-12 syllables per line, clear rhyme scheme, paste choruses in full
- Front-load genre and mood in first 20-30 words for strongest model response
- Describe sound rather than commanding ("warm Rhodes piano" not "add piano")
</domain_techniques>`;

    case 'code':
      return `<modality>CODE_GENERATION</modality>
<target_platforms>GitHub Copilot, Cursor, Claude, ChatGPT</target_platforms>
<domain_techniques>
- Use PCTF: Persona, Context, Task, Format
- Specify language version and framework
- Focus on single, well-defined tasks (not entire projects)
- Include input/output types and examples
- Specify error handling expectations
- Reference existing patterns or conventions to follow
- Include test case expectations when relevant
</domain_techniques>`;

    case '3d':
      return `<modality>3D_GENERATION</modality>
<target_platforms>Meshy, Tripo3D, Point-E, Shap-E</target_platforms>
<domain_techniques>
- Specify purpose: game asset, 3D printing, visualization, VR/AR
- Include topology requirements (poly count, quad/tri)
- Describe materials with PBR terms (roughness, metallic, normal)
- Define scale and proportions
- Specify style: realistic, stylized, low-poly
- Include structural requirements (watertight for printing)
</domain_techniques>`;

    case 'text':
    default:
      return `<modality>TEXT_GENERATION</modality>
<target_platforms>Claude, GPT-4, Gemini, Llama</target_platforms>
<domain_techniques>
- Assign expert persona appropriate to domain
- Use structured sections for complex requests
- Add "Let's approach this step by step" for reasoning tasks
- Include format specification with examples
- Add verification instructions for factual content
- Specify tone and audience explicitly
</domain_techniques>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced prompt. No explanations, no meta-commentary, no "Here's the enhanced prompt:" prefix.

The enhanced prompt should be:
- Self-contained and immediately usable
- Formatted in clean Markdown
- Structured with clear sections${tier === 'advanced' ? ' using XML tags or headers' : ''}
- Free of any preamble or explanation

LENGTH ENFORCEMENT: If the user specifies a character count, word count, sentence count, or any other explicit length constraint, the enhanced prompt MUST preserve and enforce that exact constraint. User-specified limits always override default output length guidance.
</output_rules>`;
}

// ============================================================================
// FEW-SHOT EXAMPLES
// Research shows examples > abstract descriptions
// ============================================================================

function getFewShotExamples(modality: PromptModality, tier: EnhancementTier): string {
  if (tier === 'basic') return ''; // Basic tier skips examples for brevity

  const examples: Record<PromptModality, string> = {
    text: `<few_shot_examples>
<example>
<input>write about climate change</input>
<output>
<context>
You are a climate scientist with 20 years of research experience, skilled at explaining complex environmental topics to general audiences.
</context>

<task>
Write an informative article about climate change that covers:
1. Current scientific consensus on causes
2. Observable impacts happening now
3. Projected consequences for the next 50 years
4. Actionable steps individuals can take
</task>

<format>
- Length: 800-1000 words
- Structure: Introduction, 4 main sections with headers, conclusion
- Tone: Authoritative but accessible, avoid jargon
- Include: At least 2 specific statistics or research findings
</format>

<quality_criteria>
Before finalizing, verify:
- All claims are scientifically accurate
- No logical gaps in explanations
- Actionable advice is practical and specific
</quality_criteria>
</output>
</example>
</few_shot_examples>`,

    image: `<few_shot_examples>
<example>
<input>a cat in space</input>
<output>
A majestic orange tabby cat floating weightlessly inside a space station, Earth visible through a large circular window behind it, soft bioluminescent lighting reflecting in its curious eyes, whiskers catching droplets of floating water, detailed fur texture with individual strands visible, NASA equipment and control panels in the background, shot on Hasselblad medium format, 85mm lens, shallow depth of field, cinematic color grading, 8K resolution, photorealistic, trending on ArtStation
</output>
</example>
</few_shot_examples>`,

    video: `<few_shot_examples>
<example>
<input>sunrise timelapse</input>
<output>
Cinematic timelapse of sunrise over mountain peaks. Camera positioned on tripod, locked off static shot. Duration: 10 seconds representing 2 hours of real time.

SEQUENCE:
- 0-3s: Pre-dawn blue hour, silhouetted mountain ridges, stars fading
- 3-6s: First golden light crests the peaks, long shadows stretching across valleys, mist rolling through lower elevations
- 6-10s: Full sunrise, warm orange and pink hues painting clouds, light gradually flooding the landscape

TECHNICAL: Consistent exposure ramping, no flicker, smooth motion of clouds and shadows. Mountains maintain rigid positioning throughout. 4K resolution, 24fps output.
</output>
</example>
</few_shot_examples>`,

    audio: `<few_shot_examples>
<example>
<input>happy song</input>
<output>
[Genre: Indie Pop / Feel-Good Anthem]
[Tempo: 120 BPM, Key: G Major]
[Mood: Euphoric, Uplifting, Sunny]

[Intro - 8 bars]
Bright acoustic guitar strumming pattern, tambourine accents, building anticipation

[Verse - 16 bars]
Warm male vocals, conversational delivery, claps on 2 and 4
Instrumentation: acoustic guitar, subtle bass, light percussion
Lyrics theme: Simple joys, gratitude, new beginnings

[Chorus - 16 bars]
Full band explosion, gang vocals on hook, driving drums
"Oh-oh-oh" melodic hook, major chord progression (G-D-Em-C)
Adds: Electric guitar, synth pads, stomps

[Bridge]
Strip down to piano and vocals, build back up with strings

[Outro]
Fade with whistling melody, acoustic guitar, birds chirping ambiance

Reference artists: Vance Joy, Edward Sharpe, Walk the Moon
Production style: Warm, analog, slight tape saturation
</output>
</example>
</few_shot_examples>`,

    code: `<few_shot_examples>
<example>
<input>function to validate email</input>
<output>
You are a senior software engineer specializing in TypeScript and input validation.

## Context
I need a robust email validation function for a user registration system. The codebase uses TypeScript 5.x with strict mode enabled.

## Task
Implement a function \`validateEmail\` that:
1. Checks if input is a valid email format
2. Returns a typed result object (not just boolean)
3. Provides specific error messages for different failure modes

## Requirements
- Input: \`unknown\` (validate the type as well)
- Output: \`{ valid: boolean; email?: string; error?: string }\`
- Handle edge cases: empty string, null, undefined, whitespace
- Use RFC 5322 compliant regex (not overly strict)
- No external dependencies

## Expected Behavior
\`\`\`typescript
validateEmail("user@example.com") // { valid: true, email: "user@example.com" }
validateEmail("invalid") // { valid: false, error: "Invalid email format" }
validateEmail("") // { valid: false, error: "Email is required" }
validateEmail(null) // { valid: false, error: "Email must be a string" }
\`\`\`

## Quality Criteria
- Include JSDoc comments
- Handle Unicode/international emails
- Be testable with dependency injection if needed
</output>
</example>
</few_shot_examples>`,

    '3d': `<few_shot_examples>
<example>
<input>a sword</input>
<output>
## 3D Model: Medieval Longsword

**Purpose**: Game-ready asset for fantasy RPG (Unity/Unreal)

**Specifications**:
- Poly count: 3,000-5,000 triangles
- Topology: Clean quads on blade, tris acceptable on ornate details
- UV: Single UV set, unwrapped for 2K texture
- Scale: 110cm total length, realistic proportions

**Design**:
- Blade: Double-edged, straight European longsword style
- Fuller (blood groove) running 2/3 blade length
- Cross-guard: Straight with slight downward curve at tips
- Grip: Leather-wrapped, sized for two-handed wielding
- Pommel: Wheel-style, weighted for balance

**Materials (PBR)**:
- Blade: Polished steel (metallic: 1.0, roughness: 0.2-0.4 variation)
- Guard/Pommel: Aged bronze with patina (metallic: 0.9, roughness: 0.5)
- Grip: Brown leather with wear (roughness: 0.7-0.9)
- Edge detail: Micro-scratches in normal map

**Export**: FBX with embedded materials, glTF for web viewer
</output>
</example>
</few_shot_examples>`,
  };

  return examples[modality] || examples.text;
}

// ============================================================================
// CONSTRAINT GENERATION
// NEVER/ALWAYS lists proven effective in 2025 research
// ============================================================================

function generateConstraints(modality: PromptModality): string {
  const constraints: Record<PromptModality, string> = {
    text: `<constraints>
ALWAYS:
- Include clear structure with sections or bullet points
- Specify the target audience and their knowledge level
- Define success criteria for the output
- Add reasoning triggers for complex tasks

NEVER:
- Leave the persona/role undefined
- Use vague length descriptions ("brief", "detailed")
- Assume the AI knows the context
- Skip format specification
</constraints>`,

    image: `<constraints>
ALWAYS:
- Lead with the main subject
- Include lighting description
- Specify art style or reference
- Add quality modifiers at the end

NEVER:
- Start with "An image of" or "A picture of"
- Use more than 200 words (dilutes weight)
- Forget to specify aspect ratio needs
- Mix conflicting styles without intent
</constraints>`,

    video: `<constraints>
ALWAYS:
- Describe motion with physics-based language
- Include temporal structure (beginning, middle, end)
- Add rigidity cues to prevent morphing
- Specify camera movement type

NEVER:
- Describe only static appearance
- Forget to mention duration or pacing
- Leave subject consistency undefined
- Use abstract motion descriptions
</constraints>`,

    audio: `<constraints>
ALWAYS:
- Specify genre, tempo, and key
- Include structure tags [Verse] [Chorus] etc.
- Describe instrumentation specifically
- Reference artists or production styles

NEVER:
- Use vague emotional descriptors alone
- Skip tempo/BPM specification
- Forget song structure
- Mix incompatible genre elements
</constraints>`,

    code: `<constraints>
ALWAYS:
- Specify language and version
- Define input/output types clearly
- Include example usage
- Focus on single, complete tasks

NEVER:
- Ask for "entire app" or project-level scope
- Leave error handling undefined
- Skip type specifications
- Use vague task descriptions
</constraints>`,

    '3d': `<constraints>
ALWAYS:
- State the intended use (game, print, viz)
- Specify polygon budget
- Define scale and proportions
- Include material/texture requirements

NEVER:
- Forget topology requirements
- Leave mesh density undefined
- Skip UV/texturing needs
- Ignore export format requirements
</constraints>`,
  };

  return constraints[modality] || constraints.text;
}

// ============================================================================
// USER MESSAGE BUILDER
// Structured format optimized for enhancement
// ============================================================================

function buildUserMessage(request: EnhancementRequest): string {
  const { prompt, tier, modality = 'text', tone, length, customInstructions, subModality, targetPlatform, includeNegativeExamples } = request;

  // Always use V3 meta-prompt builder for all requests
  // V3 system provides better modality-aware examples and constraints
  const builder = new MetaPromptBuilder({
    prompt,
    tier,
    modality,
    subModality,
    targetPlatform,
    includeNegativeExamples,
    tone,
    length,
    customInstructions,
  });
  return builder.buildUserMessage();
}

// Legacy V2 path - kept for reference, no longer used
function buildUserMessageLegacy(request: EnhancementRequest): string {
  const { prompt, tier, modality = 'text', tone, length, customInstructions } = request;

  let message = `<enhancement_request>
<original_prompt>
${prompt}
</original_prompt>

<parameters>
<tier>${tier}</tier>
<modality>${modality}</modality>`;

  if (tone) {
    message += `\n<tone>${tone}</tone>`;
  }
  if (length) {
    message += `\n<target_length>${length}</target_length>`;
  }
  if (customInstructions) {
    message += `\n<custom_instructions>${customInstructions}</custom_instructions>`;
  }

  message += `
</parameters>
</enhancement_request>

${getFewShotExamples(modality, tier)}

${generateConstraints(modality)}

Transform the original prompt into an optimized version. Return ONLY the enhanced prompt.`;

  return message;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// MAIN ENHANCEMENT FUNCTION
// ============================================================================

export async function enhancePromptV2(request: EnhancementRequest): Promise<EnhancementResult> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable not configured');
  }

  const modality = request.modality || 'text';
  const tier = request.tier || 'advanced';

  // Select model and parameters based on tier
  const model = tier === 'basic' ? 'deepseek-chat' : 'deepseek-chat';
  const temperature = tier === 'basic' ? 0.5 : tier === 'standard' ? 0.6 : 0.7;
  const maxTokens = tier === 'basic' ? 1024 : tier === 'standard' ? 2048 : 4096;

  // Use V3 builder when V3 features are present, otherwise use V2
  const systemPrompt = buildEnhancementSystemPrompt(tier, modality, request);
  const userMessage = buildUserMessage(request);

  const deepseekRequest: DeepSeekRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  const startTime = Date.now();

  promptLogger.info({
    tier,
    modality,
    promptLength: request.prompt.length,
  }, 'Enhancing prompt with v2 engine');

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(deepseekRequest),
  });

  const processingMs = Date.now() - startTime;

  if (!response.ok) {
    const errorBody = await response.text();
    promptLogger.error({ status: response.status, body: errorBody }, 'DeepSeek API error');
    throw new Error(`DeepSeek API error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as DeepSeekResponse;

  const enhancedContent = data.choices[0]?.message?.content;
  if (!enhancedContent) {
    throw new Error('Empty response from DeepSeek API');
  }

  // Clean up any potential preamble the model might add
  const cleanedContent = cleanEnhancedPrompt(enhancedContent);

  promptLogger.info({
    processingMs,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  }, 'Prompt enhanced successfully');

  return {
    enhancedPrompt: cleanedContent,
    model,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
    processingMs,
    techniqueApplied: `v2-${tier}-${modality}`,
  };
}

// ============================================================================
// STREAMING ENHANCEMENT
// ============================================================================

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: EnhancementResult) => void;
  onError: (error: Error) => void;
}

export async function enhancePromptV2Stream(
  request: EnhancementRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    callbacks.onError(new Error('DEEPSEEK_API_KEY environment variable not configured'));
    return;
  }

  const modality = request.modality || 'text';
  const tier = request.tier || 'advanced';

  const model = 'deepseek-chat';
  const temperature = tier === 'basic' ? 0.5 : tier === 'standard' ? 0.6 : 0.7;
  const maxTokens = tier === 'basic' ? 1024 : tier === 'standard' ? 2048 : 4096;

  // Use V3 builder when V3 features are present, otherwise use V2
  const systemPrompt = buildEnhancementSystemPrompt(tier, modality, request);
  const userMessage = buildUserMessage(request);

  const deepseekRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(deepseekRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      promptLogger.error({ status: response.status, body: errorBody }, 'DeepSeek API streaming error');
      callbacks.onError(new Error(`DeepSeek API error: ${response.status}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              callbacks.onToken(delta);
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    const processingMs = Date.now() - startTime;
    const cleanedContent = cleanEnhancedPrompt(fullContent);

    callbacks.onComplete({
      enhancedPrompt: cleanedContent,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      processingMs,
      techniqueApplied: `v2-${tier}-${modality}`,
    });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clean up any preamble or postamble the model might add
 */
function cleanEnhancedPrompt(content: string): string {
  let cleaned = content.trim();

  // Remove common preambles
  const preambles = [
    /^here'?s?\s+(the\s+)?enhanced\s+prompt:?\s*/i,
    /^enhanced\s+prompt:?\s*/i,
    /^here\s+is\s+(the\s+)?enhanced\s+version:?\s*/i,
    /^the\s+enhanced\s+prompt\s+is:?\s*/i,
    /^<enhanced_prompt>\s*/i,
  ];

  for (const pattern of preambles) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove closing tags if present
  cleaned = cleaned.replace(/<\/enhanced_prompt>\s*$/i, '');

  // Remove trailing explanations
  const explanationPatterns = [
    /\n\n---\n\nThis enhanced prompt.+$/is,
    /\n\nI've enhanced.+$/is,
    /\n\nKey improvements.+$/is,
  ];

  for (const pattern of explanationPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Determine optimal tier based on prompt complexity
 */
export function suggestTier(prompt: string): EnhancementTier {
  const wordCount = prompt.split(/\s+/).length;
  const hasComplexStructure = /\d+\.\s|\*\s|-\s/.test(prompt);
  const hasSpecificRequirements = /must|should|need|require/i.test(prompt);

  if (wordCount > 100 || (hasComplexStructure && hasSpecificRequirements)) {
    return 'advanced';
  } else if (wordCount > 30 || hasComplexStructure || hasSpecificRequirements) {
    return 'standard';
  }
  return 'basic';
}

/**
 * Detect modality from prompt content
 */
export function detectModality(prompt: string): PromptModality {
  const lower = prompt.toLowerCase();

  // Image indicators
  if (/\b(image|photo|picture|illustration|render|portrait|landscape|draw|paint|art|visual)\b/.test(lower)) {
    return 'image';
  }

  // Video indicators
  if (/\b(video|animation|motion|clip|footage|timelapse|cinematic)\b/.test(lower)) {
    return 'video';
  }

  // Audio indicators
  if (/\b(song|music|audio|beat|melody|track|sound|compose)\b/.test(lower)) {
    return 'audio';
  }

  // Code indicators
  if (/\b(code|function|class|api|implement|program|script|algorithm)\b/.test(lower)) {
    return 'code';
  }

  // 3D indicators
  if (/\b(3d|model|mesh|sculpt|render|asset|blender|unity|unreal)\b/.test(lower)) {
    return '3d';
  }

  return 'text';
}
