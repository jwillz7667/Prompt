import { randomUUID } from 'node:crypto';

import type { Job, Queue, QueueEvents, Worker } from 'bullmq';

import { prisma } from '../utils/prisma.js';
import { promptLogger } from '../utils/logger.js';
import { recordUsage } from './subscriptionService.js';
import { DEEPSEEK_THINKING_DISABLED, getDeepseekModel } from './deepseekModels.js';
import type { EnhancementTier } from './deepseekService.js';
import {
  INTAKE_SYSTEM_PROMPT,
  RETRY_JSON_INSTRUCTION,
  buildIntakeUserMessage,
  createDeepseekReflectionLlmCall,
  createDeepseekSinglePass,
  createProductionReflectionEngine,
  intakeSchema,
  resolveTargetModelFamily,
  type Intake,
  type OptimizeJobInput,
  type ReflectionLlmCall,
  type ReflectionOutcome,
  type ReflectionProgressPhase,
  type ReflectionUsage,
  type ScoredCandidate,
  type TargetModelFamily,
} from './reflectionLoop/index.js';

/**
 * Reflection-loop job orchestration: one job per optimization (spec §1),
 * stages processed by the engine, progress published as spec §7 phase events.
 *
 * Two execution modes, decided once at boot:
 *  - Queue mode (Redis configured): a BullMQ queue + in-process worker,
 *    mirroring utils/queue.ts conventions. Progress rides on BullMQ job
 *    progress and the result on the job return value, so polling and SSE
 *    survive multi-instance deploys and process restarts.
 *  - Inline mode (no Redis — dev): the loop runs in-process against an
 *    in-memory registry. Degraded (state is per-process and lost on restart)
 *    but functional, matching utils/queue.ts's Redis-optional stance.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReflectionJobMode = 'fast_path' | 'full_loop';

export type ReflectionJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ReflectionJobRequest {
  userId: string;
  /** §8 tier gate, decided at the route: FREE → fast_path, PRO/PREMIUM → full_loop. */
  mode: ReflectionJobMode;
  /** Quality tier for the single-pass polish (free tier + §3 degradation). */
  singlePassTier: EnhancementTier;
  rawPrompt: string;
  goal?: string | undefined;
  /** §8 target-model profile. The route gates FREE to 'unknown' (generic). */
  targetModelFamily?: TargetModelFamily | undefined;
  variableValues?: Record<string, string> | undefined;
}

export interface ReflectionProgressUpdate {
  phase: ReflectionProgressPhase;
  label: string;
  rolloutsUsed: number;
  at: string;
}

export interface ReflectionScoreDetail {
  criterion: string;
  score: number;
  evidence: string;
}

export interface ReflectionCandidateReceipt {
  id: string;
  strategy: string;
  promptText: string;
  score: number;
  rolloutOutput: string;
  scores: ReflectionScoreDetail[];
}

export type ReflectionJobResult =
  | {
      status: 'refused';
      category: string;
      message: string;
      usage: ReflectionUsage;
    }
  | {
      status: 'fast_path';
      reason: 'free_tier' | 'already_strong' | 'stage_degraded';
      degradedStage?: string | undefined;
      enhancedPrompt: string;
      model: string;
      usage: ReflectionUsage;
      promptId: string | null;
    }
  | {
      status: 'optimized';
      title: string;
      summaryBullets: string[];
      templateText: string;
      variables: string[];
      winner: ReflectionCandidateReceipt;
      original: ReflectionCandidateReceipt;
      originalWon: boolean;
      stopReason: string;
      rolloutsUsed: number;
      /**
       * Effective target-model profile the winner was formatted for (spec §4
       * P2): the user's explicit request when specific, else P0's inference.
       * Additive field — intake never reaches this client-facing payload.
       */
      requestedTargetModelFamily: TargetModelFamily;
      usage: ReflectionUsage;
      promptId: string | null;
    };

export interface ReflectionJobSnapshot {
  jobId: string;
  userId: string;
  status: ReflectionJobStatus;
  progress: ReflectionProgressUpdate[];
  result: ReflectionJobResult | null;
  error: string | null;
}

export type ReflectionJobStreamMessage =
  | { type: 'progress'; phase: ReflectionProgressPhase; label: string; rolloutsUsed: number }
  | { type: 'result'; result: ReflectionJobResult }
  | { type: 'error'; message: string };

