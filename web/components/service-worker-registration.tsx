'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error: unknown) => {
        // Installation remains optional: network requests must work without it.
        console.warn('Static asset cache registration failed', error)
      })
  }, [])

  return null
}
