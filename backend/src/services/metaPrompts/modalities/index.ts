/**
 * Modality Registry
 *
 * Central export for all modality configurations.
 * Each modality provides specialized prompt engineering for its domain.
 */

import type { ModalityConfig, PromptModality, SubModality, EnhancementTier } from '../types.js';
import { textModalityConfig } from './text.js';
import { imageModalityConfig } from './image.js';
import { videoModalityConfig } from './video.js';
import { audioModalityConfig } from './audio.js';
import { codeModalityConfig } from './code.js';
import { threeDModalityConfig } from './3d.js';
import { nsfwModalityConfig } from './nsfw.js';

// ============================================================================
// MODALITY REGISTRY
// ============================================================================

const modalityRegistry: Record<PromptModality, ModalityConfig> = {
  text: textModalityConfig,
  image: imageModalityConfig,
  video: videoModalityConfig,
  audio: audioModalityConfig,
  code: codeModalityConfig,
  '3d': threeDModalityConfig,
  nsfw: nsfwModalityConfig,
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the configuration for a specific modality
 */
export function getModalityConfig(modality: PromptModality): ModalityConfig {
  const config = modalityRegistry[modality];
  if (!config) {
    throw new Error(`Unknown modality: ${modality}`);
  }
  return config;
}

/**
 * Get all available modalities
 */
export function getAvailableModalities(): PromptModality[] {
  return Object.keys(modalityRegistry) as PromptModality[];
}

/**
 * Check if a sub-modality is valid for a given modality
 */
export function isValidSubModality(modality: PromptModality, subModality: SubModality): boolean {
  const config = modalityRegistry[modality];
  return config?.subModalities.includes(subModality) ?? false;
}

/**
 * Get the default sub-modality for a given modality
 */
export function getDefaultSubModality(modality: PromptModality): SubModality {
  const config = modalityRegistry[modality];
  return config?.defaultSubModality ?? 'general';
}

/**
 * Get the system prompt for a modality with optional sub-modality
 */
export function getModalitySystemPrompt(
  modality: PromptModality,
  tier: EnhancementTier,
  subModality?: SubModality
): string {
  const config = modalityRegistry[modality];
  if (!config) {
    throw new Error(`Unknown modality: ${modality}`);
  }

  // Use the modality's default sub-modality if none provided
  const effectiveSubModality = subModality ?? config.defaultSubModality;

  // Call the modality's buildSystemPrompt with proper typing
  // The function accepts SubModality but internally casts to its specific type
  return config.buildSystemPrompt(tier, effectiveSubModality);
}

/**
 * Get few-shot examples for a modality, filtered by tier and optional sub-modality/platform
 */
export function getModalityExamples(
  modality: PromptModality,
  tier: EnhancementTier,
  options?: {
    subModality?: SubModality;
    platform?: string;
    maxExamples?: number;
  }
): typeof modalityRegistry[PromptModality]['fewShotExamples'] {
  const config = modalityRegistry[modality];
  if (!config) {
    return [];
  }

  let examples = [...config.fewShotExamples];

  // Filter by sub-modality if specified
  if (options?.subModality) {
    const subModalityExamples = examples.filter((ex) => ex.subModality === options.subModality);
    // If we have sub-modality specific examples, prefer them
    if (subModalityExamples.length > 0) {
      examples = subModalityExamples;
    }
  }

  // Filter by platform if specified
  if (options?.platform) {
    const platformExamples = examples.filter(
      (ex) => ex.platform === options.platform || ex.platform === 'general' || !ex.platform
    );
    if (platformExamples.length > 0) {
      examples = platformExamples;
    }
  }

  // Determine how many examples based on tier
  const tierExampleCounts: Record<EnhancementTier, number> = {
    basic: 0,
    standard: 2,
    advanced: 3,
  };

  const maxCount = options?.maxExamples ?? tierExampleCounts[tier];

  // Sort by complexity for better learning progression
  const complexityOrder = { simple: 0, medium: 1, complex: 2 };
  examples.sort((a, b) => complexityOrder[a.complexity] - complexityOrder[b.complexity]);

  return examples.slice(0, maxCount);
}

/**
 * Get negative examples for a modality (only for advanced tier)
 */
export function getModalityNegativeExamples(
  modality: PromptModality,
  tier: EnhancementTier
): typeof modalityRegistry[PromptModality]['negativeExamples'] {
  if (tier !== 'advanced') {
    return [];
  }

  const config = modalityRegistry[modality];
  return config?.negativeExamples ?? [];
}

/**
 * Get constraints for a modality
 */
export function getModalityConstraints(
  modality: PromptModality,
  tier: EnhancementTier
): { always: string[]; never: string[] } {
  const config = modalityRegistry[modality];
  if (!config) {
    return { always: [], never: [] };
  }

  const { always, never } = config.constraints;

  // Return subset based on tier
  const constraintCounts: Record<EnhancementTier, number> = {
    basic: 3,
    standard: 5,
    advanced: always.length, // All constraints for advanced
  };

  const count = constraintCounts[tier];

  return {
    always: always.slice(0, count),
    never: never.slice(0, count),
  };
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export {
  textModalityConfig,
  imageModalityConfig,
  videoModalityConfig,
  audioModalityConfig,
  codeModalityConfig,
  threeDModalityConfig,
  nsfwModalityConfig,
};
