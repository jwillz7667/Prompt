import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refreshToken')?.value

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401 }
      )
    }

    // Call backend refresh endpoint
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) {
        cookieStore.delete('refreshToken')
      }
      return NextResponse.json(
        { error: 'Refresh failed' },
        { status: response.status >= 500 || response.status === 429 ? response.status : 401 }
      )
    }

    const data = await response.json()

    // Update refresh token cookie
    cookieStore.set('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    // Return only short-lived access token; keep refresh token in HttpOnly cookie.
    return NextResponse.json({
      accessToken: data.accessToken,
      expiresIn: data.expiresIn,
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
