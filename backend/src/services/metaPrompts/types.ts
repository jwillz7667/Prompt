/**
 * Meta-Prompt Types
 *
 * Comprehensive type definitions for the modular meta-prompt system.
 * Supports sub-modalities, platform targeting, and tier-based configuration.
 */

// ============================================================================
// CORE MODALITY TYPES
// ============================================================================

export type PromptModality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d' | 'nsfw';

// ============================================================================
// SUB-MODALITY TYPES
// Fine-grained control within each modality
// ============================================================================

export type TextSubModality =
  | 'general'      // General-purpose text generation
  | 'reasoning'    // Analytical, logical, problem-solving
  | 'creative'     // Storytelling, fiction, poetry
  | 'technical';   // Documentation, specifications, tutorials

export type ImageSubModality =
  | 'photorealistic'  // Real-world photography style
  | 'artistic'        // Paintings, illustrations, stylized art
  | 'concept'         // Concept art, sketches, ideation
  | 'product';        // Product photography, marketing visuals

export type VideoSubModality =
  | 'cinematic'    // Film-quality, narrative videos
  | 'animation'    // 2D/3D animated content
  | 'timelapse'    // Time-compressed footage
  | 'tutorial';    // Educational, how-to content

export type AudioSubModality =
  | 'music'        // Songs, instrumentals, compositions
  | 'lyrics'       // Lyric writing for AI music generators
  | 'speech'       // Voice synthesis, narration
  | 'soundscape'   // Ambient, environmental sounds
  | 'voiceover';   // Professional VO, podcasts

export type CodeSubModality =
  | 'function'     // Single function implementation
  | 'component'    // UI component, module
  | 'algorithm'    // Algorithm design and implementation
  | 'refactor';    // Code improvement, optimization

export type ThreeDSubModality =
  | 'game-asset'      // Game-ready 3D models
  | 'print-ready'     // 3D printing optimized
  | 'visualization'   // Architectural, product viz
  | 'animation';      // Rigged, animated models

export type NsfwSubModality =
  | 'romantic'        // Sensual, intimate, emotionally-driven
  | 'explicit'        // Graphic adult content
  | 'artistic'        // Tasteful erotic art direction
  | 'fantasy';        // Fantastical adult themes

export type SubModality =
  | TextSubModality
  | ImageSubModality
  | VideoSubModality
  | AudioSubModality
  | CodeSubModality
  | ThreeDSubModality
  | NsfwSubModality;

// ============================================================================
// PLATFORM TYPES
// Target platform for optimized syntax and conventions
// ============================================================================

export type ImagePlatform =
  | 'midjourney'       // Image Generator (--ar, --v, --s syntax)
  | 'dalle'            // Image Creator (natural language)
  | 'stable-diffusion' // Diffusion Model (weights, LoRA, embeddings)
  | 'flux'             // Image Studio (clean, minimal syntax)
  | 'general';         // Platform-agnostic

export type VideoPlatform =
  | 'sora'      // Video Generator
  | 'runway'    // Video Creator
  | 'pika'      // Video Animator
  | 'kling'     // Video Studio
  | 'general';  // Platform-agnostic

export type AudioPlatform =
  | 'suno'      // Music Generator
  | 'udio'      // Music Creator
  | 'musicgen'  // Audio Generator
  | 'general';  // Platform-agnostic

export type CodePlatform =
  | 'claude'    // AI Assistant
  | 'gpt'       // AI Chat
  | 'copilot'   // Code Assistant
  | 'general';  // Platform-agnostic

export type TextPlatform =
  | 'claude'    // AI Assistant
  | 'gpt'       // AI Chat
  | 'gemini'    // AI Search
  | 'general';  // Platform-agnostic

export type ThreeDPlatform =
  | 'meshy'     // 3D Generator
  | 'tripo3d'   // 3D Creator
  | 'general';  // Platform-agnostic

export type NsfwPlatform =
  | 'general';  // Platform-agnostic

