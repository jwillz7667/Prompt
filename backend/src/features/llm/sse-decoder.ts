/**
 * Incremental decoder for an upstream `text/event-stream` body. Chunks may
 * split anywhere (mid-line, mid-CRLF, mid-UTF-8 sequence — the caller's
 * TextDecoder handles the latter), so partial lines are buffered until their
 * terminator arrives. Returns only `data:` payloads; comments (`: keep-alive`,
 * `: OPENROUTER PROCESSING`) and other fields are dropped because
 * OpenAI-compatible providers send each JSON chunk as a single data line.
 */
export interface SseDataDecoder {
  push(text: string): string[];
  /** Call once at end of stream: a final event may lack its trailing newline. */
  flush(): string[];
}

function dataPayload(rawLine: string): string | null {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  return payload.length > 0 ? payload : null;
}

export function createSseDataDecoder(): SseDataDecoder {
  let buffer = '';
  return {
    push(text) {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return lines.map(dataPayload).filter((payload): payload is string => payload !== null);
    },
    flush() {
      const rest = buffer;
      buffer = '';
      const payload = dataPayload(rest);
      return payload === null ? [] : [payload];
    },
  };
}
