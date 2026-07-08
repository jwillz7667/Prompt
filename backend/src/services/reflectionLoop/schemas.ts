import { z } from 'zod';

/**
 * Stage-output schemas (spec §5). Every JSON stage is validated with zod and
 * a schema failure counts as a parse failure, feeding the §3 degradation path
 * (one retry, then single-pass fast path).
 */

export const TASK_TYPES = [
  'creative',
  'analytical',
  'coding',
  'extraction',
  'conversation',
  'image_gen',
  'agent_instructions',
] as const;

export const TARGET_MODEL_FAMILIES = [
  'claude',
  'gpt',
  'gemini',
  'deepseek',
  'reasoning_model',
  'unknown',
] as const;

export type TargetModelFamily = (typeof TARGET_MODEL_FAMILIES)[number];

export const MISSING_INGREDIENTS = [
  'context_facts',
  'examples',
  'output_format',
  'constraints',
  'audience',
  'success_criteria',
] as const;

export const intakeSchema = z.object({
  task_type: z.enum(TASK_TYPES),
  target_model_family: z.enum(TARGET_MODEL_FAMILIES),
  inferred_goal: z.string().min(1),
  language: z.string().min(1),
  missing_ingredients: z.array(z.enum(MISSING_INGREDIENTS)),
  already_strong: z.boolean(),
  suggested_temp: z.number().min(0).max(1),
  safety: z.object({
    flag: z.boolean(),
    category: z.string(),
  }),
});

export type Intake = z.infer<typeof intakeSchema>;

export const RUBRIC_CRITERIA_COUNT = 5;

// The model is told the five weights sum to exactly 1.0; the tolerance only
// absorbs JSON float representation and small model rounding (e.g. 0.99/1.01),
// not genuinely broken rubrics.
export const RUBRIC_WEIGHT_SUM_TOLERANCE = 0.02;

export const rubricCriterionSchema = z.object({
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
  description: z.string().min(1),
  anchor_1: z.string().min(1),
  anchor_3: z.string().min(1),
  anchor_5: z.string().min(1),
});

export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export const rubricSchema = z
  .object({
    criteria: z.array(rubricCriterionSchema).length(RUBRIC_CRITERIA_COUNT),
  })
  .superRefine((rubric, ctx) => {
    const weightSum = rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    if (Math.abs(weightSum - 1) > RUBRIC_WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['criteria'],
        message: `criterion weights sum to ${weightSum.toFixed(4)}, expected ~1.0`,
      });
    }
  });

export type Rubric = z.infer<typeof rubricSchema>;

export const CANDIDATE_IDS = ['A', 'B', 'C', 'D', 'E'] as const;

export const candidateOutSchema = z.object({
  id: z.enum(CANDIDATE_IDS),
  strategy: z.string().min(1),
  prompt_text: z.string().min(1),
  rationale: z.string(),
  variables: z.array(z.string()),
});

export type CandidateOut = z.infer<typeof candidateOutSchema>;

// P2 returns exactly 2 candidates built with two DIFFERENT strategies, so the
// ids must differ too (spec §4: "{ ...second candidate, different strategy... }").
export const candidatesOutputSchema = z
  .object({
    candidates: z.array(candidateOutSchema).length(2),
  })
  .superRefine((output, ctx) => {
    const [first, second] = output.candidates;
    if (first && second && first.id === second.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidates'],
        message: 'both candidates use the same strategy id',
      });
    }
  });

export type CandidatesOutput = z.infer<typeof candidatesOutputSchema>;

export const critiqueScoreSchema = z.object({
  criterion: z.string().min(1),
  score: z.number().int().min(1).max(5),
  evidence: z.string(),
});

export type CritiqueScore = z.infer<typeof critiqueScoreSchema>;

export const critiqueSchema = z.object({
  scores: z.array(critiqueScoreSchema).min(1),
  // Upper bound leaves headroom for the rubric weight-sum tolerance and model
  // rounding; the engine recomputes the authoritative weighted total from the
  // per-criterion scores whenever they cover the rubric exactly.
  weighted_total: z.number().min(0).max(5.5),
  diagnosis: z.array(z.string()).min(1),
  prescriptions: z.array(z.string()),
});

export type Critique = z.infer<typeof critiqueSchema>;

export const revisionOutputSchema = z.object({
  prompt_text: z.string().min(1),
  change_log: z.array(z.string()),
  variables: z.array(z.string()),
});

export type RevisionOutput = z.infer<typeof revisionOutputSchema>;

export const packageOutputSchema = z.object({
  title: z.string().min(1),
  summary_bullets: z.array(z.string()).min(1),
  template_text: z.string().min(1),
  variables: z.array(z.string()),
});

export type PackageOutput = z.infer<typeof packageOutputSchema>;
