import { describe, expect, it } from 'vitest';

import {
  candidatesOutputSchema,
  critiqueSchema,
  intakeSchema,
  packageOutputSchema,
  revisionOutputSchema,
  rubricSchema,
} from '../../src/services/reflectionLoop/schemas.js';

function validIntake(): Record<string, unknown> {
  return {
    task_type: 'coding',
    target_model_family: 'claude',
    inferred_goal: 'Produce a correct bug fix.',
    language: 'en',
    missing_ingredients: ['context_facts', 'examples'],
    already_strong: false,
    suggested_temp: 0.2,
    safety: { flag: false, category: '' },
  };
}

function criterion(name: string, weight: number): Record<string, unknown> {
  return {
    name,
    weight,
    description: `Measures ${name}.`,
    anchor_1: 'Bad.',
    anchor_3: 'Okay.',
    anchor_5: 'Great.',
  };
}

function validRubric(weights: number[] = [0.3, 0.25, 0.2, 0.15, 0.1]): Record<string, unknown> {
  return {
    criteria: weights.map((weight, index) => criterion(`criterion_${index}`, weight)),
  };
}

function validCritique(): Record<string, unknown> {
  return {
    scores: [
      { criterion: 'clarity', score: 4, evidence: 'Uses concrete sections.' },
      { criterion: 'token_efficiency', score: 5, evidence: 'No filler.' },
    ],
    weighted_total: 4.2,
    diagnosis: ['Lacks an explicit output format.'],
    prescriptions: ['Add a format section.'],
  };
}

describe('intakeSchema', () => {
  it('accepts a valid intake', () => {
    expect(intakeSchema.safeParse(validIntake()).success).toBe(true);
  });

  it('rejects an unknown task_type', () => {
    expect(intakeSchema.safeParse({ ...validIntake(), task_type: 'poetry' }).success).toBe(false);
  });

  it('rejects a suggested_temp outside 0..1', () => {
    expect(intakeSchema.safeParse({ ...validIntake(), suggested_temp: 1.5 }).success).toBe(false);
  });

  it('rejects a missing safety object', () => {
    const intake = validIntake();
    delete intake['safety'];
    expect(intakeSchema.safeParse(intake).success).toBe(false);
  });

  it('rejects an unknown missing_ingredient', () => {
    expect(
      intakeSchema.safeParse({ ...validIntake(), missing_ingredients: ['vibes'] }).success
    ).toBe(false);
  });
});

describe('rubricSchema', () => {
  it('accepts exactly 5 criteria with weights summing to 1.0', () => {
    expect(rubricSchema.safeParse(validRubric()).success).toBe(true);
  });

  it('rejects 4 criteria', () => {
    expect(rubricSchema.safeParse(validRubric([0.4, 0.3, 0.2, 0.1])).success).toBe(false);
  });

  it('rejects 6 criteria', () => {
    expect(
      rubricSchema.safeParse(validRubric([0.2, 0.2, 0.2, 0.15, 0.15, 0.1])).success
    ).toBe(false);
  });

  it('rejects weights summing far from 1.0', () => {
    expect(rubricSchema.safeParse(validRubric([0.3, 0.2, 0.2, 0.1, 0.1])).success).toBe(false); // 0.9
    expect(rubricSchema.safeParse(validRubric([0.35, 0.25, 0.2, 0.15, 0.1])).success).toBe(false); // 1.05
  });

  it('tolerates tiny rounding drift in the weight sum', () => {
    expect(rubricSchema.safeParse(validRubric([0.31, 0.25, 0.2, 0.15, 0.1])).success).toBe(true); // 1.01
    expect(rubricSchema.safeParse(validRubric([0.29, 0.25, 0.2, 0.15, 0.1])).success).toBe(true); // 0.99
  });
});

describe('candidatesOutputSchema', () => {
  const candidate = (id: string): Record<string, unknown> => ({
    id,
    strategy: 'structure_contract',
    prompt_text: 'rewritten prompt',
    rationale: 'fits the task',
    variables: ['topic'],
  });

  it('accepts exactly two candidates with distinct ids', () => {
    expect(
      candidatesOutputSchema.safeParse({ candidates: [candidate('A'), candidate('C')] }).success
    ).toBe(true);
  });

  it('rejects one candidate', () => {
    expect(candidatesOutputSchema.safeParse({ candidates: [candidate('A')] }).success).toBe(false);
  });

  it('rejects three candidates', () => {
    expect(
      candidatesOutputSchema.safeParse({
        candidates: [candidate('A'), candidate('B'), candidate('C')],
      }).success
    ).toBe(false);
  });

  it('rejects duplicate strategy ids', () => {
    expect(
      candidatesOutputSchema.safeParse({ candidates: [candidate('A'), candidate('A')] }).success
    ).toBe(false);
  });

  it('rejects an id outside A-E', () => {
    expect(
      candidatesOutputSchema.safeParse({ candidates: [candidate('A'), candidate('F')] }).success
    ).toBe(false);
  });
});

describe('critiqueSchema', () => {
  it('accepts a valid critique', () => {
    expect(critiqueSchema.safeParse(validCritique()).success).toBe(true);
  });

  it('rejects out-of-range scores', () => {
    const low = validCritique();
    low['scores'] = [{ criterion: 'clarity', score: 0, evidence: 'e' }];
    expect(critiqueSchema.safeParse(low).success).toBe(false);

    const high = validCritique();
    high['scores'] = [{ criterion: 'clarity', score: 6, evidence: 'e' }];
    expect(critiqueSchema.safeParse(high).success).toBe(false);
  });

  it('rejects non-integer scores', () => {
    const fractional = validCritique();
    fractional['scores'] = [{ criterion: 'clarity', score: 4.5, evidence: 'e' }];
    expect(critiqueSchema.safeParse(fractional).success).toBe(false);
  });

  it('rejects an empty diagnosis but allows empty prescriptions', () => {
    expect(critiqueSchema.safeParse({ ...validCritique(), diagnosis: [] }).success).toBe(false);
    expect(critiqueSchema.safeParse({ ...validCritique(), prescriptions: [] }).success).toBe(true);
  });

  it('rejects an impossible weighted_total', () => {
    expect(critiqueSchema.safeParse({ ...validCritique(), weighted_total: 7 }).success).toBe(false);
    expect(critiqueSchema.safeParse({ ...validCritique(), weighted_total: -1 }).success).toBe(false);
  });
});

describe('revisionOutputSchema', () => {
  it('accepts a valid revision', () => {
    expect(
      revisionOutputSchema.safeParse({
        prompt_text: 'better prompt',
        change_log: ['added format section'],
        variables: [],
      }).success
    ).toBe(true);
  });

  it('rejects an empty prompt_text', () => {
    expect(
      revisionOutputSchema.safeParse({ prompt_text: '', change_log: [], variables: [] }).success
    ).toBe(false);
  });
});

describe('packageOutputSchema', () => {
  it('accepts a valid package', () => {
    expect(
      packageOutputSchema.safeParse({
        title: 'Bug fix brief',
        summary_bullets: ['Added constraints.', 'Overall 3.1 → 4.6'],
        template_text: 'final prompt with {{topic}}',
        variables: ['topic'],
      }).success
    ).toBe(true);
  });

  it('rejects empty summary bullets', () => {
    expect(
      packageOutputSchema.safeParse({
        title: 'Bug fix brief',
        summary_bullets: [],
        template_text: 'final prompt',
        variables: [],
      }).success
    ).toBe(false);
  });
});
