import { prisma } from '../utils/prisma.js';
import { logWarn } from '../utils/logger.js';

let promptImageAttachmentSupportPromise: Promise<boolean> | null = null;
let threadTurnImageAttachmentSupportPromise: Promise<boolean> | null = null;

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
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

    return result[0]?.exists === true;
  } catch (error) {
    logWarn('Schema compatibility probe failed; assuming legacy schema', {
      tableName,
      columnName,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function supportsPromptImageAttachmentColumn(): Promise<boolean> {
  promptImageAttachmentSupportPromise ??= columnExists('Prompt', 'imageAttachment');
  return promptImageAttachmentSupportPromise;
}

export async function supportsThreadTurnImageAttachmentColumn(): Promise<boolean> {
  threadTurnImageAttachmentSupportPromise ??= columnExists('ThreadTurn', 'imageAttachment');
  return threadTurnImageAttachmentSupportPromise;
}

