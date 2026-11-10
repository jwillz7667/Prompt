import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface WorkerEvent {
  request?: Request
  respondWith?: (response: Promise<unknown>) => void
  waitUntil?: (completion: Promise<void>) => void
}

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

function worker() {
  const listeners: Record<string, (event: WorkerEvent) => void> = {}
  const response = {
    ok: true,
    type: 'basic',
    headers: new Headers({ 'cache-control': 'public, max-age=31536000, immutable' }),
    clone() {
      return this
    },
  }
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  }
  const fetch = vi.fn().mockResolvedValue(response)
  runInNewContext(source, {
    URL,
    caches,
    fetch,
    self: {
      location: { origin: 'https://promptomize.app' },
      addEventListener: (type: string, callback: (event: WorkerEvent) => void) => {
        listeners[type] = callback
      },
      skipWaiting: vi.fn().mockResolvedValue(undefined),
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
    },
  })
  async function request(url: string, options?: RequestInit) {
    let result: Promise<unknown> | undefined
    listeners.fetch({
      request: new Request(url, options),
      respondWith: (promise: Promise<unknown>) => {
        result = promise
      },
    })
    return result
  }
  return { listeners, response, cache, caches, fetch, request }
}

describe('service worker privacy boundary', () => {
  it('never intercepts account pages, API data, third-party URLs, or authorized requests', async () => {
    const sw = worker()
    for (const path of [
      '/dashboard',
      '/api/auth/refresh',
      '/api/v1/prompts',
      '/_next/data/build/dashboard.json',
    ]) {
      expect(await sw.request(`https://promptomize.app${path}`)).toBeUndefined()
    }
    expect(await sw.request('https://other.example/_next/static/chunk.js')).toBeUndefined()
    expect(
      await sw.request('https://promptomize.app/_next/static/chunk.js', {
        headers: { Authorization: 'Bearer test' },
      }),
    ).toBeUndefined()
    expect(
      await sw.request('https://promptomize.app/_next/static/chunk.js', { method: 'POST' }),
    ).toBeUndefined()
    expect(sw.caches.open).not.toHaveBeenCalled()
    expect(sw.fetch).not.toHaveBeenCalled()
  })

  it('caches only successful immutable public static assets', async () => {
    const sw = worker()
    expect(await sw.request('https://promptomize.app/_next/static/chunks/abc.js')).toBe(sw.response)
    expect(sw.cache.put).toHaveBeenCalledOnce()
    sw.cache.put.mockClear()
    sw.response.headers.set('cache-control', 'private, immutable')
    await sw.request('https://promptomize.app/_next/static/chunks/private.js')
    expect(sw.cache.put).not.toHaveBeenCalled()
  })

  it('keeps network requests working when cache storage is unavailable', async () => {
    const sw = worker()
    sw.caches.open.mockRejectedValue(new Error('storage unavailable'))
    expect(await sw.request('https://promptomize.app/_next/static/chunks/abc.js')).toBe(sw.response)
    expect(sw.fetch).toHaveBeenCalledOnce()
  })

  it('removes legacy PWA caches without removing unrelated application caches', async () => {
    const sw = worker()
    sw.caches.keys.mockResolvedValue([
      'workbox-precache-v2-https://promptomize.app/',
      'static-js-assets',
      'promptomize-static-v1',
      'unrelated-cache',
    ])
    let completed: Promise<void> | undefined
    sw.listeners.activate({
      waitUntil: (promise: Promise<void>) => {
        completed = promise
      },
    })
    await completed
    expect(sw.caches.delete.mock.calls.map(([name]) => name)).toEqual([
      'workbox-precache-v2-https://promptomize.app/',
      'static-js-assets',
    ])
  })
})
