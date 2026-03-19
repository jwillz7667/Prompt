import { VariationStatus, Prisma, type PlatformType } from '@prisma/client';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import {
  detectModality,
  enhancePrompt,
  type PromptMode,
  type PromptModality,
} from './deepseekService.js';

interface VariationVariant {
  label: string;
  mode: PromptMode;
  focus?: string;
  customInstructions?: string;
  subModality?: string;
}

export interface VariationConfig {
  variants: VariationVariant[];
  includeOriginal?: boolean;
  maxVariations?: number;
}

export interface VariationResultData {
  index: number;
  label: string;
  mode: PromptMode | 'original';
  focus?: string;
  enhancedPrompt: string;
  tokensUsed: number;
  score?: number;
}

export interface VariationComparison {
  variationId: string;
  originalPrompt: string;
  status: VariationJobStatus;
  results: VariationResultData[];
  winner?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  metrics: {
    averageTokens: number;
    tokenRange: { min: number; max: number };
    lengthRange: { min: number; max: number };
    diversityScore: number;
  };
}

export interface VariationListItem {
  id: string;
  originalPrompt: string;
  status: string;
  selectedVariationIndex?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  results?: VariationResultData[];
}

const variationGenerationLimit = pLimit(4);
const variationJobProcessingLimit = pLimit(2);

type VariationJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

interface VariationMetadata {
  originalPrompt?: string;
  config?: VariationConfig;
  userId?: string;
  modality?: PromptModality;
  results?: VariationResultData[];
  comparisonData?: {
    averageTokens: number;
    tokenRange: { min: number; max: number };
    lengthRange: { min: number; max: number };
    diversityScore: number;
  };
  errors?: string[];
  selectedVariationIndex?: number;
  jobStatus?: VariationJobStatus;
  errorMessage?: string;
  queuedAt?: string;
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
}

function parseVariationMetadata(metadata: Prisma.JsonValue | null | undefined): VariationMetadata {
  return (metadata ?? {}) as VariationMetadata;
}

function serializeVariationMetadata(metadata: VariationMetadata): Prisma.InputJsonValue {
  return metadata as unknown as Prisma.InputJsonValue;
}

function semanticVariationStatus(
  status: VariationStatus,
  metadata: VariationMetadata
): VariationJobStatus {
  if (metadata.jobStatus) {
    return metadata.jobStatus;
  }

  switch (status) {
    case VariationStatus.DRAFT:
      return 'queued';
    case VariationStatus.TESTING:
      return 'processing';
    case VariationStatus.WINNER:
      return 'completed';
    case VariationStatus.ARCHIVED:
      return 'failed';
  }
}

function mergeVariationMetadata(
  existing: Prisma.JsonValue | null | undefined,
  patch: Partial<VariationMetadata>
): Prisma.InputJsonValue {
  const sanitizedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );

  return {
    ...parseVariationMetadata(existing),
    ...sanitizedPatch,
  } as unknown as Prisma.InputJsonValue;
}