export type TargetPlatform =
  | ImagePlatform
  | VideoPlatform
  | AudioPlatform
  | CodePlatform
  | TextPlatform
  | ThreeDPlatform
  | NsfwPlatform;

// ============================================================================
// ENHANCEMENT TIER
// ============================================================================

export type EnhancementTier = 'basic' | 'standard' | 'advanced';

// ============================================================================
// FEW-SHOT EXAMPLE TYPES
// ============================================================================

export type ExampleComplexity = 'simple' | 'medium' | 'complex';

export interface FewShotExample {
  id: string;
  input: string;
  output: string;
  subModality?: SubModality;
  platform?: TargetPlatform;
  complexity: ExampleComplexity;
  tags?: string[];
}

export interface NegativeExample {
  badInput: string;
  badOutput: string;
  goodOutput: string;
  explanation: string;
}

// ============================================================================
// CONSTRAINT TYPES
// ============================================================================

export interface ModalityConstraints {
  always: string[];
  never: string[];
}

// ============================================================================
// TIER-SPECIFIC CONFIGURATION
// ============================================================================

export interface TierConfig {
  fewShotCount: number;
  includeNegativeExamples: boolean;
  platformAdaptation: 'none' | 'basic' | 'full';
  subModalitySupport: boolean;
  constraintLevel: 'simple' | 'moderate' | 'comprehensive';
  outputLengthRange: { min: number; max: number };
}

export const TIER_CONFIGS: Record<EnhancementTier, TierConfig> = {
  basic: {
    fewShotCount: 0,
    includeNegativeExamples: false,
    platformAdaptation: 'none',
    subModalitySupport: false,
    constraintLevel: 'simple',
    outputLengthRange: { min: 100, max: 200 },
  },
  standard: {
    fewShotCount: 2,
    includeNegativeExamples: false,
    platformAdaptation: 'basic',
    subModalitySupport: true,
    constraintLevel: 'moderate',
    outputLengthRange: { min: 200, max: 400 },
  },
  advanced: {
    fewShotCount: 3,
    includeNegativeExamples: true,
    platformAdaptation: 'full',
    subModalitySupport: true,
    constraintLevel: 'comprehensive',
    outputLengthRange: { min: 400, max: 800 },
  },
};

// ============================================================================
// MODALITY CONFIGURATION
// ============================================================================

export interface ModalityConfig {
  modality: PromptModality;
  displayName: string;
  description: string;
  targetPlatforms: TargetPlatform[];
  subModalities: SubModality[];
  defaultSubModality: SubModality;
  coreStructure: string[];
  domainTechniques: string[];
  fewShotExamples: FewShotExample[];
  negativeExamples: NegativeExample[];
  constraints: ModalityConstraints;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildSystemPrompt: (tier: EnhancementTier, subModality?: any) => string;
}

// ============================================================================
// PLATFORM ADAPTER TYPES
// ============================================================================

export interface PlatformSyntaxAdapter {
  platform: TargetPlatform;
  modality: PromptModality;
  syntaxRules: string[];
  examples: { before: string; after: string }[];
  formatPrompt: (prompt: string) => string;
}

// ============================================================================
// BUILDER OPTIONS
// ============================================================================

export interface MetaPromptBuilderOptions {
  prompt: string;
  tier: EnhancementTier;
  modality: PromptModality;
  subModality?: SubModality;
  targetPlatform?: TargetPlatform;
  includeNegativeExamples?: boolean;
  tone?: 'professional' | 'casual' | 'academic' | 'creative' | 'technical' | 'friendly';
  length?: 'concise' | 'standard' | 'detailed';
  customInstructions?: string;
}

// ============================================================================
// BUILDER RESULT
// ============================================================================

export interface MetaPromptBuilderResult {
  systemPrompt: string;
  userMessage: string;
  fewShotExamples: FewShotExample[];
  constraints: ModalityConstraints;
  tierConfig: TierConfig;
}
