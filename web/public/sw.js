// Public, content-hashed assets only. Navigation, auth, prompts, and API
// responses always use the network, so no account data enters this cache.
const CACHE_NAME = 'promptomize-static-v1'
const MAX_ASSETS = 120
const LEGACY_CACHES = new Set([
  'google-fonts-webfonts', 'google-fonts-stylesheets', 'static-font-assets',
  'static-image-assets', 'next-static-js-assets', 'static-audio-assets',
  'static-video-assets', 'static-js-assets', 'static-style-assets',
])

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) =>
      name !== CACHE_NAME && (name.startsWith('promptomize-static-') ||
        name.startsWith('workbox-precache-') || LEGACY_CACHES.has(name))
    ).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.mode === 'navigate' ||
      request.headers.has('authorization') || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/_next/static/') ||
      !/\.(?:js|css|woff2?)$/.test(url.pathname)) return

  event.respondWith((async () => {
    let cache
    try {
      cache = await caches.open(CACHE_NAME)
      const existing = await cache.match(request)
      if (existing) return existing
    } catch {
      return fetch(request)
    }

    const response = await fetch(request)
    const policy = response.headers.get('cache-control') || ''
    if (response.ok && response.type === 'basic' &&
        /\bimmutable\b/i.test(policy) && !/\b(?:private|no-store)\b/i.test(policy)) {
      // Cache storage may be unavailable/full; it must not break online use.
      try {
        await cache.put(request, response.clone())
        const keys = await cache.keys()
        await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))
          .map((key) => cache.delete(key)))
      } catch { /* The successful network response is still usable. */ }
    }
    return response
  })())
})
