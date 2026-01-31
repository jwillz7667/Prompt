'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDeveloperAuthStore } from '@/lib/stores/developerAuthStore'
import { Eye, EyeOff, Check } from 'lucide-react'

export default function DeveloperSignupPage() {
  const router = useRouter()
  const { signup, isAuthenticated, isLoading, error, clearError, checkAuth } = useDeveloperAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

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
    setLocalError('')

    // Validate passwords match
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }

    // Validate password strength
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)

    const success = await signup(email, password, name || undefined, company || undefined)
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

  const displayError = localError || error

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Create Developer Account</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Get API access to enhance prompts programmatically
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 gap-2 text-sm">
        {[
          '100 free API requests per month',
          'Create and manage API keys',
          'Test in the interactive playground',
          'Monitor usage and billing',
        ].map((benefit, i) => (
          <div key={i} className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Check className="h-4 w-4 text-brand-cyan flex-shrink-0" />
            <span>{benefit}</span>
          </div>
        ))}
      </div>

      <Card variant="elevated">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {displayError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500">
                {displayError}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email <span className="text-red-500">*</span>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-2">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[var(--text-primary)] focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium mb-2">
                  Company
                </label>
                <input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[var(--text-primary)] focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  placeholder="Acme Inc."
                  autoComplete="organization"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 pr-12 text-[var(--text-primary)] focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[var(--text-primary)] focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                placeholder="Confirm your password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={submitting}
              disabled={submitting || !email || !password || !confirmPassword}
            >
              Create Account
            </Button>

            <p className="text-xs text-center text-[var(--text-tertiary)]">
              By signing up, you agree to our{' '}
              <Link href="/terms" className="text-brand-indigo hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-brand-indigo hover:underline">
                Privacy Policy
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>

      <div className="text-center text-sm">
        <p className="text-[var(--text-secondary)]">
          Already have a developer account?{' '}
          <Link href="/developers/login" className="text-brand-indigo hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