export function isReflectionLoopEnabled(): boolean {
  return process.env['REFLECTION_LOOP_ENABLED'] === 'true';
}

// ---------------------------------------------------------------------------
// Progress labels (spec §7: mandatory UX states for the 20–45 s wall clock)
// ---------------------------------------------------------------------------

const PROGRESS_LABELS: Record<ReflectionProgressPhase, string> = {
  classifying: 'Analyzing your prompt…',
  building_rubric: 'Designing the scoring rubric…',
  generating_candidates: 'Drafting candidate prompts…',
  testing_candidates: 'Testing candidates…',
  reflecting: 'Reflecting…',
  revising: 'Revising…',
  packaging: 'Packaging results…',
};

/** Client-safe failure message; details go to logs only. */
const GENERIC_FAILURE_MESSAGE = 'Optimization failed';

// ---------------------------------------------------------------------------
// Queue mode state (mirrors utils/queue.ts: dynamic import, graceful degrade)
// ---------------------------------------------------------------------------

const REFLECTION_QUEUE_NAME = 'reflection-optimize';
/** Explicit fan-out bound: at most this many loops run concurrently per process. */
const REFLECTION_WORKER_CONCURRENCY = 2;
const QUEUE_POLL_INTERVAL_MS = 1_000;

let reflectionQueue: Queue<ReflectionJobRequest, ReflectionJobResult> | null = null;
let reflectionWorker: Worker<ReflectionJobRequest, ReflectionJobResult> | null = null;
let reflectionQueueEvents: QueueEvents | null = null;

function resolveRedisConnection(): { host: string; port: number; password: string | undefined } | null {
  const redisUrl = process.env['REDIS_URL'];
  const redisHost = process.env['REDIS_HOST'];
  if (!redisUrl && !redisHost) {
    return null;
  }

  const parsed = redisUrl ? new URL(redisUrl) : null;
  const host = redisHost || parsed?.hostname;
  if (!host) {
    return null;
  }

  return {
    host,
    port: parseInt(process.env['REDIS_PORT'] || parsed?.port || '6379', 10),
    password: process.env['REDIS_PASSWORD'] || parsed?.password || undefined,
  };
}

export async function initReflectionQueue(): Promise<void> {
  if (!isReflectionLoopEnabled()) {
    return;
  }

  const connection = resolveRedisConnection();
  if (!connection) {
    promptLogger.warn('Redis not configured - reflection jobs will run inline (degraded dev mode)');
    return;
  }

  try {
    const { Queue, QueueEvents, Worker } = await import('bullmq');

    reflectionQueue = new Queue<ReflectionJobRequest, ReflectionJobResult>(REFLECTION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        // The engine retries each stage internally and degrades to the fast
        // path (§3); re-running a whole 20–45 s loop on job failure would only
        // duplicate spend, so no queue-level retries.
        attempts: 1,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    });

    reflectionWorker = new Worker<ReflectionJobRequest, ReflectionJobResult>(
      REFLECTION_QUEUE_NAME,
      async (job) =>
        processReflectionJob(job.data, async (events) => {
          await job.updateProgress(events);
        }),
      { connection, concurrency: REFLECTION_WORKER_CONCURRENCY }
    );

    reflectionQueueEvents = new QueueEvents(REFLECTION_QUEUE_NAME, { connection });
    reflectionQueueEvents.on('completed', ({ jobId }: { jobId: string }) => {
      promptLogger.info({ jobId }, 'Reflection optimization job completed');
    });
    reflectionQueueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      promptLogger.error({ jobId, failedReason }, 'Reflection optimization job failed');
    });

    promptLogger.info(
      { queue: REFLECTION_QUEUE_NAME, concurrency: REFLECTION_WORKER_CONCURRENCY },
      'Reflection queue initialized'
    );
  } catch (error) {
    reflectionQueue = null;
    reflectionWorker = null;
    reflectionQueueEvents = null;
    promptLogger.warn({ error }, 'BullMQ unavailable - reflection jobs will run inline');
  }
}

export async function closeReflectionQueue(): Promise<void> {
  try {
    if (reflectionWorker) await reflectionWorker.close();
    if (reflectionQueueEvents) await reflectionQueueEvents.close();
    if (reflectionQueue) await reflectionQueue.close();
  } catch (error) {
    promptLogger.error({ error }, 'Error closing reflection queue');
  } finally {
    reflectionQueue = null;
    reflectionWorker = null;
    reflectionQueueEvents = null;
  }
}

