import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logInfo, logWarn } from '../utils/logger.js';

// Memoized, definitive results only. `null` means "not yet known" so the next
// call re-probes. A transient probe failure (DB briefly unreachable) must never
// be cached as `false`, otherwise image attachments would stop persisting
// permanently after a momentary blip. The in-flight promises de-duplicate
// concurrent probes without poisoning the cache.
let promptImageAttachmentSupport: boolean | null = null;
let threadTurnImageAttachmentSupport: boolean | null = null;
let promptProbeInFlight: Promise<boolean> | null = null;
let threadTurnProbeInFlight: Promise<boolean> | null = null;

interface ColumnProbe {
  // `known` is false only when the probe query itself failed, so the result is
  // not authoritative and must not be cached.
  known: boolean;
  exists: boolean;
}

async function probeColumn(tableName: string, columnName: string): Promise<ColumnProbe> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND column_name = ${columnName}
      ) AS "exists"
    `;

    return { known: true, exists: result[0]?.exists === true };
  } catch (error) {
    logWarn('Schema compatibility probe failed; assuming legacy schema for this request', {
      tableName,
      columnName,
      error: error instanceof Error ? error.message : String(error),
    });
    return { known: false, exists: false };
  }
}

export async function supportsPromptImageAttachmentColumn(): Promise<boolean> {
  if (promptImageAttachmentSupport !== null) {
    return promptImageAttachmentSupport;
  }

  promptProbeInFlight ??= probeColumn('Prompt', 'imageAttachment').then(({ known, exists }) => {
    if (known) {
      promptImageAttachmentSupport = exists;
    }
    promptProbeInFlight = null;
    return exists;
  });

  return promptProbeInFlight;
}

export async function supportsThreadTurnImageAttachmentColumn(): Promise<boolean> {
  if (threadTurnImageAttachmentSupport !== null) {
    return threadTurnImageAttachmentSupport;
  }

  threadTurnProbeInFlight ??= probeColumn('ThreadTurn', 'imageAttachment').then(({ known, exists }) => {
    if (known) {
      threadTurnImageAttachmentSupport = exists;
    }
    threadTurnProbeInFlight = null;
    return exists;
  });

  return threadTurnProbeInFlight;
}

// True when an error indicates a column referenced by a query does not exist
// in the live database — the signature of schema drift between the Prisma
// client and the deployed Postgres schema. P2022 is Prisma's "column does not
// exist" code; the raw message check covers cases surfaced before mapping.
export function isMissingColumnError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2022';
  }

  if (error instanceof Error) {
    return /column .* does not exist/i.test(error.message);
  }

  return false;
}

// Clears the memoized results so the next support check re-probes the live
// schema. Call this after a persistence failure that looks like schema drift
// (e.g. a missing-column error) so the service self-heals once a migration
// lands instead of trusting a stale positive.
export function resetSchemaCompatibilityCache(): void {
  promptImageAttachmentSupport = null;
  threadTurnImageAttachmentSupport = null;
  promptProbeInFlight = null;
  threadTurnProbeInFlight = null;
}

// Runs a read that may reference an optional column, transparently self-healing
// on schema drift. If the query fails because the column is missing (the same
// signature the write paths already recover from), the compatibility cache is
// reset and the read is retried once with the column excluded. `run` must build
// its `select` from the boolean it is given so the retry can drop the column.
// This keeps reads symmetric with writes: a single drifted column can never
// turn history listing into a 500.
export async function withImageAttachmentReadFallback<T>(
  initialSupport: boolean,
  run: (supportsColumn: boolean) => Promise<T>,
): Promise<T> {
  try {
    return await run(initialSupport);
  } catch (error) {
    if (initialSupport && isMissingColumnError(error)) {
      resetSchemaCompatibilityCache();
      logWarn('imageAttachment column missing on read; retrying without it', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await run(false);
    }
    throw error;
  }
}

// Proactively probes both columns at boot so the first user request does not
// pay the probe latency and so any drift is surfaced in the startup logs.
export async function warmSchemaCompatibilityCache(): Promise<void> {
  const [promptImageAttachment, threadTurnImageAttachment] = await Promise.all([
    supportsPromptImageAttachmentColumn(),
    supportsThreadTurnImageAttachmentColumn(),
  ]);

  logInfo('Schema compatibility cache warmed', {
    promptImageAttachment,
    threadTurnImageAttachment,
  });
}