function modalityFocusedVariants(modality: PromptModality): VariationVariant[] {
  switch (modality) {
    case 'image':
      return [
        {
          label: 'Composition First',
          mode: 'standard',
          focus: 'composition',
          customInstructions: 'Bias toward strong composition, framing, visual hierarchy, and focal clarity.',
        },
        {
          label: 'Style First',
          mode: 'standard',
          focus: 'style',
          customInstructions: 'Bias toward distinctive style language, medium cues, and visual identity.',
        },
        {
          label: 'MAX Visual Control',
          mode: 'max',
          focus: 'control',
          customInstructions: 'Maximize composition control, subject fidelity, lighting specificity, and failure-avoidance constraints.',
        },
      ];
    case 'video':
      return [
        {
          label: 'Motion First',
          mode: 'standard',
          focus: 'motion',
          customInstructions: 'Bias toward action choreography, pacing, and motion clarity.',
        },
        {
          label: 'Camera First',
          mode: 'standard',
          focus: 'camera',
          customInstructions: 'Bias toward camera movement, framing, continuity, and shot design.',
        },
        {
          label: 'MAX Continuity',
          mode: 'max',
          focus: 'continuity',
          customInstructions: 'Maximize subject continuity, temporal sequencing, and motion realism.',
        },
      ];
    case 'audio':
      return [
        {
          label: 'Structure First',
          mode: 'standard',
          focus: 'structure',
          customInstructions: 'Bias toward arrangement, section order, pacing, and progression.',
        },
        {
          label: 'Production First',
          mode: 'standard',
          focus: 'production',
          customInstructions: 'Bias toward timbre, mix character, dynamics, and production cues.',
        },
        {
          label: 'MAX Sonic Detail',
          mode: 'max',
          focus: 'detail',
          customInstructions: 'Maximize specificity in sound design, structure, performance, and production.',
        },
      ];
    case 'code':
      return [
        {
          label: 'Implementation First',
          mode: 'standard',
          focus: 'implementation',
          customInstructions: 'Bias toward concrete implementation scope, deliverables, and coding constraints.',
        },
        {
          label: 'Validation First',
          mode: 'standard',
          focus: 'validation',
          customInstructions: 'Bias toward tests, error handling, edge cases, and verification criteria.',
        },
        {
          label: 'MAX Production Spec',
          mode: 'max',
          focus: 'production',
          customInstructions: 'Maximize production-readiness, acceptance criteria, and maintainability constraints.',
        },
      ];
    case '3d':
      return [
        {
          label: 'Topology First',
          mode: 'standard',
          focus: 'topology',
          customInstructions: 'Bias toward mesh structure, poly budget, and topology expectations.',
        },
        {
          label: 'Material First',
          mode: 'standard',
          focus: 'materials',
          customInstructions: 'Bias toward materials, finish quality, and physical surface characteristics.',
        },
        {
          label: 'MAX Asset Spec',
          mode: 'max',
          focus: 'asset',
          customInstructions: 'Maximize downstream usability constraints such as printing, rigging, or game-readiness.',
        },
      ];
    case 'text':
    default:
      return [
        {
          label: 'Clarity First',
          mode: 'standard',
          focus: 'clarity',
          customInstructions: 'Bias toward clarity, simplicity, and a crisp output contract.',
        },
        {
          label: 'Execution First',
          mode: 'standard',
          focus: 'execution',
          customInstructions: 'Bias toward ordered steps, clear deliverables, and practical execution guidance.',
        },
        {
          label: 'MAX Reliability',
          mode: 'max',
          focus: 'reliability',
          customInstructions: 'Maximize precision, constraints, ambiguity handling, and verification criteria.',
        },
      ];
  }
}

const BASE_VARIATION_CONFIGS: Record<string, VariationConfig> = {
  quick: {
    variants: [
      { label: 'Standard', mode: 'standard', focus: 'balanced' },
      { label: 'MAX', mode: 'max', focus: 'depth' },
      {
        label: 'Structured',
        mode: 'standard',
        focus: 'structure',
        customInstructions: 'Strengthen the output contract, sections, and sequencing without making the prompt bloated.',
      },
      {
        label: 'Precision',
        mode: 'max',
        focus: 'precision',
        customInstructions: 'Bias toward specificity, hard constraints, and failure prevention.',
      },
    ],
    maxVariations: 4,
  },
  comprehensive: {
    variants: [
      { label: 'Standard', mode: 'standard', focus: 'balanced' },
      {
        label: 'Briefing',
        mode: 'standard',
        focus: 'briefing',
        customInstructions: 'Reframe the request as a crisp, high-context briefing with a strong deliverable definition.',
      },
      {
        label: 'Execution Plan',
        mode: 'standard',
        focus: 'execution',
        customInstructions: 'Bias toward steps, dependencies, and explicit completion criteria.',
      },
      { label: 'MAX', mode: 'max', focus: 'depth' },
      {
        label: 'MAX Rubric',
        mode: 'max',
        focus: 'rubric',
        customInstructions: 'Add explicit quality bars, evaluation criteria, and self-check instructions for the target model.',
      },
      {
        label: 'MAX Edge Cases',
        mode: 'max',
        focus: 'edge-cases',
        customInstructions: 'Bias toward ambiguity handling, fallback behavior, and edge-case coverage.',
      },
    ],
    maxVariations: 6,
  },
  modality_focus: {
    variants: [],
    maxVariations: 3,
  },
  max_compare: {
    variants: [
      { label: 'MAX Balanced', mode: 'max', focus: 'balanced' },
      {
        label: 'MAX Constraints',
        mode: 'max',
        focus: 'constraints',
        customInstructions: 'Bias toward hard constraints, explicit exclusions, and acceptance criteria.',
      },
      {
        label: 'MAX Process',
        mode: 'max',
        focus: 'process',
        customInstructions: 'Bias toward ordered work phases, checkpoints, and completion validation.',
      },
      {
        label: 'MAX Outcome',
        mode: 'max',
        focus: 'outcome',
        customInstructions: 'Bias toward deliverable quality, audience fit, and polished final output requirements.',
      },
    ],
    maxVariations: 4,
  },
};