// ---------------------------------------------------------------------------
// Inline mode registry (no Redis): per-process, TTL-swept
// ---------------------------------------------------------------------------

const INLINE_JOB_TTL_MS = 30 * 60 * 1000;
const INLINE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Hard cap so a burst without Redis cannot grow process memory unbounded. */
const MAX_INLINE_JOBS = 500;

interface InlineJobRecord {
  jobId: string;
  userId: string;
  status: ReflectionJobStatus;
  progress: ReflectionProgressUpdate[];
  result: ReflectionJobResult | null;
  error: string | null;
  createdAt: number;
  listeners: Set<(message: ReflectionJobStreamMessage) => void>;
}

const inlineJobs = new Map<string, InlineJobRecord>();
let inlineSweeper: NodeJS.Timeout | null = null;

function ensureInlineSweeper(): void {
  if (inlineSweeper) {
    return;
  }
  inlineSweeper = setInterval(() => {
    const now = Date.now();
    for (const [jobId, record] of inlineJobs) {
      const isTerminal = record.status === 'completed' || record.status === 'failed';
      if (isTerminal && now - record.createdAt > INLINE_JOB_TTL_MS) {
        inlineJobs.delete(jobId);
      }
    }
    if (inlineJobs.size > MAX_INLINE_JOBS) {
      const oldestFirst = [...inlineJobs.values()].sort((a, b) => a.createdAt - b.createdAt);
      for (const record of oldestFirst.slice(0, inlineJobs.size - MAX_INLINE_JOBS)) {
        inlineJobs.delete(record.jobId);
      }
    }
  }, INLINE_SWEEP_INTERVAL_MS);
  // The sweeper must never keep the process (or a test worker) alive.
  inlineSweeper.unref();
}

function emitToListeners(record: InlineJobRecord, message: ReflectionJobStreamMessage): void {
  for (const listener of record.listeners) {
    try {
      listener(message);
    } catch (error) {
      promptLogger.warn({ error, jobId: record.jobId }, 'Reflection job listener threw');
    }
  }
}

async function runInlineJob(record: InlineJobRecord, request: ReflectionJobRequest): Promise<void> {
  record.status = 'running';
  try {
    const result = await processReflectionJob(request, (events) => {
      record.progress = events;
      const latest = events[events.length - 1];
      if (latest) {
        emitToListeners(record, {
          type: 'progress',
          phase: latest.phase,
          label: latest.label,
          rolloutsUsed: latest.rolloutsUsed,
        });
      }
    });
    record.status = 'completed';
    record.result = result;
    emitToListeners(record, { type: 'result', result });
  } catch (error) {
    record.status = 'failed';
    record.error = GENERIC_FAILURE_MESSAGE;
    promptLogger.error({ err: error, jobId: record.jobId, userId: record.userId }, 'Inline reflection job failed');
    emitToListeners(record, { type: 'error', message: GENERIC_FAILURE_MESSAGE });
  } finally {
    record.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Public API: enqueue / snapshot / subscribe
// ---------------------------------------------------------------------------

export async function enqueueReflectionJob(request: ReflectionJobRequest): Promise<string> {
  const jobId = `opt_${randomUUID()}`;

  if (reflectionQueue) {
    await reflectionQueue.add('optimize', request, { jobId });
    return jobId;
  }

  // Inline degraded mode: run in-process, fire-and-forget with error capture.
  ensureInlineSweeper();
  const record: InlineJobRecord = {
    jobId,
    userId: request.userId,
    status: 'queued',
    progress: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    listeners: new Set(),
  };
  inlineJobs.set(jobId, record);
  void runInlineJob(record, request);
  return jobId;
}

function mapQueueState(state: string): ReflectionJobStatus {
  switch (state) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'active':
      return 'running';
    default:
      return 'queued';
  }
}

function isProgressUpdate(value: unknown): value is ReflectionProgressUpdate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['phase'] === 'string' &&
    candidate['phase'] in PROGRESS_LABELS &&
    typeof candidate['label'] === 'string' &&
    typeof candidate['rolloutsUsed'] === 'number' &&
    typeof candidate['at'] === 'string'
  );
}

function parseProgressEvents(progress: unknown): ReflectionProgressUpdate[] {
  if (!Array.isArray(progress)) {
    return [];
  }
  return progress.filter(isProgressUpdate);
}

