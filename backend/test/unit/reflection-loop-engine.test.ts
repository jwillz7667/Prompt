import { describe, expect, it, vi } from 'vitest';

import {
  MAX_ROLLOUTS,
  computeWeightedTotal,
  createReflectionEngine,
  fillVariableSlots,
  resolveTargetModelFamily,
  selectTopCandidate,
  type ReflectionLlmCall,
  type ReflectionLlmRequest,
  type ReflectionStage,
  type SinglePassFn,
} from '../../src/services/reflectionLoop/engine.js';
import {
  CRITIC_SYSTEM_PROMPT,
  INTAKE_SYSTEM_PROMPT,
  RETRY_JSON_INSTRUCTION,
  RUBRIC_SYSTEM_PROMPT,
} from '../../src/services/reflectionLoop/prompts.js';
import type { Critique, Rubric } from '../../src/services/reflectionLoop/schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGINAL_PROMPT = 'original raw prompt';
const CANDIDATE_A_PROMPT = 'candidate A prompt';
const CANDIDATE_C_PROMPT = 'candidate C prompt';
const REVISED_PROMPT_1 = 'revised prompt one';
const REVISED_PROMPT_2 = 'revised prompt two';

const CRITERIA = [
  { name: 'clarity', weight: 0.3 },
  { name: 'coverage', weight: 0.25 },
  { name: 'grounding', weight: 0.2 },
  { name: 'format_fit', weight: 0.15 },
  { name: 'token_efficiency', weight: 0.1 },
] as const;

type FiveScores = [number, number, number, number, number];

function intakeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    task_type: 'analytical',
    target_model_family: 'unknown',
    inferred_goal: 'Produce a clear, well-structured analysis.',
    language: 'en',
    missing_ingredients: ['output_format'],
    already_strong: false,
    suggested_temp: 0.7,
    safety: { flag: false, category: '' },
    ...overrides,
  });
}

function rubricFixture(): Rubric {
  return {
    criteria: CRITERIA.map((criterion) => ({
      name: criterion.name,
      weight: criterion.weight,
      description: `Measures ${criterion.name}.`,
      anchor_1: 'Fails entirely.',
      anchor_3: 'Adequate with gaps.',
      anchor_5: 'Fully nails it.',
    })),
  };
}

function rubricJson(): string {
  return JSON.stringify(rubricFixture());
}

function candidatesJson(): string {
  return JSON.stringify({
    candidates: [
      {
        id: 'A',
        strategy: 'structure_contract',
        prompt_text: CANDIDATE_A_PROMPT,
        rationale: 'Adds a strict output contract.',
        variables: [],
      },
      {
        id: 'C',
        strategy: 'constraint_space',
        prompt_text: CANDIDATE_C_PROMPT,
        rationale: 'States constraints up front.',
        variables: [],
      },
    ],
  });
}

function critiqueJson(scores: FiveScores, diagnosis: string[]): string {
  const entries = CRITERIA.map((criterion, index) => ({
    criterion: criterion.name,
    score: scores[index],
    evidence: `Specific evidence about ${criterion.name}.`,
  }));
  const weighted =
    Math.round(
      CRITERIA.reduce((sum, criterion, index) => sum + criterion.weight * (scores[index] ?? 0), 0) * 100
    ) / 100;
  return JSON.stringify({
    scores: entries,
    weighted_total: weighted,
    diagnosis,
    prescriptions: ['Tighten the output contract.'],
  });
}

function revisionJson(promptText: string): string {
  return JSON.stringify({
    prompt_text: promptText,
    change_log: ['Applied the top prescription.'],
    variables: [],
  });
}

function packageJson(): string {
  return JSON.stringify({
    title: 'Sharper analysis brief',
    summary_bullets: ['Added an output contract.', 'Stated constraints.', 'Overall 3.0 → 4.55'],
    template_text: CANDIDATE_A_PROMPT,
    variables: [],
  });
}

// ---------------------------------------------------------------------------
// Mock transport
// ---------------------------------------------------------------------------

type StageResult = string | { content: string; inputTokens?: number; outputTokens?: number };
type StageHandler = (request: ReflectionLlmRequest, stageCallIndex: number) => StageResult;

