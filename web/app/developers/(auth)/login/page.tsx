'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDeveloperAuthStore } from '@/lib/stores/developerAuthStore'
import { Eye, EyeOff } from 'lucide-react'

export default function DeveloperLoginPage() {
  const router = useRouter()
  const { login, isAuthenticated, isLoading, error, clearError, checkAuth } = useDeveloperAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Check if already authenticated
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Redirect if authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/developers')
    }
  }, [isAuthenticated, isLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setSubmitting(true)

    const success = await login(email, password)
    if (success) {
      router.push('/developers')
    }

    setSubmitting(false)
  }

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-indigo" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Developer Sign In</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Access the API and developer tools
        </p>
      </div>

      <Card variant="elevated">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[var(--text-primary)] focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                placeholder="developer@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 pr-12 text-[var(--text-primary)] focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={submitting}
              disabled={submitting || !email || !password}
            >
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="text-center text-sm">
        <p className="text-[var(--text-secondary)]">
          Don&apos;t have a developer account?{' '}
          <Link href="/developers/signup" className="text-brand-indigo hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
