/**
 * Meta-Prompt Builder
 *
 * Constructs complete system prompts and user messages by combining:
 * - Modality-specific configurations
 * - Tier-based feature selection
 * - Platform syntax adaptations
 * - Few-shot examples
 * - Constraint generation
 */

import type {
  MetaPromptBuilderOptions,
  MetaPromptBuilderResult,
  EnhancementTier,
  PromptModality,
  SubModality,
  TargetPlatform,
  FewShotExample,
  ModalityConstraints,
  TierConfig,
} from './types.js';
import { TIER_CONFIGS } from './types.js';
import {
  getModalityConfig,
  getModalitySystemPrompt,
  getModalityExamples,
  getModalityNegativeExamples,
  getModalityConstraints,
} from './modalities/index.js';
import { buildPlatformGuidance } from './platforms/index.js';

// ============================================================================
// BUILDER CLASS
// ============================================================================

export class MetaPromptBuilder {
  private options: MetaPromptBuilderOptions;
  private tierConfig: TierConfig;

  constructor(options: MetaPromptBuilderOptions) {
    this.options = options;
    this.tierConfig = TIER_CONFIGS[options.tier];
  }

  /**
   * Build the complete system prompt for enhancement
   */
  buildSystemPrompt(): string {
    const { modality, tier, subModality, targetPlatform } = this.options;

    // Get base modality system prompt
    let systemPrompt = getModalitySystemPrompt(modality, tier, subModality);

    // Add platform-specific guidance if specified and tier supports it
    if (targetPlatform && this.tierConfig.platformAdaptation !== 'none') {
      const platformGuidance = buildPlatformGuidance(targetPlatform);
      if (platformGuidance) {
        systemPrompt = this.insertPlatformGuidance(systemPrompt, platformGuidance);
      }
    }

    return systemPrompt;
  }