function resolveConfig(config: VariationConfig | string, modality: PromptModality): VariationConfig {
  if (typeof config !== 'string') {
    return config;
  }

  if (config === 'modality_focus') {
    return {
      variants: modalityFocusedVariants(modality),
      maxVariations: 3,
    };
  }

  const resolved = BASE_VARIATION_CONFIGS[config as keyof typeof BASE_VARIATION_CONFIGS];
  if (resolved) {
    return resolved;
  }

  const fallback = BASE_VARIATION_CONFIGS.quick;
  if (fallback) {
    return fallback;
  }

  throw new Error('Missing default variation configuration');
}

async function ensurePromptSeed(
  userId: string,
  originalPrompt: string,
  promptId: string | undefined,
  modality: PromptModality
): Promise<string> {
  if (promptId) {
    return promptId;
  }

  const seed = await prisma.prompt.create({
    data: {
      userId,
      originalPrompt,
      enhancedPrompt: originalPrompt,
      model: 'variation-seed',
      temperature: 0,
      maxTokens: 0,
      modality,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      processingMs: 0,
    },
  });

  return seed.id;
}

function scheduleVariationGeneration(variationId: string, reason: string): void {
  void variationJobProcessingLimit(async () => {
    try {
      await processVariationGenerationJob(variationId);
    } catch (error) {
      logger.error({ error, variationId, reason }, 'Variation background job crashed');
      await markVariationFailed(
        variationId,
        error instanceof Error ? error.message : 'Unknown variation generation error'
      );
    }
  });
}

