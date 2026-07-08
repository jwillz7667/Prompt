/**
 * Reflection-loop pipeline (mini-GEPA optimization on DeepSeek V4 Flash).
 *
 * Public surface for the feature: consumers (routes, queue workers) import
 * from this barrel only. See docs/plans/promptomize-reflection-loop-spec.md.
 */

export {
  MAX_ROLLOUTS,
  MIN_GAIN,
  PARALLEL_LLM_CONCURRENCY,
  TARGET_SCORE,
  ReflectionStageError,
  computeWeightedTotal,
  createReflectionEngine,
  fillVariableSlots,
  resolveTargetModelFamily,
  selectTopCandidate,
  type OptimizeJobInput,
  type ReflectionEngine,
  type ReflectionEngineDeps,
  type ReflectionFastPathOutcome,
  type ReflectionLlmCall,
  type ReflectionLlmRequest,
  type ReflectionLlmResponse,
  type ReflectionOptimizedOutcome,
  type ReflectionOutcome,
  type ReflectionProgressEvent,
  type ReflectionProgressPhase,
  type ReflectionRefusedOutcome,
  type ReflectionStage,
  type ReflectionStopReason,
  type ReflectionUsage,
  type ScoredCandidate,
  type SinglePassFn,
  type SinglePassInput,
  type SinglePassResult,
} from './engine.js';

export {
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
  stripClosingTag,
} from './prompts.js';

export {
  CANDIDATE_IDS,
  MISSING_INGREDIENTS,
  RUBRIC_CRITERIA_COUNT,
  RUBRIC_WEIGHT_SUM_TOLERANCE,
  TARGET_MODEL_FAMILIES,
  TASK_TYPES,
  candidateOutSchema,
  candidatesOutputSchema,
  critiqueSchema,
  intakeSchema,
  packageOutputSchema,
  revisionOutputSchema,
  rubricCriterionSchema,
  rubricSchema,
  type CandidateOut,
  type CandidatesOutput,
  type Critique,
  type CritiqueScore,
  type Intake,
  type PackageOutput,
  type RevisionOutput,
  type Rubric,
  type RubricCriterion,
  type TargetModelFamily,
} from './schemas.js';

export {
  createDeepseekReflectionLlmCall,
  createDeepseekSinglePass,
  createProductionReflectionEngine,
  type ProductionReflectionEngineOptions,
  type SinglePassOptions,
} from './transport.js';
