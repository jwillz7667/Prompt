import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const code = formData.get('code') as string
    const idToken = formData.get('id_token') as string
    const state = formData.get('state') as string
    const userJson = formData.get('user') as string | null

    if (!code || !idToken) {
      // Use 303 to convert POST to GET
      return NextResponse.redirect(new URL('/login?error=invalid_response', request.url), 303)
    }

    // Parse user info if provided (first-time sign in)
    let fullName: { givenName?: string; familyName?: string } | undefined
    if (userJson) {
      try {
        const user = JSON.parse(userJson)
        fullName = user.name
      } catch {
        // Ignore parse errors
      }
    }

    // Send to backend
    const response = await fetch(`${API_BASE_URL}/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: idToken,
        authorizationCode: code,
        fullName,
        deviceInfo: {
          deviceName: 'Web Browser',
          deviceType: 'web',
          platform: 'web',
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Authentication failed' }))
      console.error('Apple auth error:', error)
      // Use 303 to convert POST to GET
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message || 'auth_failed')}`, request.url), 303)
    }

    const data = await response.json()

    // Set tokens in cookies
    const cookieStore = await cookies()

    // Access token in session storage (handled by client)
    // Refresh token in HTTP-only cookie
    cookieStore.set('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    // Redirect to dashboard with tokens in URL (to be captured by client)
    // Use 303 to convert POST to GET
    const redirectUrl = new URL('/dashboard', request.url)
    redirectUrl.searchParams.set('token', data.accessToken)
    redirectUrl.searchParams.set('expiresIn', data.expiresIn.toString())

    return NextResponse.redirect(redirectUrl, 303)
  } catch (error) {
    console.error('Apple auth callback error:', error)
    // Use 303 to convert POST to GET
    return NextResponse.redirect(new URL('/login?error=server_error', request.url), 303)
  }
}

export async function GET(request: NextRequest) {
  // Handle GET redirects (shouldn't happen normally)
  return NextResponse.redirect(new URL('/login', request.url))
}
