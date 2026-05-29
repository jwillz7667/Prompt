import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type OAuthProvider = 'apple' | 'google'

const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60

function isOAuthProvider(value: string | null): value is OAuthProvider {
  return value === 'apple' || value === 'google'
}

function createState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

function sameSiteForOAuth(provider: OAuthProvider): 'lax' | 'none' {
  // Apple uses form_post from appleid.apple.com; SameSite=Lax is not sent on cross-site POST.
  return provider === 'apple' && process.env.NODE_ENV === 'production' ? 'none' : 'lax'
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider')
  if (!isOAuthProvider(provider)) {
    return NextResponse.redirect(new URL('/login?error=invalid_provider', request.url))
  }

  const state = createState()
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/auth/${provider}/callback`
  const response = NextResponse.redirect(buildAuthorizationUrl(provider, redirectUri, state))

  response.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSiteForOAuth(provider),
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: '/',
  })

  return response
}

function buildAuthorizationUrl(provider: OAuthProvider, redirectUri: string, state: string): URL {
  if (provider === 'apple') {
    const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || 'com.res.promptomize.webapp'
    const url = new URL('https://appleid.apple.com/auth/authorize')
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code id_token',
      scope: 'name email',
      response_mode: 'form_post',
      state,
    }).toString()
    return url
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
  }).toString()
  return url
}