async function buildVariationResults(
  variationId: string,
  userId: string,
  originalPrompt: string,
  modality: PromptModality,
  variationConfig: VariationConfig
): Promise<{ results: VariationResultData[]; generationErrors: string[] }> {
  const results: VariationResultData[] = [];
  const generationErrors: string[] = [];
  let index = 0;

  if (variationConfig.includeOriginal) {
    results.push({
      index,
      label: 'Original',
      mode: 'original',
      focus: 'baseline',
      enhancedPrompt: originalPrompt,
      tokensUsed: Math.ceil(originalPrompt.length / 4),
    });
    index += 1;
  }

  const variants = variationConfig.maxVariations
    ? variationConfig.variants.slice(0, variationConfig.maxVariations)
    : variationConfig.variants;

  const baseIndex = index;
  const generatedResults = await Promise.all(
    variants.map((variant, variantOffset) => variationGenerationLimit(async () => {
      const resultIndex = baseIndex + variantOffset;

      try {
        const enhanced = await enhancePrompt({
          prompt: originalPrompt,
          tier: variant.mode === 'max' ? 'advanced' : 'standard',
          mode: variant.mode,
          modality,
          subModality: variant.subModality,
          customInstructions: variant.customInstructions,
        });

        const result: VariationResultData = {
          index: resultIndex,
          label: variant.label,
          mode: variant.mode,
          focus: variant.focus,
          enhancedPrompt: enhanced.enhancedPrompt,
          tokensUsed: enhanced.totalTokens,
        };

        await prisma.variationResult.create({
          data: {
            variationId,
            sessionId: crypto.randomUUID(),
            selected: false,
            userId,
            metadata: {
              index: result.index,
              label: result.label,
              mode: result.mode,
              focus: result.focus,
              enhancedPrompt: result.enhancedPrompt,
              tokensUsed: result.tokensUsed,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown variation generation error';
        generationErrors.push(`${variant.label}: ${message}`);
        logger.error({ error, variationId, variant }, 'Failed to generate variation result');
        return null;
      }
    }))
  );

  results.push(...generatedResults.filter((result): result is VariationResultData => result !== null));
  results.sort((left, right) => left.index - right.index);

  return { results, generationErrors };
}

async function markVariationFailed(variationId: string, message: string): Promise<void> {
  const existing = await prisma.promptVariation.findUnique({
    where: { id: variationId },
    select: { metadata: true },
  });

  if (!existing) {
    return;
  }

  await prisma.promptVariation.update({
    where: { id: variationId },
    data: {
      status: VariationStatus.ARCHIVED,
      metadata: mergeVariationMetadata(existing.metadata, {
        jobStatus: 'failed',
        errorMessage: message,
        failedAt: new Date().toISOString(),
      }),
    },
  });
}

async function processVariationGenerationJob(variationId: string): Promise<void> {
  const variation = await prisma.promptVariation.findUnique({
    where: { id: variationId },
    include: {
      prompt: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!variation) {
    return;
  }

  const metadata = parseVariationMetadata(variation.metadata);
  const status = semanticVariationStatus(variation.status, metadata);

  if (status === 'completed' || status === 'failed') {
    return;
  }

  if (variation.status === VariationStatus.DRAFT) {
    const claimed = await prisma.promptVariation.updateMany({
      where: {
        id: variationId,
        status: VariationStatus.DRAFT,
      },
      data: {
        status: VariationStatus.TESTING,
        metadata: mergeVariationMetadata(variation.metadata, {
          jobStatus: 'processing',
          errorMessage: undefined,
          processingStartedAt: new Date().toISOString(),
        }),
      },
    });

    if (claimed.count === 0) {
      return;
    }
  }

  const freshVariation = await prisma.promptVariation.findUnique({
    where: { id: variationId },
    include: {
      prompt: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!freshVariation) {
    return;
  }

  const freshMetadata = parseVariationMetadata(freshVariation.metadata);
  const originalPrompt = freshMetadata.originalPrompt ?? freshVariation.variantPrompt;
  const modality = freshMetadata.modality ?? detectModality(originalPrompt);
  const userId = freshMetadata.userId ?? freshVariation.prompt.userId;
  const variationConfig = resolveConfig(
    (freshMetadata.config as VariationConfig | string | undefined) ?? 'quick',
    modality
  );

  await prisma.variationResult.deleteMany({
    where: { variationId },
  });

  const { results, generationErrors } = await buildVariationResults(
    variationId,
    userId,
    originalPrompt,
    modality,
    variationConfig
  );

  if (results.length === 0) {
    await prisma.promptVariation.update({
      where: { id: variationId },
      data: {
        status: VariationStatus.ARCHIVED,
        metadata: mergeVariationMetadata(freshVariation.metadata, {
          config: variationConfig,
          userId,
          modality,
          errors: generationErrors,
          jobStatus: 'failed',
          errorMessage: 'Unable to generate prompt variations right now. Please try again.',
          failedAt: new Date().toISOString(),
        }),
      },
    });
    return;
  }

  const metrics = calculateVariationMetrics(results);

  await prisma.promptVariation.update({
    where: { id: variationId },
    data: {
      status: VariationStatus.WINNER,
      metadata: mergeVariationMetadata(freshVariation.metadata, {
        originalPrompt,
        config: variationConfig,
        userId,
        modality,
        results,
        comparisonData: metrics,
        errors: generationErrors.length > 0 ? generationErrors : undefined,
        jobStatus: 'completed',
        errorMessage: undefined,
        completedAt: new Date().toISOString(),
      }),
    },
  });
}

function buildVariationComparison(variation: {
  id: string;
  variantPrompt: string;
  status: VariationStatus;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  results: Array<{ metadata: unknown; rating: number | null }>;
}): VariationComparison {
  const metadata = parseVariationMetadata(variation.metadata);
  const results = variation.results.map((result) => extractResultData(result));

  return {
    variationId: variation.id,
    originalPrompt: metadata.originalPrompt ?? variation.variantPrompt,
    status: semanticVariationStatus(variation.status, metadata),
    results,
    winner: typeof metadata.selectedVariationIndex === 'number'
      ? metadata.selectedVariationIndex
      : undefined,
    errorMessage: typeof metadata.errorMessage === 'string'
      ? metadata.errorMessage
      : undefined,
    createdAt: variation.createdAt,
    updatedAt: variation.updatedAt,
    metrics: metadata.comparisonData ?? calculateVariationMetrics(results),
  };
}

export async function queueVariationGeneration(
  userId: string,
  originalPrompt: string,
  promptId: string | undefined,
  config: VariationConfig | string = 'quick'
): Promise<VariationComparison> {
  const modality = detectModality(originalPrompt);
  const variationConfig = resolveConfig(config, modality);
  const seedPromptId = await ensurePromptSeed(userId, originalPrompt, promptId, modality);

  const variation = await prisma.promptVariation.create({
    data: {
      promptId: seedPromptId,
      variantName: `variation-${Date.now()}`,
      variantPrompt: originalPrompt,
      status: VariationStatus.DRAFT,
      metadata: serializeVariationMetadata({
        originalPrompt,
        config: variationConfig,
        userId,
        modality,
        jobStatus: 'queued',
        queuedAt: new Date().toISOString(),
      }),
    },
    include: {
      results: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  scheduleVariationGeneration(variation.id, 'request');
  return buildVariationComparison(variation);
}

export async function resumePendingVariationGenerations(): Promise<void> {
  const pendingVariations = await prisma.promptVariation.findMany({
    where: {
      status: {
        in: [VariationStatus.DRAFT, VariationStatus.TESTING],
      },
    },
    select: {
      id: true,
      metadata: true,
      status: true,
    },
  });

  if (pendingVariations.length === 0) {
    return;
  }

  logger.info({ count: pendingVariations.length }, 'Resuming pending variation generations');

  for (const variation of pendingVariations) {
    const metadata = parseVariationMetadata(variation.metadata);
    const semanticStatus = semanticVariationStatus(variation.status, metadata);

    if (semanticStatus === 'completed' || semanticStatus === 'failed') {
      continue;
    }

    if (variation.status === VariationStatus.TESTING) {
      await prisma.promptVariation.update({
        where: { id: variation.id },
        data: {
          status: VariationStatus.DRAFT,
          metadata: mergeVariationMetadata(variation.metadata, {
            jobStatus: 'queued',
          }),
        },
      });
    }

    scheduleVariationGeneration(variation.id, 'startup-recovery');
  }
}

function calculateVariationMetrics(results: VariationResultData[]) {
  if (results.length === 0) {
    return {
      averageTokens: 0,
      tokenRange: { min: 0, max: 0 },
      lengthRange: { min: 0, max: 0 },
      diversityScore: 0,
    };
  }

  const tokens = results.map((result) => result.tokensUsed);
  const lengths = results.map((result) => result.enhancedPrompt.length);
  const wordSets = results.map((result) => new Set(result.enhancedPrompt.toLowerCase().split(/\s+/)));

  let diversityScore = 0;
  if (wordSets.length > 1) {
    let comparisons = 0;
    for (let i = 0; i < wordSets.length - 1; i += 1) {
      for (let j = i + 1; j < wordSets.length; j += 1) {
        const left = wordSets[i]!;
        const right = wordSets[j]!;
        const intersection = new Set([...left].filter((word) => right.has(word)));
        const union = new Set([...left, ...right]);
        diversityScore += 1 - intersection.size / union.size;
        comparisons += 1;
      }
    }
    diversityScore = comparisons > 0 ? diversityScore / comparisons : 0;
  }

  return {
    averageTokens: tokens.reduce((sum, value) => sum + value, 0) / tokens.length,
    tokenRange: { min: Math.min(...tokens), max: Math.max(...tokens) },
    lengthRange: { min: Math.min(...lengths), max: Math.max(...lengths) },
    diversityScore,
  };
}

function extractResultData(result: { metadata: unknown; rating: number | null }): VariationResultData {
  const metadata = (result.metadata ?? {}) as Record<string, unknown>;
  return {
    index: typeof metadata.index === 'number' ? metadata.index : 0,
    label: typeof metadata.label === 'string' ? metadata.label : 'Variation',
    mode: (metadata.mode as PromptMode | 'original') ?? 'standard',
    focus: typeof metadata.focus === 'string' ? metadata.focus : undefined,
    enhancedPrompt: typeof metadata.enhancedPrompt === 'string' ? metadata.enhancedPrompt : '',
    tokensUsed: typeof metadata.tokensUsed === 'number' ? metadata.tokensUsed : 0,
    score: typeof metadata.performanceScore === 'number'
      ? metadata.performanceScore
      : (result.rating ? result.rating / 5 : undefined),
  };
}

export async function getVariationComparison(
  variationId: string,
  userId?: string
): Promise<VariationComparison> {
  const variation = await prisma.promptVariation.findFirst({
    where: userId
      ? {
        id: variationId,
        prompt: { userId },
      }
      : {
        id: variationId,
      },
    include: {
      results: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!variation) {
    throw new Error('Variation not found');
  }

  return buildVariationComparison(variation);
}

export async function rateVariation(
  variationId: string,
  index: number,
  rating: number,
  userId?: string
): Promise<void> {
  const variation = await prisma.promptVariation.findFirst({
    where: userId
      ? {
        id: variationId,
        prompt: { userId },
      }
      : {
        id: variationId,
      },
    select: {
      id: true,
      metadata: true,
      results: true,
    },
  });

  if (!variation) {
    throw new Error('Variation not found');
  }

  const target = variation.results.find((result) => {
    const metadata = (result.metadata ?? {}) as Record<string, unknown>;
    return metadata.index === index;
  });

  if (target) {
    const metadata = (target.metadata ?? {}) as Record<string, unknown>;
    await prisma.variationResult.update({
      where: { id: target.id },
      data: {
        rating,
        metadata: {
          ...metadata,
          performanceScore: rating / 5,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const ratedResults = await prisma.variationResult.findMany({
    where: { variationId: variation.id, rating: { not: null } },
    orderBy: { rating: 'desc' },
  });

  if (ratedResults[0]) {
    const bestMetadata = (ratedResults[0].metadata ?? {}) as Record<string, unknown>;

    await prisma.promptVariation.update({
      where: { id: variation.id },
      data: {
        metadata: mergeVariationMetadata(variation.metadata, {
          selectedVariationIndex: typeof bestMetadata.index === 'number' ? bestMetadata.index : 0,
        }),
      },
    });
  }
}

export async function selectVariationWinner(
  variationId: string,
  winnerIndex: number,
  userId?: string
): Promise<void> {
  const variation = await prisma.promptVariation.findFirst({
    where: userId
      ? {
        id: variationId,
        prompt: { userId },
      }
      : {
        id: variationId,
      },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (!variation) {
    throw new Error('Variation not found');
  }

  await prisma.promptVariation.update({
    where: { id: variation.id },
    data: {
      status: VariationStatus.WINNER,
      metadata: mergeVariationMetadata(variation.metadata, {
        selectedVariationIndex: winnerIndex,
        jobStatus: 'completed',
      }),
    },
  });

  const results = await prisma.variationResult.findMany({
    where: { variationId: variation.id },
  });

  for (const result of results) {
    const metadata = (result.metadata ?? {}) as Record<string, unknown>;
    await prisma.variationResult.update({
      where: { id: result.id },
      data: {
        selected: metadata.index === winnerIndex,
        metadata: {
          ...metadata,
          ...(metadata.index === winnerIndex ? { performanceScore: 1 } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export async function getUserVariations(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{
  variations: VariationListItem[];
  total: number;
  hasMore: boolean;
}> {
  const [variations, total] = await Promise.all([
    prisma.promptVariation.findMany({
      where: {
        prompt: { userId },
      },
      include: {
        results: {
          orderBy: { createdAt: 'asc' },
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

  const normalizedVariations: VariationListItem[] = variations.map((variation) => {
    const metadata = (variation.metadata ?? {}) as Record<string, unknown>;

    return {
      id: variation.id,
      originalPrompt: typeof metadata.originalPrompt === 'string'
        ? metadata.originalPrompt
        : variation.variantPrompt,
      status: semanticVariationStatus(variation.status, parseVariationMetadata(variation.metadata)),
      selectedVariationIndex: typeof metadata.selectedVariationIndex === 'number'
        ? metadata.selectedVariationIndex
        : undefined,
      errorMessage: typeof metadata.errorMessage === 'string'
        ? metadata.errorMessage
        : undefined,
      createdAt: variation.createdAt,
      updatedAt: variation.updatedAt,
      results: variation.results.map((result) => extractResultData(result)),
    };
  });

  return {
    variations: normalizedVariations,
    total,
    hasMore: offset + limit < total,
  };
}

export async function autoSelectBestVariation(
  variationId: string,
  criteria: {
    preferShorter?: boolean;
    preferLowerTokens?: boolean;
    preferMode?: PromptMode;
    targetPlatform?: PlatformType;
  }
): Promise<number> {
  const comparison = await getVariationComparison(variationId);
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const lengthRange = comparison.metrics.lengthRange.max - comparison.metrics.lengthRange.min;
  const tokenRange = comparison.metrics.tokenRange.max - comparison.metrics.tokenRange.min;

  for (const result of comparison.results) {
    let score = 0;

    if (criteria.preferShorter && lengthRange > 0) {
      score += (comparison.metrics.lengthRange.max - result.enhancedPrompt.length) / lengthRange;
    }

    if (criteria.preferLowerTokens && tokenRange > 0) {
      score += (comparison.metrics.tokenRange.max - result.tokensUsed) / tokenRange;
    }

    if (criteria.preferMode && result.mode === criteria.preferMode) {
      score += 1.5;
    }

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
