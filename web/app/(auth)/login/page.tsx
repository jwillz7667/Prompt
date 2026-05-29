'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/shared/logo'
import { useAuthStore } from '@/lib/stores/authStore'

export default function LoginPage() {
  const router = useRouter()
  const { setError, error, clearError } = useAuthStore()
  const [isLoading, setIsLoading] = useState<'apple' | 'google' | null>(null)

  const handleAppleSignIn = async () => {
    setIsLoading('apple')
    clearError()

    try {
      window.location.href = '/api/auth/oauth/start?provider=apple'
    } catch (err) {
      setError('Failed to initiate Apple Sign In')
      setIsLoading(null)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading('google')
    clearError()

    try {
      window.location.href = '/api/auth/oauth/start?provider=google'
    } catch (err) {
      setError('Failed to initiate Google Sign In')
      setIsLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <header className="text-center">
        <Link
          href="/"
          className="inline-block"
          aria-label="Go to Promptomize homepage"
        >
          <Logo size={56} className="rounded-2xl shadow-lg shadow-brand-indigo/30 mx-auto" priority />
        </Link>
        <h1 className="mt-4 text-2xl font-bold gradient-text">Welcome to Promptomize</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Sign in to enhance your AI prompts</p>
      </header>

      {/* Sign In Card */}
      <Card variant="elevated">
        <CardContent className="p-6 space-y-4">
          {error && (
            <div
              className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          {/* Apple Sign In */}
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-center gap-3 h-12"
            onClick={handleAppleSignIn}
            isLoading={isLoading === 'apple'}
            disabled={!!isLoading}
            aria-label="Sign in with Apple"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </Button>

          {/* Google Sign In */}
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-center gap-3 h-12"
            onClick={handleGoogleSignIn}
            isLoading={isLoading === 'google'}
            disabled={!!isLoading}
            aria-label="Sign in with Google"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[var(--bg-secondary)] px-2 text-[var(--text-tertiary)]">
                Secure authentication
              </span>
            </div>
          </div>

          <p className="text-center text-xs text-[var(--text-tertiary)]">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="text-brand-indigo hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-brand-indigo hover:underline">
              Privacy Policy
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Back to home */}
      <nav className="text-center text-sm text-[var(--text-secondary)]" aria-label="Secondary navigation">
        <Link href="/" className="text-brand-indigo hover:underline">
          Back to home
        </Link>
      </nav>
    </div>
  )
}
