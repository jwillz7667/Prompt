import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Server-side SSE helpers. Every proxy hop between Node and the phone
 * (compression middleware, Railway's edge, nginx-style buffers) must pass
 * events through unbuffered, or tokens arrive in one burst at the end.
 */

type SseResponse = ServerResponse & { flush?: () => void };

const HEARTBEAT_INTERVAL_MS = 15_000;
const heartbeats = new WeakMap<ServerResponse, NodeJS.Timeout>();

function stopHeartbeat(res: ServerResponse): void {
  const timer = heartbeats.get(res);
  if (timer) clearInterval(timer);
  heartbeats.delete(res);
}

function writeRaw(res: SseResponse, chunk: string): boolean {
  if (res.writableEnded || res.destroyed) return false;
  res.write(chunk);
  // Present when compression() wrapped the response; forces buffered bytes out.
  res.flush?.();
  return true;
}

/** Sends SSE headers and starts a 15s comment heartbeat that stops on end/close. */
export function beginSse(res: SseResponse): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  stopHeartbeat(res);
  const timer = setInterval(() => {
    if (!writeRaw(res, ': ping\n\n')) stopHeartbeat(res);
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  heartbeats.set(res, timer);
  res.once('close', () => stopHeartbeat(res));
}

/** Writes one `data:` event; returns false when the client is already gone. */
export function writeSse(res: SseResponse, event: object): boolean {
  return writeRaw(res, `data: ${JSON.stringify(event)}\n\n`);
}

export function endSse(res: SseResponse): void {
  stopHeartbeat(res);
  if (!res.writableEnded) res.end();
}

function headerIncludesEventStream(value: string | number | string[] | undefined): boolean {
  if (value === undefined) return false;
  const text = Array.isArray(value) ? value.join(',') : String(value);
  return text.toLowerCase().includes('text/event-stream');
}

/**
 * Filter for compression(): never compress SSE. gzip buffers until a block
 * fills, which holds streamed tokens back. Checks the request Accept header
 * (clients that ask for a stream) and the response Content-Type (routes that
 * stream regardless of Accept); compression evaluates this at first write,
 * after beginSse has set the header.
 */
export function shouldCompressResponse<Req extends IncomingMessage, Res extends ServerResponse>(
  req: Req,
  res: Res,
  fallback: (req: Req, res: Res) => boolean,
): boolean {
  if (headerIncludesEventStream(req.headers.accept)) return false;
  if (headerIncludesEventStream(res.getHeader('Content-Type'))) return false;
  return fallback(req, res);
}
