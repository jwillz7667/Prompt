'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Security constants
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d7487.up.railway.app/api/v1'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [apiKey, setApiKey] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState('')
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [lastActivity, setLastActivity] = useState(Date.now())
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Check for stored session on mount
  useEffect(() => {
    const storedKey = sessionStorage.getItem('adminApiKey')
    const storedExpiry = sessionStorage.getItem('adminSessionExpiry')
    const storedLockout = localStorage.getItem('adminLockoutUntil')
    const storedAttempts = localStorage.getItem('adminLoginAttempts')

    // Check lockout status
    if (storedLockout) {
      const lockoutTime = parseInt(storedLockout, 10)
      if (Date.now() < lockoutTime) {
        setLockoutUntil(lockoutTime)
      } else {
        localStorage.removeItem('adminLockoutUntil')
        localStorage.removeItem('adminLoginAttempts')
      }
    }

    if (storedAttempts) {
      setLoginAttempts(parseInt(storedAttempts, 10))
    }

    // Check session validity
    if (storedKey && storedExpiry) {
      const expiry = parseInt(storedExpiry, 10)
      if (Date.now() < expiry) {
        setApiKey(storedKey)
        setIsAuthenticated(true)
        setLastActivity(Date.now())
      } else {
        // Session expired
        handleLogout('Session expired. Please log in again.')
      }
    }
  }, [])

  // Activity monitoring for session timeout
  const resetActivityTimer = useCallback(() => {
    setLastActivity(Date.now())
    setShowTimeoutWarning(false)

    // Update session expiry
    if (isAuthenticated) {
      const newExpiry = Date.now() + SESSION_TIMEOUT_MS
      sessionStorage.setItem('adminSessionExpiry', newExpiry.toString())
    }

    // Clear existing timers
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current)
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)

    if (isAuthenticated) {
      // Show warning 2 minutes before timeout
      warningTimeoutRef.current = setTimeout(
        () => {
          setShowTimeoutWarning(true)
        },
        SESSION_TIMEOUT_MS - 2 * 60 * 1000,
      )

      // Auto-logout on timeout
      activityTimeoutRef.current = setTimeout(() => {
        handleLogout('Session timed out due to inactivity.')
      }, SESSION_TIMEOUT_MS)
    }
  }, [isAuthenticated])

  // Set up activity listeners
  useEffect(() => {
    if (isAuthenticated) {
      const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

      const handleActivity = () => resetActivityTimer()

      events.forEach((event) => {
        document.addEventListener(event, handleActivity, { passive: true })
      })

      resetActivityTimer()

      return () => {
        events.forEach((event) => {
          document.removeEventListener(event, handleActivity)
        })
        if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current)
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)
      }
    }
  }, [isAuthenticated, resetActivityTimer])

  // Validate API key against backend
  const validateApiKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/admin/tickets?limit=1`, {
        method: 'GET',
        headers: {
          'X-Admin-API-Key': key,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingMinutes = Math.ceil((lockoutUntil - Date.now()) / 60000)
      setError(`Too many failed attempts. Please try again in ${remainingMinutes} minute(s).`)
      return
    }

    if (!apiKey.trim()) {
      setError('Please enter an API key')
      return
    }

    // Validate minimum key length
    if (apiKey.trim().length < 32) {
      setError('Invalid API key format')
      recordFailedAttempt()
      return
    }

    setIsValidating(true)
    setError('')

    try {
      const isValid = await validateApiKey(apiKey.trim())

      if (isValid) {
        // Success - clear attempts and set session
        localStorage.removeItem('adminLoginAttempts')
        localStorage.removeItem('adminLockoutUntil')
        setLoginAttempts(0)

        const sessionExpiry = Date.now() + SESSION_TIMEOUT_MS
        sessionStorage.setItem('adminApiKey', apiKey.trim())
        sessionStorage.setItem('adminSessionExpiry', sessionExpiry.toString())
        sessionStorage.setItem('adminLoginTime', new Date().toISOString())

        setIsAuthenticated(true)
        setLastActivity(Date.now())
      } else {
        setError('Invalid API key')
        recordFailedAttempt()
      }
    } catch {
      setError('Failed to validate API key. Please try again.')
    } finally {
      setIsValidating(false)
    }
  }

  const recordFailedAttempt = () => {
    const newAttempts = loginAttempts + 1
    setLoginAttempts(newAttempts)
    localStorage.setItem('adminLoginAttempts', newAttempts.toString())

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockoutTime = Date.now() + LOCKOUT_DURATION_MS
      setLockoutUntil(lockoutTime)
      localStorage.setItem('adminLockoutUntil', lockoutTime.toString())
      setError(`Too many failed attempts. Locked out for 15 minutes.`)
    }
  }

  const handleLogout = (message?: string) => {
    sessionStorage.removeItem('adminApiKey')
    sessionStorage.removeItem('adminSessionExpiry')
    sessionStorage.removeItem('adminLoginTime')
    setApiKey('')
    setIsAuthenticated(false)
    setShowTimeoutWarning(false)
    if (message) {
      setError(message)
    }
  }

  const extendSession = () => {
    resetActivityTimer()
    setShowTimeoutWarning(false)
  }

  // Lockout countdown
  const [lockoutRemaining, setLockoutRemaining] = useState('')
  useEffect(() => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const interval = setInterval(() => {
        const remaining = lockoutUntil - Date.now()
        if (remaining <= 0) {
          setLockoutUntil(null)
          localStorage.removeItem('adminLockoutUntil')
          localStorage.removeItem('adminLoginAttempts')
          setLoginAttempts(0)
          setLockoutRemaining('')
        } else {
          const minutes = Math.floor(remaining / 60000)
          const seconds = Math.floor((remaining % 60000) / 1000)
          setLockoutRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`)
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [lockoutUntil])

  if (!isAuthenticated) {
    const isLockedOut = lockoutUntil && Date.now() < lockoutUntil

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-8 shadow-xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-600/20">
                <svg
                  className="h-8 w-8 text-cyan-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-white">Admin Access</h1>
              <p className="text-gray-400">Secure authentication required</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="mb-2 block text-sm font-medium text-gray-300">
                  Admin API Key
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API key..."
                  disabled={isLockedOut || isValidating}
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 outline-none transition focus:border-transparent focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <svg
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {isLockedOut && (
                <div className="py-2 text-center">
                  <p className="text-sm text-gray-400">Lockout expires in</p>
                  <p className="font-mono text-2xl text-white">{lockoutRemaining}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLockedOut || isValidating}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500"
              >
                {isValidating ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Validating...
                  </>
                ) : (
                  'Access Admin Panel'
                )}
              </button>

              {loginAttempts > 0 && loginAttempts < MAX_LOGIN_ATTEMPTS && (
                <p className="text-center text-xs text-gray-500">
                  {MAX_LOGIN_ATTEMPTS - loginAttempts} attempt(s) remaining
                </p>
              )}
            </form>

            <div className="mt-6 border-t border-gray-700 pt-6">
              <p className="text-center text-xs text-gray-500">
                This is a secure admin area. All access attempts are logged.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Session timeout warning */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/20">
                <svg
                  className="h-6 w-6 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">Session Expiring</h3>
              <p className="mb-6 text-gray-400">
                Your session will expire in 2 minutes due to inactivity.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleLogout()}
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-white transition hover:bg-gray-600"
                >
                  Logout
                </button>
                <button
                  onClick={extendSession}
                  className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white transition hover:bg-cyan-500"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-700 bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/admin" className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">Promptomize</span>
                <span className="rounded bg-cyan-600 px-2 py-0.5 text-xs font-medium text-white">
                  Admin
                </span>
              </Link>

              <nav className="flex items-center gap-1">
                <Link
                  href="/admin/tickets"
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    pathname?.startsWith('/admin/tickets')
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                  }`}
                >
                  Support Tickets
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 text-xs text-gray-500 sm:flex">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                Secure Session
              </div>
              <button
                onClick={() => handleLogout()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-gray-700/50 hover:text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