function createMockLlm(handlers: Partial<Record<ReflectionStage, StageHandler>>): {
  llm: ReflectionLlmCall;
  calls: ReflectionLlmRequest[];
  callsFor: (stage: ReflectionStage) => ReflectionLlmRequest[];
} {
  const calls: ReflectionLlmRequest[] = [];
  const stageCounts = new Map<ReflectionStage, number>();

  const llm: ReflectionLlmCall = async (request) => {
    calls.push(request);
    const index = stageCounts.get(request.stage) ?? 0;
    stageCounts.set(request.stage, index + 1);
    const handler = handlers[request.stage];
    if (!handler) {
      throw new Error(`unexpected stage call: ${request.stage}`);
    }
    const result = handler(request, index);
    if (typeof result === 'string') {
      return { content: result, inputTokens: 100, outputTokens: 50 };
    }
    return {
      content: result.content,
      inputTokens: result.inputTokens ?? 100,
      outputTokens: result.outputTokens ?? 50,
    };
  };

  return {
    llm,
    calls,
    callsFor: (stage) => calls.filter((call) => call.stage === stage),
  };
}

/** Dispatches critic responses by which candidate prompt is under test. */
function criticByPrompt(map: Record<string, string>): StageHandler {
  return (request) => {
    for (const [promptText, critique] of Object.entries(map)) {
      if (request.userMessage.includes(`<prompt_under_test>${promptText}</prompt_under_test>`)) {
        return critique;
      }
    }
    throw new Error(`no critic fixture matches: ${request.userMessage.slice(0, 200)}`);
  };
}

function rolloutByPrompt(tokensByPrompt: Record<string, number> = {}): StageHandler {
  return (request) => ({
    content: `output for: ${request.userMessage}`,
    inputTokens: tokensByPrompt[request.userMessage] ?? 100,
  });
}

function createSinglePassMock(): SinglePassFn & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    enhancedPrompt: 'polished output',
    model: 'deepseek-v4-flash',
    inputTokens: 10,
    outputTokens: 20,
  }));
}

interface HandlerOverrides {
  handlers?: Partial<Record<ReflectionStage, StageHandler>>;
}