export async function getReflectionJob(jobId: string): Promise<ReflectionJobSnapshot | null> {
  const record = inlineJobs.get(jobId);
  if (record) {
    return {
      jobId: record.jobId,
      userId: record.userId,
      status: record.status,
      progress: [...record.progress],
      result: record.result,
      error: record.error,
    };
  }

  if (!reflectionQueue) {
    return null;
  }

  const job = await reflectionQueue.getJob(jobId);
  if (!job) {
    return null;
  }
  const status = mapQueueState(await job.getState());
  return {
    jobId,
    userId: job.data.userId,
    status,
    progress: parseProgressEvents(job.progress),
    result: status === 'completed' ? (job.returnvalue ?? null) : null,
    error: status === 'failed' ? GENERIC_FAILURE_MESSAGE : null,
  };
}

function progressMessage(event: ReflectionProgressUpdate): ReflectionJobStreamMessage {
  return { type: 'progress', phase: event.phase, label: event.label, rolloutsUsed: event.rolloutsUsed };
}

/**
 * Replays the job's history through `listener` (progress events, then the
 * terminal result/error if the job already finished), then keeps streaming
 * live updates. Returns an unsubscribe function, or null when the job does
 * not exist. Callers enforce ownership BEFORE subscribing.
 */
export async function subscribeToReflectionJob(
  jobId: string,
  listener: (message: ReflectionJobStreamMessage) => void
): Promise<(() => void) | null> {
  const record = inlineJobs.get(jobId);
  if (record) {
    for (const event of record.progress) {
      listener(progressMessage(event));
    }
    if (record.status === 'completed' && record.result) {
      listener({ type: 'result', result: record.result });
      return () => undefined;
    }
    if (record.status === 'failed') {
      listener({ type: 'error', message: record.error ?? GENERIC_FAILURE_MESSAGE });
      return () => undefined;
    }
    record.listeners.add(listener);
    return () => {
      record.listeners.delete(listener);
    };
  }

  if (!reflectionQueue) {
    return null;
  }
  const queue = reflectionQueue;
  if (!(await queue.getJob(jobId))) {
    return null;
  }

  // Queue mode: progress lives in Redis (the worker may be another process),
  // so bridge SSE with a short poll. Phases change every few seconds; 1 s of
  // added latency is invisible next to the 20–45 s loop.
  let emitted = 0;
  let stopped = false;
  let inFlight = false;
  let timer: NodeJS.Timeout | null = null;

  const stop = (): void => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const pump = async (): Promise<void> => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        listener({ type: 'error', message: GENERIC_FAILURE_MESSAGE });
        stop();
        return;
      }
      const state = await job.getState();
      const progress = parseProgressEvents(job.progress);
      while (emitted < progress.length) {
        const event = progress[emitted];
        emitted += 1;
        if (event) {
          listener(progressMessage(event));
        }
      }
      if (state === 'completed') {
        const result = job.returnvalue ?? null;
        if (result) {
          listener({ type: 'result', result });
        } else {
          listener({ type: 'error', message: GENERIC_FAILURE_MESSAGE });
        }
        stop();
      } else if (state === 'failed') {
        listener({ type: 'error', message: GENERIC_FAILURE_MESSAGE });
        stop();
      }
    } catch (error) {
      promptLogger.warn({ error, jobId }, 'Reflection job progress poll failed');
    } finally {
      inFlight = false;
    }
  };

  await pump();
  if (!stopped) {
    timer = setInterval(() => {
      void pump();
    }, QUEUE_POLL_INTERVAL_MS);
  }
  return stop;
}

// ---------------------------------------------------------------------------
// Job processing (shared by the BullMQ worker and inline mode)
// ---------------------------------------------------------------------------

type ProgressReporter = (events: ReflectionProgressUpdate[]) => void | Promise<void>;

