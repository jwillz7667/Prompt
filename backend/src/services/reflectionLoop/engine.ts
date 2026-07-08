import type { z } from 'zod';

import {
  DEEPSEEK_THINKING_DISABLED,
  DEEPSEEK_THINKING_ENABLED,
  getDeepseekModel,
  type DeepSeekThinkingConfig,
} from '../deepseekModels.js';
import { promptLogger } from '../../utils/logger.js';
import {
  CANDIDATES_SYSTEM_PROMPT,
  CRITIC_SYSTEM_PROMPT,
  INTAKE_SYSTEM_PROMPT,
  PACKAGER_SYSTEM_PROMPT,
  RETRY_JSON_INSTRUCTION,
  REVISER_SYSTEM_PROMPT,
  RUBRIC_SYSTEM_PROMPT,
  buildCandidatesUserMessage,
  buildCriticUserMessage,
  buildIntakeUserMessage,
  buildPackagerUserMessage,
  buildReviserUserMessage,
  buildRubricUserMessage,
} from './prompts.js';
import {
  candidatesOutputSchema,
  critiqueSchema,
  intakeSchema,
  packageOutputSchema,
  revisionOutputSchema,
  rubricSchema,
  type Critique,
  type Intake,
  type PackageOutput,
  type Rubric,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Loop budget (spec §3)
// ---------------------------------------------------------------------------

/** 3 initial rollouts (original + 2 candidates) + up to 2 revision rounds. */
export const MAX_ROLLOUTS = 5;
/** Weighted rubric score (out of 5) at which the loop stops early. */
export const TARGET_SCORE = 4.5;
/** Minimum best-score improvement per revision round; below it, plateau → stop. */
export const MIN_GAIN = 0.25;

/**
 * Upper bound on concurrent upstream calls per optimization job. Rollouts
 * R0–R2 run in parallel, then critics C0–C2 in parallel (spec §1); the largest
 * batch is 3, so this bound never queues in practice — it exists to keep the
 * fan-out explicitly declared and safe if batch sizes ever grow.
 */
export const PARALLEL_LLM_CONCURRENCY = 3;

/** Two weighted totals within this distance count as a tie (scores carry 2 decimals). */
const SCORE_EPSILON = 1e-6;

/** Chars-per-token fallback used for the tie-break when usage is unreported. */
const FALLBACK_CHARS_PER_TOKEN = 4;

const ORIGINAL_CANDIDATE_ID = 'ORIGINAL';
const ORIGINAL_STRATEGY = 'original';
const REVISED_STRATEGY = 'revised';

// ---------------------------------------------------------------------------
// Stage configuration (spec §2 table)
// ---------------------------------------------------------------------------

export type ReflectionStage =
  | 'intake'
  | 'rubric'
  | 'candidates'
  | 'rollout'
  | 'critic'
  | 'reviser'
  | 'packager';

interface StageConfig {
  temperature: number;
  maxTokens: number;
  thinking: DeepSeekThinkingConfig;
}

// P3 rollouts are intentionally absent: their temperature comes from the
// intake's suggested_temp at runtime (maxTokens/thinking below).
const STAGE_CONFIGS: Record<Exclude<ReflectionStage, 'rollout'>, StageConfig> = {
  intake: { temperature: 0.1, maxTokens: 400, thinking: DEEPSEEK_THINKING_DISABLED },
  rubric: { temperature: 0.3, maxTokens: 700, thinking: DEEPSEEK_THINKING_DISABLED },
  candidates: { temperature: 0.8, maxTokens: 2200, thinking: DEEPSEEK_THINKING_DISABLED },
  critic: { temperature: 0.1, maxTokens: 1200, thinking: DEEPSEEK_THINKING_ENABLED },
  reviser: { temperature: 0.5, maxTokens: 1400, thinking: DEEPSEEK_THINKING_DISABLED },
  packager: { temperature: 0.3, maxTokens: 800, thinking: DEEPSEEK_THINKING_DISABLED },
};

const ROLLOUT_MAX_TOKENS = 900;

// ---------------------------------------------------------------------------
// Transport + fast-path dependencies (explicit injection, spec-friendly mocks)
// ---------------------------------------------------------------------------

export interface ReflectionLlmRequest {
  stage: ReflectionStage;
  model: string;
  /** null for P3 rollouts — the candidate runs as a plain user message. */
  systemPrompt: string | null;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  thinking: DeepSeekThinkingConfig;
}

export interface ReflectionLlmResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export type ReflectionLlmCall = (request: ReflectionLlmRequest) => Promise<ReflectionLlmResponse>;

export interface SinglePassInput {
  rawPrompt: string;
  userGoal?: string | undefined;
}

export interface SinglePassResult {
  enhancedPrompt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** One polish call — the free-tier path and the §3 degradation target. */
export type SinglePassFn = (input: SinglePassInput) => Promise<SinglePassResult>;

export type ReflectionProgressPhase =
  | 'classifying'
  | 'building_rubric'
  | 'generating_candidates'
  | 'testing_candidates'
  | 'reflecting'
  | 'revising'
  | 'packaging';

export interface ReflectionProgressEvent {
  phase: ReflectionProgressPhase;
  rolloutsUsed: number;
}

export interface ReflectionEngineDeps {
  llm: ReflectionLlmCall;
  singlePass: SinglePassFn;
  onProgress?: ((event: ReflectionProgressEvent) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Job + outcome types
// ---------------------------------------------------------------------------

export interface OptimizeJobInput {
  rawPrompt: string;
  userGoal?: string | undefined;
  /** User-provided values for {{variable}} slots; missing slots get placeholders. */
  variableValues?: Record<string, string> | undefined;
}

export interface ReflectionUsage {
  inputTokens: number;
  outputTokens: number;
  llmCalls: number;
}

export interface ScoredCandidate {
  id: string;
  strategy: string;
  promptText: string;
  variables: string[];
  rolloutOutput: string;
  /** Prompt tokens of the rollout request — the §3 tie-break metric. */
  promptTokens: number;
  critique: Critique;
  weightedScore: number;
}

export type ReflectionStopReason = 'target_reached' | 'plateau' | 'budget_exhausted';

export interface ReflectionRefusedOutcome {
  status: 'refused';
  category: string;
  message: string;
  usage: ReflectionUsage;
}

export interface ReflectionFastPathOutcome {
  status: 'fast_path';
  reason: 'already_strong' | 'stage_degraded';
  degradedStage?: ReflectionStage | undefined;
  enhancedPrompt: string;
  model: string;
  usage: ReflectionUsage;
}

export interface ReflectionOptimizedOutcome {
  status: 'optimized';
  winner: ScoredCandidate;
  original: ScoredCandidate;
  /** Honest receipts (spec §6): the original ran the identical rollout config and can win. */
  originalWon: boolean;
  package: PackageOutput;
  stopReason: ReflectionStopReason;
  rolloutsUsed: number;
  rubric: Rubric;
  intake: Intake;
  usage: ReflectionUsage;
}

export type ReflectionOutcome =
  | ReflectionRefusedOutcome
  | ReflectionFastPathOutcome
  | ReflectionOptimizedOutcome;

export interface ReflectionEngine {
  optimize: (job: OptimizeJobInput) => Promise<ReflectionOutcome>;
}

/**
 * Internal signal that a stage exhausted its retry (spec §3 degradation).
 * Never surfaced to callers — `optimize` converts it into the fast path.
 */
export class ReflectionStageError extends Error {
  readonly stage: ReflectionStage;

  constructor(stage: ReflectionStage, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ReflectionStageError';
    this.stage = stage;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VARIABLE_SLOT_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Fills {{variable}} slots with the user's values, or a readable placeholder
 * when none was provided (spec §4 P3: "realistic placeholders if empty").
 */
export function fillVariableSlots(
  promptText: string,
  values: Record<string, string> | undefined
): string {
  return promptText.replace(VARIABLE_SLOT_PATTERN, (_match, name: string) => {
    const provided = values?.[name];
    if (provided !== undefined && provided.trim() !== '') {
      return provided;
    }
    return `[example ${name.replace(/_/g, ' ')}]`;
  });
}

function estimatePromptTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN));
}

/**
 * Recomputes the weighted total from per-criterion scores so an arithmetic
 * slip by the critic cannot pick the wrong winner. Falls back to the critic's
 * reported value when the scores do not cover the rubric exactly once.
 */
export function computeWeightedTotal(critique: Critique, rubric: Rubric): number {
  if (critique.scores.length !== rubric.criteria.length) {
    return critique.weighted_total;
  }

  const weightByName = new Map(rubric.criteria.map((criterion) => [criterion.name, criterion.weight]));
  let total = 0;
  for (const entry of critique.scores) {
    const weight = weightByName.get(entry.criterion);
    if (weight === undefined) {
      return critique.weighted_total;
    }
    weightByName.delete(entry.criterion);
    total += entry.score * weight;
  }
  return Math.round(total * 100) / 100;
}

/** Winner selection (spec §3): max score; equal scores → fewer prompt tokens. */
export function selectTopCandidate(pool: readonly ScoredCandidate[]): ScoredCandidate {
  const first = pool[0];
  if (!first) {
    throw new Error('Reflection loop invariant violated: candidate pool is empty');
  }

  let best = first;
  for (const candidate of pool.slice(1)) {
    if (candidate.weightedScore > best.weightedScore + SCORE_EPSILON) {
      best = candidate;
      continue;
    }
    const isTie = Math.abs(candidate.weightedScore - best.weightedScore) <= SCORE_EPSILON;
    if (isTie && candidate.promptTokens < best.promptTokens) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Order-preserving bounded map. Workers pull the next index off a shared
 * cursor, so at most `limit` calls are in flight (CLAUDE.md backpressure rule:
 * fan-out declares its concurrency).
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        throw new Error('Reflection loop invariant violated: sparse work batch');
      }
      results[index] = await fn(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}

function requireAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error('Reflection loop invariant violated: missing batch result');
  }
  return item;
}

function buildRefusalMessage(category: string): string {
  const label = category.trim() || 'harmful';
  return (
    `This prompt appears to be aimed at ${label} content, which Promptomize cannot help optimize. ` +
    'Please rework the request to remove that goal and try again.'
  );
}

function extractJsonObject(content: string): unknown {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(unfenced);
  } catch {
    // Models occasionally wrap the object in prose despite instructions; take
    // the outermost brace span before declaring a parse failure.
  }

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError('no JSON object found in stage output');
  }
  return JSON.parse(unfenced.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface CandidateSpec {
  id: string;
  strategy: string;
  promptText: string;
  variables: string[];
}

interface RolloutResult {
  output: string;
  promptTokens: number;
}

export function createReflectionEngine(deps: ReflectionEngineDeps): ReflectionEngine {
  const emitProgress = (phase: ReflectionProgressPhase, rolloutsUsed: number): void => {
    if (!deps.onProgress) return;
    try {
      deps.onProgress({ phase, rolloutsUsed });
    } catch {
      // Progress reporting must never affect the optimization result.
    }
  };

  const trackUsage = async (
    usage: ReflectionUsage,
    request: ReflectionLlmRequest
  ): Promise<ReflectionLlmResponse> => {
    const response = await deps.llm(request);
    usage.llmCalls += 1;
    usage.inputTokens += response.inputTokens;
    usage.outputTokens += response.outputTokens;
    return response;
  };

  /**
   * One JSON stage with the §3 failure ladder: attempt → retry with
   * "Return ONLY the JSON object." appended → ReflectionStageError (which the
   * caller degrades to the fast path). Zod failures count as parse failures.
   */
  const callJsonStage = async <Schema extends z.ZodType<unknown>>(
    usage: ReflectionUsage,
    stage: Exclude<ReflectionStage, 'rollout'>,
    schema: Schema,
    systemPrompt: string,
    userMessage: string
  ): Promise<z.output<Schema>> => {
    const config = STAGE_CONFIGS[stage];
    let lastFailure = 'unknown failure';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const message = attempt === 0 ? userMessage : `${userMessage}\n\n${RETRY_JSON_INSTRUCTION}`;

      let content: string;
      try {
        const response = await trackUsage(usage, {
          stage,
          model: getDeepseekModel(),
          systemPrompt,
          userMessage: message,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          thinking: config.thinking,
        });
        content = response.content;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        promptLogger.warn({ stage, attempt, error: lastFailure }, 'Reflection stage call failed');
        continue;
      }

      let parsed: unknown;
      try {
        parsed = extractJsonObject(content);
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        promptLogger.warn({ stage, attempt, error: lastFailure }, 'Reflection stage returned unparseable JSON');
        continue;
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        lastFailure = validated.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        promptLogger.warn({ stage, attempt, error: lastFailure }, 'Reflection stage output failed schema validation');
        continue;
      }

      return validated.data;
    }

    throw new ReflectionStageError(stage, `${stage} stage failed after retry: ${lastFailure}`);
  };

  /**
   * P3 — execute a candidate prompt as a plain user message (no system
   * prompt), with the intake's suggested temperature. The original prompt runs
   * through this identical config so the comparison is fair (spec §6).
   */
  const runRollout = async (
    usage: ReflectionUsage,
    spec: CandidateSpec,
    intake: Intake,
    job: OptimizeJobInput
  ): Promise<RolloutResult> => {
    const filledPrompt = fillVariableSlots(spec.promptText, job.variableValues);
    let lastFailure = 'unknown failure';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await trackUsage(usage, {
          stage: 'rollout',
          model: getDeepseekModel(),
          systemPrompt: null,
          userMessage: filledPrompt,
          temperature: intake.suggested_temp,
          maxTokens: ROLLOUT_MAX_TOKENS,
          thinking: DEEPSEEK_THINKING_DISABLED,
        });
        if (response.content.trim() === '') {
          lastFailure = 'empty rollout output';
          promptLogger.warn({ stage: 'rollout', attempt, candidateId: spec.id }, 'Reflection rollout returned empty output');
          continue;
        }
        return {
          output: response.content,
          promptTokens:
            response.inputTokens > 0 ? response.inputTokens : estimatePromptTokens(filledPrompt),
        };
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        promptLogger.warn({ stage: 'rollout', attempt, candidateId: spec.id, error: lastFailure }, 'Reflection rollout call failed');
      }
    }

    throw new ReflectionStageError('rollout', `rollout stage failed after retry: ${lastFailure}`);
  };

  /** P4 — blind, pointwise critique of one rollout output. */
  const runCritic = async (
    usage: ReflectionUsage,
    spec: CandidateSpec,
    rollout: RolloutResult,
    rubric: Rubric,
    intake: Intake
  ): Promise<ScoredCandidate> => {
    const critique = await callJsonStage(
      usage,
      'critic',
      critiqueSchema,
      CRITIC_SYSTEM_PROMPT,
      buildCriticUserMessage({
        rubricJson: JSON.stringify(rubric),
        inferredGoal: intake.inferred_goal,
        promptUnderTest: spec.promptText,
        rolloutOutput: rollout.output,
      })
    );

    return {
      ...spec,
      rolloutOutput: rollout.output,
      promptTokens: rollout.promptTokens,
      critique,
      weightedScore: computeWeightedTotal(critique, rubric),
    };
  };

  /** Parallel rollouts, then parallel critics (spec §1), both bounded. */
  const rollAndCritique = async (
    usage: ReflectionUsage,
    specs: readonly CandidateSpec[],
    rubric: Rubric,
    intake: Intake,
    job: OptimizeJobInput,
    rolloutsUsedSoFar: number
  ): Promise<ScoredCandidate[]> => {
    emitProgress('testing_candidates', rolloutsUsedSoFar);
    const rollouts = await mapWithConcurrency(specs, PARALLEL_LLM_CONCURRENCY, (spec) =>
      runRollout(usage, spec, intake, job)
    );

    emitProgress('reflecting', rolloutsUsedSoFar + specs.length);
    return mapWithConcurrency(specs, PARALLEL_LLM_CONCURRENCY, (spec, index) =>
      runCritic(usage, spec, requireAt(rollouts, index), rubric, intake)
    );
  };

  /** P5 — revise the best candidate using the GEPA lesson pool. */
  const runReviser = async (
    usage: ReflectionUsage,
    best: ScoredCandidate,
    pool: readonly ScoredCandidate[],
    rubric: Rubric,
    revisionRound: number
  ): Promise<CandidateSpec> => {
    // Lesson pool = diagnoses from every candidate EXCEPT the best one (its
    // full critique travels separately as <best_critique>). Strategy and score
    // ride along so the reviser can steal what scored higher elsewhere.
    const lessonPool = pool
      .filter((candidate) => candidate !== best)
      .map((candidate) => ({
        candidate_id: candidate.id,
        strategy: candidate.strategy,
        weighted_total: candidate.weightedScore,
        diagnosis: candidate.critique.diagnosis,
      }));

    const revision = await callJsonStage(
      usage,
      'reviser',
      revisionOutputSchema,
      REVISER_SYSTEM_PROMPT,
      buildReviserUserMessage({
        bestPromptText: best.promptText,
        bestCritiqueJson: JSON.stringify(best.critique),
        lessonPoolJson: JSON.stringify(lessonPool),
        rubricJson: JSON.stringify(rubric),
      })
    );

    return {
      id: `R${revisionRound}`,
      strategy: REVISED_STRATEGY,
      promptText: revision.prompt_text,
      variables: revision.variables,
    };
  };

  const runFastPath = async (
    job: OptimizeJobInput,
    usage: ReflectionUsage,
    reason: ReflectionFastPathOutcome['reason'],
    degradedStage?: ReflectionStage
  ): Promise<ReflectionFastPathOutcome> => {
    const result = await deps.singlePass({ rawPrompt: job.rawPrompt, userGoal: job.userGoal });
    return {
      status: 'fast_path',
      reason,
      degradedStage,
      enhancedPrompt: result.enhancedPrompt,
      model: result.model,
      usage,
    };
  };

  const runLoop = async (
    job: OptimizeJobInput,
    usage: ReflectionUsage
  ): Promise<ReflectionOutcome> => {
    emitProgress('classifying', 0);
    const intake = await callJsonStage(
      usage,
      'intake',
      intakeSchema,
      INTAKE_SYSTEM_PROMPT,
      buildIntakeUserMessage({ rawPrompt: job.rawPrompt, userGoal: job.userGoal })
    );

    if (intake.safety.flag) {
      return {
        status: 'refused',
        category: intake.safety.category,
        message: buildRefusalMessage(intake.safety.category),
        usage,
      };
    }

    if (intake.already_strong) {
      return runFastPath(job, usage, 'already_strong');
    }

    emitProgress('building_rubric', 0);
    const rubric = await callJsonStage(
      usage,
      'rubric',
      rubricSchema,
      RUBRIC_SYSTEM_PROMPT,
      buildRubricUserMessage({
        taskType: intake.task_type,
        inferredGoal: intake.inferred_goal,
        rawPrompt: job.rawPrompt,
      })
    );

    emitProgress('generating_candidates', 0);
    const candidatesOutput = await callJsonStage(
      usage,
      'candidates',
      candidatesOutputSchema,
      CANDIDATES_SYSTEM_PROMPT,
      buildCandidatesUserMessage({
        taskType: intake.task_type,
        targetModelFamily: intake.target_model_family,
        inferredGoal: intake.inferred_goal,
        missingIngredients: intake.missing_ingredients,
        language: intake.language,
        rawPrompt: job.rawPrompt,
      })
    );

    const initialSpecs: CandidateSpec[] = [
      {
        id: ORIGINAL_CANDIDATE_ID,
        strategy: ORIGINAL_STRATEGY,
        promptText: job.rawPrompt,
        variables: [],
      },
      ...candidatesOutput.candidates.map((candidate) => ({
        id: candidate.id,
        strategy: candidate.strategy,
        promptText: candidate.prompt_text,
        variables: candidate.variables,
      })),
    ];

    let pool = await rollAndCritique(usage, initialSpecs, rubric, intake, job, 0);
    const original = requireAt(pool, 0);
    let rolloutsUsed = pool.length;
    let best = selectTopCandidate(pool);
    let previousBestScore = best.weightedScore;
    let plateaued = false;
    let revisionRound = 0;

    while (rolloutsUsed < MAX_ROLLOUTS && best.weightedScore < TARGET_SCORE) {
      revisionRound += 1;
      emitProgress('revising', rolloutsUsed);
      const revisedSpec = await runReviser(usage, best, pool, rubric, revisionRound);

      const revisedScored = requireAt(
        await rollAndCritique(usage, [revisedSpec], rubric, intake, job, rolloutsUsed),
        0
      );
      rolloutsUsed += 1;
      pool = [...pool, revisedScored];
      best = selectTopCandidate(pool);

      if (best.weightedScore - previousBestScore < MIN_GAIN) {
        plateaued = true;
        break;
      }
      previousBestScore = best.weightedScore;
    }

    const stopReason: ReflectionStopReason =
      best.weightedScore >= TARGET_SCORE
        ? 'target_reached'
        : plateaued
          ? 'plateau'
          : 'budget_exhausted';

    emitProgress('packaging', rolloutsUsed);
    const packaged = await callJsonStage(
      usage,
      'packager',
      packageOutputSchema,
      PACKAGER_SYSTEM_PROMPT,
      buildPackagerUserMessage({
        originalWeightedTotal: original.weightedScore,
        winnerWeightedTotal: best.weightedScore,
        winnerPromptText: best.promptText,
        winnerScoresJson: JSON.stringify(best.critique.scores),
        originalScoresJson: JSON.stringify(original.critique.scores),
      })
    );

    return {
      status: 'optimized',
      winner: best,
      original,
      originalWon: best.id === ORIGINAL_CANDIDATE_ID,
      package: packaged,
      stopReason,
      rolloutsUsed,
      rubric,
      intake,
      usage,
    };
  };

  const optimize = async (job: OptimizeJobInput): Promise<ReflectionOutcome> => {
    const usage: ReflectionUsage = { inputTokens: 0, outputTokens: 0, llmCalls: 0 };
    try {
      return await runLoop(job, usage);
    } catch (error) {
      if (error instanceof ReflectionStageError) {
        // §3 failure degradation: the user always gets *something* — a raw
        // error never escapes for a stage that merely mis-formatted JSON.
        promptLogger.warn(
          { stage: error.stage, err: error },
          'Reflection loop degraded to single-pass fast path'
        );
        return runFastPath(job, usage, 'stage_degraded', error.stage);
      }
      throw error;
    }
  };

  return { optimize };
}