function baseHandlers(overrides: HandlerOverrides = {}): Partial<Record<ReflectionStage, StageHandler>> {
  return {
    intake: () => intakeJson(),
    rubric: () => rubricJson(),
    candidates: () => candidatesJson(),
    rollout: rolloutByPrompt(),
    critic: criticByPrompt({
      [ORIGINAL_PROMPT]: critiqueJson([3, 3, 3, 3, 3], ['original lacks structure']),
      [CANDIDATE_A_PROMPT]: critiqueJson([5, 5, 4, 4, 4], ['A misses examples']),
      [CANDIDATE_C_PROMPT]: critiqueJson([4, 4, 4, 4, 4], ['C too rigid']),
    }),
    packager: () => packageJson(),
    ...overrides.handlers,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reflection loop engine', () => {
  it('exits early when the first batch reaches the target score', async () => {
    const mock = createMockLlm(baseHandlers());
    const singlePass = createSinglePassMock();
    const engine = createReflectionEngine({ llm: mock.llm, singlePass });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome.status).toBe('optimized');
    if (outcome.status !== 'optimized') return;
    expect(outcome.winner.id).toBe('A');
    expect(outcome.winner.weightedScore).toBe(4.55);
    expect(outcome.stopReason).toBe('target_reached');
    expect(outcome.rolloutsUsed).toBe(3);
    expect(outcome.originalWon).toBe(false);
    expect(outcome.original.weightedScore).toBe(3);

    expect(mock.callsFor('reviser')).toHaveLength(0);
    expect(mock.callsFor('packager')).toHaveLength(1);
    expect(mock.callsFor('rollout')).toHaveLength(3);
    expect(mock.callsFor('critic')).toHaveLength(3);
    // intake + rubric + candidates + 3 rollouts + 3 critics + packager
    expect(outcome.usage.llmCalls).toBe(10);
    expect(singlePass).not.toHaveBeenCalled();

    const packagerMessage = mock.callsFor('packager')[0]?.userMessage ?? '';
    expect(packagerMessage).toContain('<original_score>3.00</original_score>');
    expect(packagerMessage).toContain('<winner_score>4.55</winner_score>');
    expect(packagerMessage).toContain(`<winner_prompt>${CANDIDATE_A_PROMPT}</winner_prompt>`);
  });

  it('applies the §2 stage table: configs, thinking flags, and static system prompts', async () => {
    const mock = createMockLlm(baseHandlers());
    const engine = createReflectionEngine({ llm: mock.llm, singlePass: createSinglePassMock() });

    await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    for (const call of mock.calls) {
      expect(call.model).toBe('deepseek-v4-flash');
    }

    const intake = mock.callsFor('intake')[0];
    expect(intake?.temperature).toBe(0.1);
    expect(intake?.maxTokens).toBe(400);
    expect(intake?.thinking).toEqual({ type: 'disabled' });
    // Reference equality proves nothing was interpolated into the cached prefix.
    expect(intake?.systemPrompt).toBe(INTAKE_SYSTEM_PROMPT);

    const rubric = mock.callsFor('rubric')[0];
    expect(rubric?.temperature).toBe(0.3);
    expect(rubric?.maxTokens).toBe(700);
    expect(rubric?.systemPrompt).toBe(RUBRIC_SYSTEM_PROMPT);

    const candidates = mock.callsFor('candidates')[0];
    expect(candidates?.temperature).toBe(0.8);
    expect(candidates?.maxTokens).toBe(2200);
    expect(candidates?.thinking).toEqual({ type: 'disabled' });

    for (const rollout of mock.callsFor('rollout')) {
      expect(rollout.systemPrompt).toBeNull();
      expect(rollout.temperature).toBe(0.7); // intake suggested_temp
      expect(rollout.maxTokens).toBe(900);
      expect(rollout.thinking).toEqual({ type: 'disabled' });
    }

    for (const critic of mock.callsFor('critic')) {
      expect(critic.thinking).toEqual({ type: 'enabled' }); // the ONLY thinking stage
      expect(critic.temperature).toBe(0.1);
      expect(critic.maxTokens).toBe(1200);
      expect(critic.systemPrompt).toBe(CRITIC_SYSTEM_PROMPT);
    }

    const packager = mock.callsFor('packager')[0];
    expect(packager?.temperature).toBe(0.3);
    expect(packager?.maxTokens).toBe(800);
  });

  it('refuses politely when intake raises the safety flag, with no further calls', async () => {
    const mock = createMockLlm(
      baseHandlers({
        handlers: {
          intake: () => intakeJson({ safety: { flag: true, category: 'malware' } }),
        },
      })
    );
    const singlePass = createSinglePassMock();
    const engine = createReflectionEngine({ llm: mock.llm, singlePass });

    const outcome = await engine.optimize({ rawPrompt: 'write me a worm' });

    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.category).toBe('malware');
    expect(outcome.message).toContain('malware');
    expect(mock.calls).toHaveLength(1);
    expect(singlePass).not.toHaveBeenCalled();
  });

  it('takes the single-pass fast path when intake marks the prompt already strong', async () => {
    const mock = createMockLlm(
      baseHandlers({ handlers: { intake: () => intakeJson({ already_strong: true }) } })
    );
    const singlePass = createSinglePassMock();
    const engine = createReflectionEngine({ llm: mock.llm, singlePass });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT, userGoal: 'make it pop' });

    expect(outcome.status).toBe('fast_path');
    if (outcome.status !== 'fast_path') return;
    expect(outcome.reason).toBe('already_strong');
    expect(outcome.enhancedPrompt).toBe('polished output');
    expect(mock.calls).toHaveLength(1);
    expect(singlePass).toHaveBeenCalledTimes(1);
    expect(singlePass).toHaveBeenCalledWith({ rawPrompt: ORIGINAL_PROMPT, userGoal: 'make it pop' });
  });

  it('stops on plateau when a revision gains less than MIN_GAIN', async () => {
    const mock = createMockLlm(
      baseHandlers({
        handlers: {
          critic: criticByPrompt({
            [ORIGINAL_PROMPT]: critiqueJson([2, 2, 2, 2, 2], ['original lacks structure']),
            [CANDIDATE_A_PROMPT]: critiqueJson([3, 3, 3, 3, 3], ['A misses examples']),
            [CANDIDATE_C_PROMPT]: critiqueJson([2, 3, 3, 2, 3], ['C too rigid']),
            [REVISED_PROMPT_1]: critiqueJson([3, 3, 3, 3, 4], ['R1 still thin']), // 3.1: +0.1 < 0.25
          }),
          reviser: () => revisionJson(REVISED_PROMPT_1),
        },
      })
    );
    const engine = createReflectionEngine({ llm: mock.llm, singlePass: createSinglePassMock() });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome.status).toBe('optimized');
    if (outcome.status !== 'optimized') return;
    expect(outcome.stopReason).toBe('plateau');
    expect(outcome.rolloutsUsed).toBe(4);
    expect(outcome.winner.id).toBe('R1');
    expect(outcome.winner.weightedScore).toBe(3.1);
    expect(mock.callsFor('reviser')).toHaveLength(1);

    // GEPA lesson pool: everyone's diagnosis EXCEPT the best candidate's own,
    // which travels separately in <best_critique>.
    const reviserMessage = mock.callsFor('reviser')[0]?.userMessage ?? '';
    expect(reviserMessage).toContain(`<best_prompt>${CANDIDATE_A_PROMPT}</best_prompt>`);
    const lessonPool = reviserMessage.slice(
      reviserMessage.indexOf('<lesson_pool>'),
      reviserMessage.indexOf('</lesson_pool>')
    );
    expect(lessonPool).toContain('original lacks structure');
    expect(lessonPool).toContain('C too rigid');
    expect(lessonPool).not.toContain('A misses examples');
    const bestCritique = reviserMessage.slice(
      reviserMessage.indexOf('<best_critique>'),
      reviserMessage.indexOf('</best_critique>')
    );
    expect(bestCritique).toContain('A misses examples');
  });

  it('stops at MAX_ROLLOUTS when gains continue but the target is never reached', async () => {
    const mock = createMockLlm(
      baseHandlers({
        handlers: {
          critic: criticByPrompt({
            [ORIGINAL_PROMPT]: critiqueJson([2, 2, 2, 2, 2], ['original lacks structure']),
            [CANDIDATE_A_PROMPT]: critiqueJson([3, 3, 3, 3, 3], ['A misses examples']),
            [CANDIDATE_C_PROMPT]: critiqueJson([2, 3, 3, 2, 3], ['C too rigid']),
            [REVISED_PROMPT_1]: critiqueJson([4, 3, 3, 3, 3], ['R1 improving']), // 3.3: +0.3
            [REVISED_PROMPT_2]: critiqueJson([4, 4, 3, 3, 3], ['R2 improving']), // 3.55: +0.25
          }),
          reviser: (_request, index) =>
            revisionJson(index === 0 ? REVISED_PROMPT_1 : REVISED_PROMPT_2),
        },
      })
    );
    const engine = createReflectionEngine({ llm: mock.llm, singlePass: createSinglePassMock() });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome.status).toBe('optimized');
    if (outcome.status !== 'optimized') return;
    expect(outcome.stopReason).toBe('budget_exhausted');
    expect(outcome.rolloutsUsed).toBe(MAX_ROLLOUTS);
    expect(outcome.winner.id).toBe('R2');
    expect(outcome.winner.weightedScore).toBe(3.55);
    expect(mock.callsFor('reviser')).toHaveLength(2);
    expect(mock.callsFor('rollout')).toHaveLength(5);
    expect(mock.callsFor('critic')).toHaveLength(5);
  });

  it('breaks score ties by fewer prompt tokens — the original can win honestly', async () => {
    const tiedCritics = criticByPrompt({
      [ORIGINAL_PROMPT]: critiqueJson([5, 5, 4, 4, 4], ['fine']),
      [CANDIDATE_A_PROMPT]: critiqueJson([5, 5, 4, 4, 4], ['also fine']),
      [CANDIDATE_C_PROMPT]: critiqueJson([3, 3, 3, 3, 3], ['weak']),
    });

    const leanOriginal = createMockLlm(
      baseHandlers({
        handlers: {
          critic: tiedCritics,
          rollout: rolloutByPrompt({
            [ORIGINAL_PROMPT]: 40,
            [CANDIDATE_A_PROMPT]: 90,
            [CANDIDATE_C_PROMPT]: 60,
          }),
        },
      })
    );
    const engine1 = createReflectionEngine({ llm: leanOriginal.llm, singlePass: createSinglePassMock() });
    const outcome1 = await engine1.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome1.status).toBe('optimized');
    if (outcome1.status !== 'optimized') return;
    expect(outcome1.winner.id).toBe('ORIGINAL');
    expect(outcome1.originalWon).toBe(true);
    expect(outcome1.stopReason).toBe('target_reached');

    const bloatedOriginal = createMockLlm(
      baseHandlers({
        handlers: {
          critic: tiedCritics,
          rollout: rolloutByPrompt({
            [ORIGINAL_PROMPT]: 90,
            [CANDIDATE_A_PROMPT]: 40,
            [CANDIDATE_C_PROMPT]: 60,
          }),
        },
      })
    );
    const engine2 = createReflectionEngine({ llm: bloatedOriginal.llm, singlePass: createSinglePassMock() });
    const outcome2 = await engine2.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome2.status).toBe('optimized');
    if (outcome2.status !== 'optimized') return;
    expect(outcome2.winner.id).toBe('A');
    expect(outcome2.originalWon).toBe(false);
  });

  it('retries a stage once with the JSON-only instruction, then degrades to the fast path', async () => {
    const mock = createMockLlm(
      baseHandlers({ handlers: { rubric: () => 'sorry, I cannot produce JSON right now' } })
    );
    const singlePass = createSinglePassMock();
    const engine = createReflectionEngine({ llm: mock.llm, singlePass });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome.status).toBe('fast_path');
    if (outcome.status !== 'fast_path') return;
    expect(outcome.reason).toBe('stage_degraded');
    expect(outcome.degradedStage).toBe('rubric');
    expect(outcome.enhancedPrompt).toBe('polished output');
    expect(singlePass).toHaveBeenCalledTimes(1);

    const rubricCalls = mock.callsFor('rubric');
    expect(rubricCalls).toHaveLength(2);
    expect(rubricCalls[0]?.userMessage.endsWith(RETRY_JSON_INSTRUCTION)).toBe(false);
    expect(rubricCalls[1]?.userMessage.endsWith(RETRY_JSON_INSTRUCTION)).toBe(true);
    expect(mock.callsFor('candidates')).toHaveLength(0);
  });

  it('recovers when the retry succeeds after a schema (not syntax) failure', async () => {
    const invalidRubric = JSON.stringify({
      criteria: rubricFixture().criteria.slice(0, 4), // valid JSON, wrong criteria count
    });
    const mock = createMockLlm(
      baseHandlers({
        handlers: {
          rubric: (_request, index) => (index === 0 ? invalidRubric : rubricJson()),
        },
      })
    );
    const singlePass = createSinglePassMock();
    const engine = createReflectionEngine({ llm: mock.llm, singlePass });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome.status).toBe('optimized');
    expect(singlePass).not.toHaveBeenCalled();
    const rubricCalls = mock.callsFor('rubric');
    expect(rubricCalls).toHaveLength(2);
    expect(rubricCalls[1]?.userMessage.endsWith(RETRY_JSON_INSTRUCTION)).toBe(true);
  });

  it('degrades to the fast path when rollouts keep returning empty output', async () => {
    const mock = createMockLlm(
      baseHandlers({ handlers: { rollout: () => ({ content: '   ' }) } })
    );
    const singlePass = createSinglePassMock();
    const engine = createReflectionEngine({ llm: mock.llm, singlePass });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(outcome.status).toBe('fast_path');
    if (outcome.status !== 'fast_path') return;
    expect(outcome.reason).toBe('stage_degraded');
    expect(outcome.degradedStage).toBe('rollout');
    expect(singlePass).toHaveBeenCalledTimes(1);
  });

  it("formats P2 for the explicitly requested family, overriding P0's inference", async () => {
    const mock = createMockLlm(
      baseHandlers({ handlers: { intake: () => intakeJson({ target_model_family: 'gpt' }) } })
    );
    const engine = createReflectionEngine({ llm: mock.llm, singlePass: createSinglePassMock() });

    const outcome = await engine.optimize({ rawPrompt: ORIGINAL_PROMPT, targetModelFamily: 'claude' });

    const candidatesMessage = mock.callsFor('candidates')[0]?.userMessage ?? '';
    expect(candidatesMessage).toContain('target_model_family: claude');
    expect(candidatesMessage).not.toContain('target_model_family: gpt');
    // Intake stays P0's honest output — only the P2 input is overridden.
    expect(outcome.status).toBe('optimized');
    if (outcome.status !== 'optimized') return;
    expect(outcome.intake.target_model_family).toBe('gpt');
  });

  it("defers to P0's inference when the request says 'unknown' or nothing", async () => {
    const mock = createMockLlm(
      baseHandlers({ handlers: { intake: () => intakeJson({ target_model_family: 'gemini' }) } })
    );
    const engine = createReflectionEngine({ llm: mock.llm, singlePass: createSinglePassMock() });

    await engine.optimize({ rawPrompt: ORIGINAL_PROMPT, targetModelFamily: 'unknown' });

    const candidatesMessage = mock.callsFor('candidates')[0]?.userMessage ?? '';
    expect(candidatesMessage).toContain('target_model_family: gemini');
  });

  it('emits progress phases in pipeline order', async () => {
    const mock = createMockLlm(baseHandlers());
    const phases: string[] = [];
    const engine = createReflectionEngine({
      llm: mock.llm,
      singlePass: createSinglePassMock(),
      onProgress: (event) => phases.push(event.phase),
    });

    await engine.optimize({ rawPrompt: ORIGINAL_PROMPT });

    expect(phases).toEqual([
      'classifying',
      'building_rubric',
      'generating_candidates',
      'testing_candidates',
      'reflecting',
      'packaging',
    ]);
  });
});

