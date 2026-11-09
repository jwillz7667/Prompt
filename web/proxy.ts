import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/history',
  '/templates',
  '/collections',
  '/analytics',
  '/settings',
  '/profile',
  '/upgrade',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host')

  if (host === 'www.promptomize.app') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.hostname = 'promptomize.app'
    return NextResponse.redirect(redirectUrl, 308)
  }

  // Check for access token in sessionStorage is done client-side
  // Here we just check for refresh token cookie as a secondary indicator
  const refreshToken = request.cookies.get('refreshToken')?.value

  // Check if this is a protected route
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  // For protected routes without refresh token, redirect to login
  // Note: Full auth check happens client-side with access token
  if (isProtectedRoute && !refreshToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // A cookie's presence does not prove that it is valid. Keep login reachable
  // during expiration or backend outages instead of bouncing in a redirect loop.
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
}
