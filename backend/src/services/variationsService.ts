/**
 * Prompt Variations Service
 *
 * Generates multiple variations of prompts for A/B testing and optimization.
 *
 * Maps service-level concepts to the Prisma schema:
 *   - PromptVariation: stores each variation as a named variant of a prompt.
 *     Custom data (originalPrompt, config, comparisonData, selectedIndex) stored in `metadata` Json field.
 *   - VariationResult: stores individual test results per variation.
 *     Custom data (index, tone, length, enhancedPrompt, tokensUsed, targetPlatform, performanceScore) stored in `metadata` Json field.
 */

import { VariationStatus, PlatformType, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { enhancePrompt, type PromptTone, type OutputLength } from './deepseekService.js';
import { optimizePromptForPlatform } from './platformService.js';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface VariationConfig {
  tones: PromptTone[];
  lengths: OutputLength[];
  platforms?: PlatformType[];
  temperature?: number;
  includeOriginal?: boolean;
  maxVariations?: number;
}

export interface VariationResultData {
  index: number;
  tone: string;
  length: string;
  platform?: string;
  enhancedPrompt: string;
  tokensUsed: number;
  score?: number;
}

export interface VariationComparison {
  variationId: string;
  results: VariationResultData[];
  winner?: number;
  metrics: {
    averageTokens: number;
    tokenRange: { min: number; max: number };
    lengthRange: { min: number; max: number };
    diversityScore: number;
  };
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_VARIATION_CONFIGS: Record<string, VariationConfig> = {
  quick: {
    tones: ['professional', 'casual'],
    lengths: ['concise', 'standard'],
    maxVariations: 4,
  },
  comprehensive: {
    tones: ['professional', 'casual', 'academic', 'creative'],
    lengths: ['concise', 'standard', 'detailed'],
    maxVariations: 12,
  },
  platform_test: {
    tones: ['professional'],
    lengths: ['standard'],
    platforms: ['CHATGPT', 'CLAUDE', 'GEMINI'],
    maxVariations: 3,
  },
  creative_exploration: {
    tones: ['creative', 'technical', 'friendly'],
    lengths: ['standard', 'detailed'],
    temperature: 0.9,
    maxVariations: 6,
  },
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Generate prompt variations based on configuration.
 *
 * Creates a PromptVariation record per variation. The first record acts as the
 * "parent" and stores the original prompt + config in metadata.
 * Each generated variation is stored as a VariationResult linked to the parent.
 */
export async function generateVariations(
  userId: string,
  originalPrompt: string,
  promptId: string,
  config: VariationConfig | string = 'quick'
): Promise<string> {
  try {
    // Get configuration
    const variationConfig: VariationConfig = typeof config === 'string'
      ? DEFAULT_VARIATION_CONFIGS[config] ?? DEFAULT_VARIATION_CONFIGS.quick!
      : config;

    // Create the parent variation record
    const variation = await prisma.promptVariation.create({
      data: {
        promptId,
        variantName: `variation-${Date.now()}`,
        variantPrompt: originalPrompt,
        status: VariationStatus.TESTING,
        metadata: {
          originalPrompt,
          config: variationConfig,
          userId,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Generate variations
    const results: VariationResultData[] = [];
    let index = 0;

    // Include original if requested
    if (variationConfig.includeOriginal) {
      results.push({
        index: index++,
        tone: 'original',
        length: 'original',
        enhancedPrompt: originalPrompt,
        tokensUsed: Math.ceil(originalPrompt.length / 4),
      });
    }

    // Generate tone and length combinations
    for (const tone of variationConfig.tones) {
      for (const length of variationConfig.lengths) {
        if (variationConfig.maxVariations && index >= variationConfig.maxVariations) {
          break;
        }

        try {
          // Enhance with specific tone and length
          const enhanced = await enhancePrompt({
            prompt: originalPrompt,
            tier: 'standard',
            tone,
            length,
            temperature: variationConfig.temperature,
          });

          // Apply platform optimization if specified
          let finalPrompt = enhanced.enhancedPrompt;
          if (variationConfig.platforms && variationConfig.platforms[0]) {
            finalPrompt = optimizePromptForPlatform(
              enhanced.enhancedPrompt,
              variationConfig.platforms[0]
            );
          }

          results.push({
            index: index++,
            tone,
            length,
            enhancedPrompt: finalPrompt,
            tokensUsed: enhanced.totalTokens,
          });

          // Save individual result
          await prisma.variationResult.create({
            data: {
              variationId: variation.id,
              sessionId: crypto.randomUUID(),
              selected: false,
              metadata: {
                index: index - 1,
                tone,
                length,
                enhancedPrompt: finalPrompt,
                tokensUsed: enhanced.totalTokens,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          logger.error({ tone, length, error }, 'Failed to generate variation');
        }
      }
    }

    // Generate platform-specific variations if specified
    if (variationConfig.platforms) {
      for (const platform of variationConfig.platforms) {
        if (variationConfig.maxVariations && index >= variationConfig.maxVariations) {
          break;
        }

        try {
          const optimized = optimizePromptForPlatform(originalPrompt, platform);

          results.push({
            index: index++,
            tone: 'optimized',
            length: 'platform',
            platform,
            enhancedPrompt: optimized,
            tokensUsed: Math.ceil(optimized.length / 4),
          });

          await prisma.variationResult.create({
            data: {
              variationId: variation.id,
              sessionId: crypto.randomUUID(),
              selected: false,
              metadata: {
                index: index - 1,
                tone: 'optimized',
                length: 'platform',
                targetPlatform: platform,
                enhancedPrompt: optimized,
                tokensUsed: Math.ceil(optimized.length / 4),
              } as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          logger.error({ platform, error }, 'Failed to generate platform variation');
        }
      }
    }

    // Calculate metrics
    const metrics = calculateVariationMetrics(results);

    // Update variation with results and metrics in metadata
    await prisma.promptVariation.update({
      where: { id: variation.id },
      data: {
        status: VariationStatus.TESTING,
        metadata: {
          originalPrompt,
          config: variationConfig,
          userId,
          results,
          comparisonData: metrics,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return variation.id;
  } catch (error) {
    logger.error({ error }, 'Failed to generate variations');
    throw error;
  }
}

/**
 * Calculate metrics for variation comparison
 */
function calculateVariationMetrics(results: VariationResultData[]) {
  if (results.length === 0) {
    return {
      averageTokens: 0,
      tokenRange: { min: 0, max: 0 },
      lengthRange: { min: 0, max: 0 },
      diversityScore: 0,
    };
  }

  const tokens = results.map(r => r.tokensUsed);
  const lengths = results.map(r => r.enhancedPrompt.length);

  // Calculate diversity score based on unique words
  const allWords = new Set<string>();
  const wordSets: Set<string>[] = results.map(r => {
    const words = new Set(r.enhancedPrompt.toLowerCase().split(/\s+/));
    words.forEach(w => allWords.add(w));
    return words;
  });

  let diversityScore = 0;
  if (wordSets.length > 1) {
    // Calculate Jaccard distance between variations
    for (let i = 0; i < wordSets.length - 1; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const setI = wordSets[i]!;
        const setJ = wordSets[j]!;
        const intersection = new Set([...setI].filter(x => setJ.has(x)));
        const union = new Set([...setI, ...setJ]);
        const jaccard = 1 - (intersection.size / union.size);
        diversityScore += jaccard;
      }
    }
    diversityScore /= (wordSets.length * (wordSets.length - 1)) / 2;
  }

  return {
    averageTokens: tokens.reduce((a, b) => a + b, 0) / tokens.length,
    tokenRange: { min: Math.min(...tokens), max: Math.max(...tokens) },
    lengthRange: { min: Math.min(...lengths), max: Math.max(...lengths) },
    diversityScore,
  };
}

/**
 * Extract VariationResultData from a VariationResult's metadata JSON field
 */
function extractResultData(result: { metadata: any; rating: number | null; selected: boolean }): VariationResultData {
  const meta = (result.metadata ?? {}) as Record<string, any>;
  return {
    index: meta.index ?? 0,
    tone: meta.tone ?? 'unknown',
    length: meta.length ?? 'unknown',
    platform: meta.targetPlatform ?? undefined,
    enhancedPrompt: meta.enhancedPrompt ?? '',
    tokensUsed: meta.tokensUsed ?? 0,
    score: meta.performanceScore ?? (result.rating ? result.rating / 5 : undefined),
  };
}

/**
 * Get variation results for comparison
 */
export async function getVariationComparison(variationId: string): Promise<VariationComparison> {
  const variation = await prisma.promptVariation.findUnique({
    where: { id: variationId },
    include: {
      results: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!variation) {
    throw new Error('Variation not found');
  }

  const results: VariationResultData[] = variation.results.map(r => extractResultData(r));

  const variationMeta = (variation.metadata ?? {}) as Record<string, any>;
  const metrics = variationMeta.comparisonData ?? calculateVariationMetrics(results);

  return {
    variationId,
    results,
    winner: variationMeta.selectedVariationIndex ?? undefined,
    metrics,
  };
}

/**
 * Rate a variation result
 */
export async function rateVariation(
  variationId: string,
  index: number,
  rating: number
): Promise<void> {
  // Find the result matching the given index via metadata
  const allResults = await prisma.variationResult.findMany({
    where: { variationId },
  });

  const targetResult = allResults.find(r => {
    const meta = (r.metadata ?? {}) as Record<string, any>;
    return meta.index === index;
  });

  if (targetResult) {
    const existingMeta = (targetResult.metadata ?? {}) as Record<string, any>;
    await prisma.variationResult.update({
      where: { id: targetResult.id },
      data: {
        rating,
        metadata: {
          ...existingMeta,
          performanceScore: rating / 5,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Update winner if this is the highest rated
  const updatedResults = await prisma.variationResult.findMany({
    where: { variationId },
  });

  // Sort by rating descending
  const sorted = updatedResults
    .filter(r => r.rating !== null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  if (sorted.length > 0) {
    const bestResult = sorted[0]!;
    const bestMeta = (bestResult.metadata ?? {}) as Record<string, any>;
    const bestIndex = bestMeta.index ?? 0;

    const variationRecord = await prisma.promptVariation.findUnique({
      where: { id: variationId },
    });
    if (variationRecord) {
      const variationMeta = (variationRecord.metadata ?? {}) as Record<string, any>;
      await prisma.promptVariation.update({
        where: { id: variationId },
        data: {
          metadata: {
            ...variationMeta,
            selectedVariationIndex: bestIndex,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
}

/**
 * Select winner from variations
 */
export async function selectVariationWinner(
  variationId: string,
  winnerIndex: number
): Promise<void> {
  // Update metadata with selected winner
  const variationRecord = await prisma.promptVariation.findUnique({
    where: { id: variationId },
  });

  if (variationRecord) {
    const variationMeta = (variationRecord.metadata ?? {}) as Record<string, any>;
    await prisma.promptVariation.update({
      where: { id: variationId },
      data: {
        status: VariationStatus.WINNER,
        metadata: {
          ...variationMeta,
          selectedVariationIndex: winnerIndex,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Mark the winning result as selected
  const allResults = await prisma.variationResult.findMany({
    where: { variationId },
  });

  for (const result of allResults) {
    const meta = (result.metadata ?? {}) as Record<string, any>;
    const isWinner = meta.index === winnerIndex;

    await prisma.variationResult.update({
      where: { id: result.id },
      data: {
        selected: isWinner,
        metadata: {
          ...meta,
          ...(isWinner ? { performanceScore: 1.0 } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/**
 * Get user's variation history.
 * Queries via the Prompt -> PromptVariation relationship since PromptVariation
 * does not have a direct userId field.
 */
export async function getUserVariations(
  userId: string,
  limit = 20,
  offset = 0
) {
  const [variations, total] = await Promise.all([
    prisma.promptVariation.findMany({
      where: {
        prompt: { userId },
      },
      include: {
        results: {
          orderBy: { rating: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.promptVariation.count({
      where: {
        prompt: { userId },
      },
    }),
  ]);

  return {
    variations,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Auto-select best variation based on criteria
 */
export async function autoSelectBestVariation(
  variationId: string,
  criteria: {
    preferShorter?: boolean;
    preferLowerTokens?: boolean;
    targetPlatform?: PlatformType;
  }
): Promise<number> {
  const comparison = await getVariationComparison(variationId);

  let bestIndex = 0;
  let bestScore = -1;

  const lengthRange = comparison.metrics.lengthRange.max - comparison.metrics.lengthRange.min;
  const tokenRange = comparison.metrics.tokenRange.max - comparison.metrics.tokenRange.min;

  for (const result of comparison.results) {
    let score = 0;

    // Length preference
    if (criteria.preferShorter && lengthRange > 0) {
      score += (comparison.metrics.lengthRange.max - result.enhancedPrompt.length) / lengthRange;
    }

    // Token efficiency
    if (criteria.preferLowerTokens && tokenRange > 0) {
      score += (comparison.metrics.tokenRange.max - result.tokensUsed) / tokenRange;
    }

    // Platform match
    if (criteria.targetPlatform && result.platform === criteria.targetPlatform) {
      score += 2; // Heavy weight for platform match
    }

    // User rating if available
    if (result.score) {
      score += result.score;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = result.index;
    }
  }

  await selectVariationWinner(variationId, bestIndex);
  return bestIndex;
}
