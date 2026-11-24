import compression from 'compression';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { beginSse, endSse, shouldCompressResponse, writeSse } from '../../src/features/llm/sse.js';

const LARGE_TEXT = 'token '.repeat(2_000);

function buildApp() {
  const app = express();
  app.use(compression({ filter: (req, res) => shouldCompressResponse(req, res, compression.filter) }));
  app.get('/stream', (_req, res) => {
    beginSse(res);
    writeSse(res, { type: 'token', content: LARGE_TEXT });
    writeSse(res, { type: 'done' });
    endSse(res);
  });
  app.get('/json', (_req, res) => {
    res.json({ text: LARGE_TEXT });
  });
  return app;
}

describe('SSE transport helpers', () => {
  it('never compresses an event stream even when the client accepts gzip', async () => {
    const res = await request(buildApp())
      .get('/stream')
      .set('Accept-Encoding', 'gzip')
      .buffer(true)
      .parse((response, done) => {
        let body = '';
        response.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
        response.on('end', () => done(null, body));
      });

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.body).toBe(
      `data: ${JSON.stringify({ type: 'token', content: LARGE_TEXT })}\n\ndata: {"type":"done"}\n\n`,
    );
  });

  it('skips compression when the request asks for an event stream', async () => {
    const res = await request(buildApp())
      .get('/json')
      .set('Accept', 'text/event-stream')
      .set('Accept-Encoding', 'gzip');

    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('still compresses ordinary JSON responses', async () => {
    const res = await request(buildApp()).get('/json').set('Accept-Encoding', 'gzip');

    expect(res.headers['content-encoding']).toBe('gzip');
  });
});
