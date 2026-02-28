/**
 * Prompt Variations Service
 * 
 * Generates multiple variations of prompts for A/B testing and optimization
 */

import { VariationStatus, PlatformType } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { enhancePrompt, type PromptTone, type OutputLength } from './deepseekService.js';
import { optimizePromptForPlatform } from './platformService.js';

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

export interface VariationResult {
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
  results: VariationResult[];
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
 * Generate prompt variations based on configuration
 */
export async function generateVariations(
  userId: string,
  originalPrompt: string,
  config: VariationConfig | string = 'quick'
): Promise<string> {
  try {
    // Get configuration
    const variationConfig = typeof config === 'string' 
      ? DEFAULT_VARIATION_CONFIGS[config] || DEFAULT_VARIATION_CONFIGS.quick
      : config;

    // Create variation record
    const variation = await prisma.promptVariation.create({
      data: {
        userId,
        originalPrompt,
        status: 'PENDING',
        variations: {},
      },
    });

    // Generate variations
    const results: VariationResult[] = [];
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
              index: index - 1,
              tone,
              length,
              enhancedPrompt: finalPrompt,
              tokensUsed: enhanced.totalTokens,
            },
          });
        } catch (error) {
          logger.error('Failed to generate variation', { tone, length, error });
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
              index: index - 1,
              tone: 'optimized',
              length: 'platform',
              targetPlatform: platform,
              enhancedPrompt: optimized,
              tokensUsed: Math.ceil(optimized.length / 4),
            },
          });
        } catch (error) {
          logger.error('Failed to generate platform variation', { platform, error });
        }
      }
    }

    // Calculate metrics
    const metrics = calculateVariationMetrics(results);

    // Update variation with results and metrics
    await prisma.promptVariation.update({
      where: { id: variation.id },
      data: {
        status: 'COMPLETED',
        variations: results,
        comparisonData: metrics,
      },
    });

    return variation.id;
  } catch (error) {
    logger.error('Failed to generate variations', { error });
    throw error;
  }
}

/**
 * Calculate metrics for variation comparison
 */
function calculateVariationMetrics(results: VariationResult[]) {
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
  const wordSets = results.map(r => {
    const words = new Set(r.enhancedPrompt.toLowerCase().split(/\s+/));
    words.forEach(w => allWords.add(w));
    return words;
  });

  let diversityScore = 0;
  if (wordSets.length > 1) {
    // Calculate Jaccard distance between variations
    for (let i = 0; i < wordSets.length - 1; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const intersection = new Set([...wordSets[i]].filter(x => wordSets[j].has(x)));
        const union = new Set([...wordSets[i], ...wordSets[j]]);
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
 * Get variation results for comparison
 */
export async function getVariationComparison(variationId: string): Promise<VariationComparison> {
  const variation = await prisma.promptVariation.findUnique({
    where: { id: variationId },
    include: {
      results: {
        orderBy: { index: 'asc' },
      },
    },
  });

  if (!variation) {
    throw new Error('Variation not found');
  }

  const results: VariationResult[] = variation.results.map(r => ({
    index: r.index,
    tone: r.tone,
    length: r.length,
    platform: r.targetPlatform || undefined,
    enhancedPrompt: r.enhancedPrompt,
    tokensUsed: r.tokensUsed,
    score: r.performanceScore || undefined,
  }));

  const metrics = variation.comparisonData as any || calculateVariationMetrics(results);

  return {
    variationId,
    results,
    winner: variation.selectedVariationIndex || undefined,
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
  await prisma.variationResult.updateMany({
    where: {
      variationId,
      index,
    },
    data: {
      userRating: rating,
      performanceScore: rating / 5, // Normalize to 0-1
    },
  });

  // Update winner if this is the highest rated
  const allResults = await prisma.variationResult.findMany({
    where: { variationId },
    orderBy: { performanceScore: 'desc' },
  });

  if (allResults.length > 0 && allResults[0].performanceScore) {
    await prisma.promptVariation.update({
      where: { id: variationId },
      data: {
        selectedVariationIndex: allResults[0].index,
      },
    });
  }
}

/**
 * Select winner from variations
 */
export async function selectVariationWinner(
  variationId: string,
  winnerIndex: number
): Promise<void> {
  await prisma.promptVariation.update({
    where: { id: variationId },
    data: {
      selectedVariationIndex: winnerIndex,
    },
  });

  // Set performance score for winner
  await prisma.variationResult.updateMany({
    where: {
      variationId,
      index: winnerIndex,
    },
    data: {
      performanceScore: 1.0,
    },
  });
}

/**
 * Get user's variation history
 */
export async function getUserVariations(
  userId: string,
  limit = 20,
  offset = 0
) {
  const [variations, total] = await Promise.all([
    prisma.promptVariation.findMany({
      where: { userId },
      include: {
        results: {
          orderBy: { performanceScore: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.promptVariation.count({ where: { userId } }),
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

  for (const result of comparison.results) {
    let score = 0;

    // Length preference
    if (criteria.preferShorter) {
      score += (comparison.metrics.lengthRange.max - result.enhancedPrompt.length) / 
               (comparison.metrics.lengthRange.max - comparison.metrics.lengthRange.min);
    }

    // Token efficiency
    if (criteria.preferLowerTokens) {
      score += (comparison.metrics.tokenRange.max - result.tokensUsed) /
               (comparison.metrics.tokenRange.max - comparison.metrics.tokenRange.min);
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