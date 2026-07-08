import { beforeEach, describe, expect, it, vi } from 'vitest';

// The assertion must be tested against controlled information_schema results,
// so the shared Prisma client is mocked; Sentry is mocked to assert capture.
const { queryRawMock, captureErrorMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('../../src/utils/prisma.js', () => ({
  prisma: { $queryRaw: queryRawMock },
}));

vi.mock('../../src/utils/sentry.js', () => ({
  isSentryEnabled: false,
  initSentry: vi.fn(),
  captureError: captureErrorMock,
}));

import { assertExpectedSchemaAtBoot } from '../../src/services/schemaCompatibilityService.js';

// Mirrors EXPECTED_COLUMNS / EXPECTED_TABLES in schemaCompatibilityService.ts.
const ALL_COLUMNS = [
  { table_name: 'Prompt', column_name: 'imageAttachment' },
  { table_name: 'Prompt', column_name: 'version' },
  { table_name: 'Prompt', column_name: 'rootPromptId' },
  { table_name: 'ThreadTurn', column_name: 'imageAttachment' },
  { table_name: 'Template', column_name: 'modality' },
];
const ALL_TABLES = [{ table_name: 'SharedPrompt' }];

beforeEach(() => {
  queryRawMock.mockReset();
  captureErrorMock.mockReset();
});

describe('assertExpectedSchemaAtBoot', () => {
  it('reports ok and skips Sentry when every expected object exists', async () => {
    queryRawMock.mockResolvedValueOnce(ALL_COLUMNS).mockResolvedValueOnce(ALL_TABLES);

    const result = await assertExpectedSchemaAtBoot();

    expect(result).toEqual({ known: true, missing: [] });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('tolerates extra columns beyond the expected set', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        ...ALL_COLUMNS,
        { table_name: 'Prompt', column_name: 'someFutureColumn' },
      ])
      .mockResolvedValueOnce(ALL_TABLES);

    const result = await assertExpectedSchemaAtBoot();

    expect(result).toEqual({ known: true, missing: [] });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('lists every missing column and table and captures one Sentry event', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { table_name: 'Prompt', column_name: 'imageAttachment' },
        { table_name: 'ThreadTurn', column_name: 'imageAttachment' },
      ])
      .mockResolvedValueOnce([]);

    const result = await assertExpectedSchemaAtBoot();

    expect(result.known).toBe(true);
    expect(result.missing).toEqual([
      'Prompt.version',
      'Prompt.rootPromptId',
      'Template.modality',
      'SharedPrompt (table)',
    ]);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    const call = captureErrorMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(call[0]).toBeInstanceOf(Error);
    const message = (call[0] as Error).message;
    expect(message).toContain('SCHEMA_DRIFT');
    expect(message).toContain('Prompt.version');
    expect(message).toContain('Prompt.rootPromptId');
    expect(message).toContain('Template.modality');
    expect(message).toContain('SharedPrompt (table)');
    expect(call[1]).toEqual({ missing: result.missing });
  });

  it('detects a single missing column without flagging present ones', async () => {
    queryRawMock
      .mockResolvedValueOnce(
        ALL_COLUMNS.filter(
          (column) => !(column.table_name === 'Template' && column.column_name === 'modality')
        )
      )
      .mockResolvedValueOnce(ALL_TABLES);

    const result = await assertExpectedSchemaAtBoot();

    expect(result).toEqual({ known: true, missing: ['Template.modality'] });
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it('returns known=false and does not capture when the probe itself fails', async () => {
    queryRawMock.mockRejectedValueOnce(new Error('connection refused'));

    const result = await assertExpectedSchemaAtBoot();

    expect(result).toEqual({ known: false, missing: [] });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