function composeUserGoal(
  goal: string | undefined,
  targetModelFamily: TargetModelFamily | undefined
): string | undefined {
  const parts: string[] = [];
  if (goal?.trim()) {
    parts.push(goal.trim());
  }
  // A specific family also rides along as a goal-text hint so P0's intake and
  // the single-pass polish see it. P2 does not depend on this hint: the
  // explicit choice overrides the inferred family there (engine precedence,
  // resolveTargetModelFamily). 'unknown' carries no information — skip it.
  if (targetModelFamily && targetModelFamily !== 'unknown') {
    parts.push(`Target model family: ${targetModelFamily}.`);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

async function processReflectionJob(
  request: ReflectionJobRequest,
  reportProgress: ProgressReporter
): Promise<ReflectionJobResult> {
  const startedAt = Date.now();
  const events: ReflectionProgressUpdate[] = [];

  const emit = (phase: ReflectionProgressPhase, rolloutsUsed: number): void => {
    events.push({ phase, label: PROGRESS_LABELS[phase], rolloutsUsed, at: new Date().toISOString() });
    void Promise.resolve(reportProgress([...events])).catch((error) => {
      promptLogger.warn({ error }, 'Failed to report reflection job progress');
    });
  };

  const jobInput: OptimizeJobInput = {
    rawPrompt: request.rawPrompt,
    userGoal: composeUserGoal(request.goal, request.targetModelFamily),
    targetModelFamily: request.targetModelFamily,
    variableValues: request.variableValues,
  };

  const result =
    request.mode === 'fast_path'
      ? await runFreeTierFastPath(jobInput, request.singlePassTier, emit)
      : toJobResult(
          await createProductionReflectionEngine({
            singlePassTier: request.singlePassTier,
            onProgress: (event) => emit(event.phase, event.rolloutsUsed),
          }).optimize(jobInput),
          request.targetModelFamily
        );

  return finalizeJobResult(request, result, Date.now() - startedAt);
}

function toReceipt(candidate: ScoredCandidate): ReflectionCandidateReceipt {
  return {
    id: candidate.id,
    strategy: candidate.strategy,
    promptText: candidate.promptText,
    score: candidate.weightedScore,
    rolloutOutput: candidate.rolloutOutput,
    scores: candidate.critique.scores,
  };
}

function toJobResult(
  outcome: ReflectionOutcome,
  requestedTargetModelFamily: TargetModelFamily | undefined
): ReflectionJobResult {
  switch (outcome.status) {
    case 'refused':
      return {
        status: 'refused',
        category: outcome.category,
        message: outcome.message,
        usage: outcome.usage,
      };
    case 'fast_path':
      return {
        status: 'fast_path',
        reason: outcome.reason,
        degradedStage: outcome.degradedStage,
        enhancedPrompt: outcome.enhancedPrompt,
        model: outcome.model,
        usage: outcome.usage,
        promptId: null,
      };
    case 'optimized':
      return {
        status: 'optimized',
        title: outcome.package.title,
        summaryBullets: outcome.package.summary_bullets,
        templateText: outcome.package.template_text,
        variables: outcome.package.variables,
        winner: toReceipt(outcome.winner),
        original: toReceipt(outcome.original),
        originalWon: outcome.originalWon,
        stopReason: outcome.stopReason,
        rolloutsUsed: outcome.rolloutsUsed,
        // Same precedence the engine applied at P2, recomputed from the same
        // inputs, so the client sees exactly the family the winner targets.
        requestedTargetModelFamily: resolveTargetModelFamily(
          requestedTargetModelFamily,
          outcome.intake.target_model_family
        ),
        usage: outcome.usage,
        promptId: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Free-tier fast path: P0 intake gate + single-pass polish (spec §8)
// ---------------------------------------------------------------------------

// Spec §2 P0 row. The engine keeps its stage table private; these two numbers
// are duplicated here deliberately rather than widening the engine's API.
const INTAKE_TEMPERATURE = 0.1;
const INTAKE_MAX_TOKENS = 400;

// Same copy the engine uses for its refusals, so both tiers refuse identically.
function buildRefusalMessage(category: string): string {
  const label = category.trim() || 'harmful';
  return (
    `This prompt appears to be aimed at ${label} content, which Promptomize cannot help optimize. ` +
    'Please rework the request to remove that goal and try again.'
  );
}

function parseJsonObject(content: string): unknown {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(unfenced);
  } catch {
    // Prose-wrapped object: fall through to the outermost brace span.
  }

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError('no JSON object found in intake output');
  }
  return JSON.parse(unfenced.slice(start, end + 1));
}

/**
 * P0 for the free tier, with the §3 failure ladder (retry with the JSON-only
 * suffix). Fails OPEN to null — an unparseable intake must not block the
 * polish, only skip the safety/already_strong signals it would have carried.
 */
async function classifyIntakeGate(
  llm: ReflectionLlmCall,
  jobInput: OptimizeJobInput,
  usage: ReflectionUsage
): Promise<Intake | null> {
  const baseMessage = buildIntakeUserMessage({
    rawPrompt: jobInput.rawPrompt,
    userGoal: jobInput.userGoal,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let content: string;
    try {
      const response = await llm({
        stage: 'intake',
        model: getDeepseekModel(),
        systemPrompt: INTAKE_SYSTEM_PROMPT,
        userMessage: attempt === 0 ? baseMessage : `${baseMessage}\n\n${RETRY_JSON_INSTRUCTION}`,
        temperature: INTAKE_TEMPERATURE,
        maxTokens: INTAKE_MAX_TOKENS,
        thinking: DEEPSEEK_THINKING_DISABLED,
      });
      usage.llmCalls += 1;
      usage.inputTokens += response.inputTokens;
      usage.outputTokens += response.outputTokens;
      content = response.content;
    } catch (error) {
      promptLogger.warn({ err: error, attempt }, 'Free-tier intake call failed');
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObject(content);
    } catch (error) {
      promptLogger.warn({ err: error, attempt }, 'Free-tier intake returned unparseable JSON');
      continue;
    }

    const validated = intakeSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    promptLogger.warn({ attempt, issues: validated.error.issues }, 'Free-tier intake failed schema validation');
  }

  return null;
}

async function runFreeTierFastPath(
  jobInput: OptimizeJobInput,
  singlePassTier: EnhancementTier,
  emit: (phase: ReflectionProgressPhase, rolloutsUsed: number) => void
): Promise<ReflectionJobResult> {
  const usage: ReflectionUsage = { inputTokens: 0, outputTokens: 0, llmCalls: 0 };

  emit('classifying', 0);
  const intake = await classifyIntakeGate(createDeepseekReflectionLlmCall(), jobInput, usage);

  if (intake?.safety.flag) {
    return {
      status: 'refused',
      category: intake.safety.category,
      message: buildRefusalMessage(intake.safety.category),
      usage,
    };
  }

  emit('packaging', 0);
  const polish = createDeepseekSinglePass({ tier: singlePassTier });
  const polished = await polish({ rawPrompt: jobInput.rawPrompt, userGoal: jobInput.userGoal });
  usage.llmCalls += 1;
  usage.inputTokens += polished.inputTokens;
  usage.outputTokens += polished.outputTokens;

  return {
    status: 'fast_path',
    reason: intake?.already_strong ? 'already_strong' : 'free_tier',
    enhancedPrompt: polished.enhancedPrompt,
    model: polished.model,
    usage,
    promptId: null,
  };
}

// ---------------------------------------------------------------------------
// Completion side effects: quota + minimal persistence
// ---------------------------------------------------------------------------

async function persistReflectionPrompt(
  request: ReflectionJobRequest,
  result: Extract<ReflectionJobResult, { status: 'fast_path' | 'optimized' }>,
  processingMs: number
): Promise<string> {
  const created = await prisma.prompt.create({
    data: {
      userId: request.userId,
      originalPrompt: request.rawPrompt,
      // The winner text from code is the source of truth; the packager's
      // template_text is a model restatement and may drift.
      enhancedPrompt: result.status === 'optimized' ? result.winner.promptText : result.enhancedPrompt,
      model: result.status === 'fast_path' ? result.model : getDeepseekModel(),
      modality: 'text',
      tags: ['reflection-loop'],
      ...(result.status === 'optimized' ? { title: result.title } : {}),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.inputTokens + result.usage.outputTokens,
      processingMs,
    },
    select: { id: true },
  });
  return created.id;
}

async function finalizeJobResult(
  request: ReflectionJobRequest,
  result: ReflectionJobResult,
  processingMs: number
): Promise<ReflectionJobResult> {
  // A refusal produced no enhancement: no quota charge, nothing to persist.
  if (result.status === 'refused') {
    return result;
  }

  // Quota first and on its own (mirrors /prompts/enhance/stream): the model
  // calls already happened, so the quota is owed even if persistence fails.
  try {
    await recordUsage(request.userId);
  } catch (error) {
    promptLogger.error({ err: error, userId: request.userId }, 'Failed to record usage for reflection job');
  }

  // Persistence is best-effort — a DB hiccup must never turn a completed
  // optimization into a failed job. Null promptId means "not saved".
  try {
    return { ...result, promptId: await persistReflectionPrompt(request, result, processingMs) };
  } catch (error) {
    promptLogger.error(
      { err: error, userId: request.userId },
      'Failed to persist reflection optimization; returning result unsaved'
    );
    return result;
  }
}
