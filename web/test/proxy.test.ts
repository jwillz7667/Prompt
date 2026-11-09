import { expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

it('keeps login reachable when an unverified refresh cookie exists', () => {
  const response = proxy(new NextRequest('https://app.test/login', { headers: { cookie: 'refreshToken=expired' } }))
  expect(response.headers.get('location')).toBeNull()
})
it('continues protecting the dashboard without a session cookie', () => {
  const response = proxy(new NextRequest('https://app.test/dashboard'))
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe('https://app.test/login?redirect=%2Fdashboard')
})
