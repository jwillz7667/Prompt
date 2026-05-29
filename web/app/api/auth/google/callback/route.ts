import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${error}`, request.url))
    }

    const cookieStore = await cookies()
    const expectedState = cookieStore.get('oauth_state_google')?.value
    if (!expectedState || !state || state !== expectedState) {
      cookieStore.delete('oauth_state_google')
      return NextResponse.redirect(new URL('/login?error=invalid_state', request.url))
    }
    cookieStore.delete('oauth_state_google')

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=no_code', request.url))
    }

    // Exchange code for tokens with Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${request.nextUrl.origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Google token exchange error:', error)
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.url))
    }

    const tokenData = await tokenResponse.json()
    const idToken = tokenData.id_token

    if (!idToken) {
      return NextResponse.redirect(new URL('/login?error=no_id_token', request.url))
    }

    // Send to backend
    const response = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        deviceInfo: {
          deviceName: 'Web Browser',
          deviceType: 'web',
          platform: 'web',
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Authentication failed' }))
      console.error('Google auth error:', error)
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message || 'auth_failed')}`, request.url))
    }

    const data = await response.json()

    // Set refresh token in HTTP-only cookie
    cookieStore.set('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    const redirectUrl = new URL('/dashboard', request.url)
    const redirect = NextResponse.redirect(redirectUrl)
    redirect.cookies.set('accessToken', data.accessToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60,
      path: '/',
    })
    redirect.cookies.set('tokenExpiresIn', data.expiresIn.toString(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60,
      path: '/',
    })
    return redirect
  } catch (error) {
    console.error('Google auth callback error:', error)
    return NextResponse.redirect(new URL('/login?error=server_error', request.url))
  }
}