  /**
   * Build the complete user message with examples and constraints
   */
  buildUserMessage(): string {
    const { prompt, tier, modality, tone, length, customInstructions, subModality, targetPlatform } = this.options;

    let message = `<enhancement_request>
<original_prompt>
${prompt}
</original_prompt>

<parameters>
<tier>${tier}</tier>
<modality>${modality}</modality>`;

    // Add sub-modality if specified and tier supports it
    if (subModality && this.tierConfig.subModalitySupport) {
      message += `\n<sub_modality>${subModality}</sub_modality>`;
    }

    // Add platform if specified
    if (targetPlatform && targetPlatform !== 'general') {
      message += `\n<target_platform>${targetPlatform}</target_platform>`;
    }

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

`;

    // Add few-shot examples based on tier
    const examples = this.getExamples();
    if (examples.length > 0) {
      message += this.formatFewShotExamples(examples);
      message += '\n\n';
    }

    // Add negative examples for advanced tier
    if (this.tierConfig.includeNegativeExamples) {
      const negativeExamples = getModalityNegativeExamples(modality, tier);
      if (negativeExamples.length > 0) {
        message += this.formatNegativeExamples(negativeExamples);
        message += '\n\n';
      }
    }

    // Add constraints
    const constraints = this.getConstraints();
    message += this.formatConstraints(constraints);

    // Detect and enforce character/word count limits from user prompt or custom instructions
    const lengthConstraint = extractLengthConstraint(prompt, customInstructions);
    if (lengthConstraint) {
      message += `\n\n<length_constraint>
CRITICAL: The user has specified a length limit. The enhanced prompt output MUST strictly adhere to this constraint:
${lengthConstraint}
Do NOT exceed this limit. Count carefully. This overrides any default output length guidance.
</length_constraint>`;
    }
    
    message += '\n\nTransform the original prompt into an optimized version. Return ONLY the enhanced prompt.';

    return message;
  }

  /**
   * Build complete result with all components
   */
  build(): MetaPromptBuilderResult {
    return {
      systemPrompt: this.buildSystemPrompt(),
      userMessage: this.buildUserMessage(),
      fewShotExamples: this.getExamples(),
      constraints: this.getConstraints(),
      tierConfig: this.tierConfig,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getExamples(): FewShotExample[] {
    const { modality, tier, subModality, targetPlatform } = this.options;
    return getModalityExamples(modality, tier, {
      subModality,
      platform: targetPlatform,
    });
  }

  private getConstraints(): ModalityConstraints {
    const { modality, tier } = this.options;
    return getModalityConstraints(modality, tier);
  }

  private formatFewShotExamples(examples: FewShotExample[]): string {
    if (examples.length === 0) return '';

    const formattedExamples = examples.map((ex, i) => `<example id="${i + 1}">
<input>${ex.input}</input>
<output>
${ex.output}
</output>
</example>`).join('\n\n');

    return `<few_shot_examples>
${formattedExamples}
</few_shot_examples>`;
  }

  private formatNegativeExamples(examples: { badInput: string; badOutput: string; goodOutput: string; explanation: string }[]): string {
    if (examples.length === 0) return '';

    const formattedExamples = examples.map((ex, i) => `<negative_example id="${i + 1}">
<bad_input>${ex.badInput}</bad_input>
<bad_output>${ex.badOutput}</bad_output>
<good_output>${ex.goodOutput}</good_output>
<explanation>${ex.explanation}</explanation>
</negative_example>`).join('\n\n');

    return `<negative_examples>
These examples show common mistakes to avoid:
${formattedExamples}
</negative_examples>`;
  }

  private formatConstraints(constraints: ModalityConstraints): string {
    const { always, never } = constraints;

    if (always.length === 0 && never.length === 0) return '';

    let formatted = '<constraints>\n';

    if (always.length > 0) {
      formatted += 'ALWAYS:\n';
      formatted += always.map((c) => `- ${c}`).join('\n');
      formatted += '\n\n';
    }

    if (never.length > 0) {
      formatted += 'NEVER:\n';
      formatted += never.map((c) => `- ${c}`).join('\n');
    }

    formatted += '\n</constraints>';
    return formatted;
  }

  private insertPlatformGuidance(systemPrompt: string, platformGuidance: string): string {
    // Insert platform guidance before the output_rules section
    const outputRulesIndex = systemPrompt.indexOf('<output_rules>');
    if (outputRulesIndex !== -1) {
      return (
        systemPrompt.slice(0, outputRulesIndex) +
        '\n' + platformGuidance + '\n\n' +
        systemPrompt.slice(outputRulesIndex)
      );
    }
    // If no output_rules, append to end (before </system>)
    const systemEndIndex = systemPrompt.lastIndexOf('</system>');
    if (systemEndIndex !== -1) {
      return (
        systemPrompt.slice(0, systemEndIndex) +
        '\n' + platformGuidance + '\n\n' +
        systemPrompt.slice(systemEndIndex)
      );
    }
    // Fallback: append to end
    return systemPrompt + '\n\n' + platformGuidance;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Build system prompt and user message in one call
 */
export function buildMetaPrompt(options: MetaPromptBuilderOptions): MetaPromptBuilderResult {
  const builder = new MetaPromptBuilder(options);
  return builder.build();
}

/**
 * Quick check if a configuration would use the new V3 features
 */
export function usesV3Features(options: {
  subModality?: SubModality;
  targetPlatform?: TargetPlatform;
  includeNegativeExamples?: boolean;
}): boolean {
  return !!(options.subModality || options.targetPlatform || options.includeNegativeExamples);
}

/**
 * Get tier configuration for a tier level
 */
export function getTierConfig(tier: EnhancementTier): TierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Determine if tier supports a feature
 */
export function tierSupportsFeature(
  tier: EnhancementTier,
  feature: keyof TierConfig
): boolean {
  const config = TIER_CONFIGS[tier];
  const value = config[feature];

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value !== 'none';
  return true;
}

// ============================================================================
// LENGTH CONSTRAINT DETECTION
// ============================================================================

/**
 * Extract explicit length/character/word constraints from user prompt or custom instructions.
 * Returns a constraint string if found, null otherwise.
 */
function extractLengthConstraint(prompt: string, customInstructions?: string): string | null {
  const combined = `${prompt} ${customInstructions || ''}`;
  const constraints: string[] = [];

  // Match character limits: "under 500 characters", "max 200 chars", "limit to 1000 characters", "500 char limit"
  const charPatterns = [
    /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|within|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d[\d,]*)\s*(?:char(?:acter)?s?)\b/gi,
    /(\d[\d,]*)\s*(?:char(?:acter)?s?)\s*(?:limit|max(?:imum)?|or\s+(?:less|fewer))\b/gi,
  ];

  for (const pattern of charPatterns) {
    let match;
    while ((match = pattern.exec(combined)) !== null) {
      const num = match[1]!.replace(/,/g, '');
      constraints.push(`Maximum ${num} characters`);
    }
  }

  // Match word limits: "under 100 words", "max 50 words", "200 word limit"
  const wordPatterns = [
    /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|within|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d[\d,]*)\s*words?\b/gi,
    /(\d[\d,]*)\s*words?\s*(?:limit|max(?:imum)?|or\s+(?:less|fewer))\b/gi,
  ];

  for (const pattern of wordPatterns) {
    let match;
    while ((match = pattern.exec(combined)) !== null) {
      const num = match[1]!.replace(/,/g, '');
      constraints.push(`Maximum ${num} words`);
    }
  }

  // Match sentence limits: "in 3 sentences", "max 5 sentences"
  const sentencePatterns = [
    /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|in|within|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d+)\s*sentences?\b/gi,
    /(\d+)\s*sentences?\s*(?:limit|max(?:imum)?|or\s+(?:less|fewer))\b/gi,
  ];

  for (const pattern of sentencePatterns) {
    let match;
    while ((match = pattern.exec(combined)) !== null) {
      constraints.push(`Maximum ${match[1]} sentences`);
    }
  }

  // Match line limits: "under 10 lines", "max 5 lines"
  const linePatterns = [
    /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d+)\s*lines?\b/gi,
    /(\d+)\s*lines?\s*(?:limit|max(?:imum)?|or\s+(?:less|fewer))\b/gi,
  ];

  for (const pattern of linePatterns) {
    let match;
    while ((match = pattern.exec(combined)) !== null) {
      constraints.push(`Maximum ${match[1]} lines`);
    }
  }

  // Match paragraph limits: "in 2 paragraphs", "max 3 paragraphs"
  const paragraphPatterns = [
    /(?:under|below|max(?:imum)?|limit(?:\s+to)?|no\s+more\s+than|at\s+most|in|keep\s+(?:it\s+)?(?:under|below|to))\s+(\d+)\s*paragraphs?\b/gi,
    /(\d+)\s*paragraphs?\s*(?:limit|max(?:imum)?|or\s+(?:less|fewer))\b/gi,
  ];

  for (const pattern of paragraphPatterns) {
    let match;
    while ((match = pattern.exec(combined)) !== null) {
      constraints.push(`Maximum ${match[1]} paragraphs`);
    }
  }

  if (constraints.length === 0) return null;

  // Deduplicate
  return [...new Set(constraints)].join('. ') + '.';
}