describe('reflection loop helpers', () => {
  it('fills {{variable}} slots with values or readable placeholders', () => {
    const filled = fillVariableSlots('Write for {{audience}} about {{topic}} in {{ tone }}.', {
      audience: 'CTOs',
    });

    expect(filled).toBe('Write for CTOs about [example topic] in [example tone].');
  });

  it('recomputes the weighted total from scores, ignoring the reported value', () => {
    const rubric = rubricFixture();
    const critique = JSON.parse(critiqueJson([5, 5, 4, 4, 4], ['fine'])) as Critique;
    critique.weighted_total = 1.23; // arithmetic slip by the critic

    expect(computeWeightedTotal(critique, rubric)).toBe(4.55);
  });

  it('falls back to the reported total when scores do not cover the rubric', () => {
    const rubric = rubricFixture();
    const critique = JSON.parse(critiqueJson([5, 5, 4, 4, 4], ['fine'])) as Critique;
    critique.scores = critique.scores.slice(0, 3);
    critique.weighted_total = 3.33;

    expect(computeWeightedTotal(critique, rubric)).toBe(3.33);
  });

  it('resolveTargetModelFamily: explicit specific choice wins, unknown/absent defer to inference', () => {
    expect(resolveTargetModelFamily('claude', 'gpt')).toBe('claude');
    expect(resolveTargetModelFamily('unknown', 'gpt')).toBe('gpt');
    expect(resolveTargetModelFamily(undefined, 'deepseek')).toBe('deepseek');
    expect(resolveTargetModelFamily('reasoning_model', 'unknown')).toBe('reasoning_model');
  });

  it('selectTopCandidate prefers higher score, then fewer prompt tokens', () => {
    const base = {
      strategy: 's',
      promptText: 'p',
      variables: [] as string[],
      rolloutOutput: 'o',
      critique: JSON.parse(critiqueJson([3, 3, 3, 3, 3], ['d'])) as Critique,
    };
    const pool = [
      { ...base, id: 'ORIGINAL', promptTokens: 50, weightedScore: 4.0 },
      { ...base, id: 'A', promptTokens: 200, weightedScore: 4.2 },
      { ...base, id: 'C', promptTokens: 80, weightedScore: 4.2 },
    ];

    expect(selectTopCandidate(pool).id).toBe('C');
  });
});
