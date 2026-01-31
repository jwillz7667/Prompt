/**
 * Meta-Prompts Module
 *
 * Comprehensive modality-specific prompt engineering system.
 * Exports all types, configurations, and builder utilities.
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  // Core types
  PromptModality,
  EnhancementTier,

  // Sub-modality types
  SubModality,
  TextSubModality,
  ImageSubModality,
  VideoSubModality,
  AudioSubModality,
  CodeSubModality,
  ThreeDSubModality,

  // Platform types
  TargetPlatform,
  ImagePlatform,
  VideoPlatform,
  AudioPlatform,
  CodePlatform,
  TextPlatform,
  ThreeDPlatform,

  // Configuration types
  ModalityConfig,
  TierConfig,
  ModalityConstraints,

  // Example types
  FewShotExample,
  NegativeExample,
  ExampleComplexity,

  // Builder types
  MetaPromptBuilderOptions,
  MetaPromptBuilderResult,

  // Platform types
  PlatformSyntaxAdapter,
} from './types.js';

export { TIER_CONFIGS } from './types.js';

// ============================================================================
// MODALITY EXPORTS
// ============================================================================

export {
  getModalityConfig,
  getAvailableModalities,
  isValidSubModality,
  getDefaultSubModality,
  getModalitySystemPrompt,
  getModalityExamples,
  getModalityNegativeExamples,
  getModalityConstraints,
  // Individual modality configs
  textModalityConfig,
  imageModalityConfig,
  videoModalityConfig,
  audioModalityConfig,
  codeModalityConfig,
  threeDModalityConfig,
} from './modalities/index.js';

// ============================================================================
// PLATFORM EXPORTS
// ============================================================================

export {
  getPlatformAdapter,
  getPlatformSyntaxRules,
  getPlatformFormatHints,
  buildPlatformGuidance,
  applyPlatformParameters,
  getSupportedPlatforms,
} from './platforms/index.js';

// ============================================================================
// BUILDER EXPORTS
// ============================================================================

export {
  MetaPromptBuilder,
  buildMetaPrompt,
  usesV3Features,
  getTierConfig,
  tierSupportsFeature,
} from './basePromptBuilder.js';
