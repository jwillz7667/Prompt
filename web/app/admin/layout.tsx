'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Security constants
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [apiKey, setApiKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for stored session on mount
  useEffect(() => {
    const storedKey = sessionStorage.getItem('adminApiKey');
    const storedExpiry = sessionStorage.getItem('adminSessionExpiry');
    const storedLockout = localStorage.getItem('adminLockoutUntil');
    const storedAttempts = localStorage.getItem('adminLoginAttempts');

    // Check lockout status
    if (storedLockout) {
      const lockoutTime = parseInt(storedLockout, 10);
      if (Date.now() < lockoutTime) {
        setLockoutUntil(lockoutTime);
      } else {
        localStorage.removeItem('adminLockoutUntil');
        localStorage.removeItem('adminLoginAttempts');
      }
    }

    if (storedAttempts) {
      setLoginAttempts(parseInt(storedAttempts, 10));
    }

    // Check session validity
    if (storedKey && storedExpiry) {
      const expiry = parseInt(storedExpiry, 10);
      if (Date.now() < expiry) {
        setApiKey(storedKey);
        setIsAuthenticated(true);
        setLastActivity(Date.now());
      } else {
        // Session expired
        handleLogout('Session expired. Please log in again.');
      }
    }
  }, []);

  // Activity monitoring for session timeout
  const resetActivityTimer = useCallback(() => {
    setLastActivity(Date.now());
    setShowTimeoutWarning(false);

    // Update session expiry
    if (isAuthenticated) {
      const newExpiry = Date.now() + SESSION_TIMEOUT_MS;
      sessionStorage.setItem('adminSessionExpiry', newExpiry.toString());
    }

    // Clear existing timers
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);

    if (isAuthenticated) {
      // Show warning 2 minutes before timeout
      warningTimeoutRef.current = setTimeout(() => {
        setShowTimeoutWarning(true);
      }, SESSION_TIMEOUT_MS - 2 * 60 * 1000);

      // Auto-logout on timeout
      activityTimeoutRef.current = setTimeout(() => {
        handleLogout('Session timed out due to inactivity.');
      }, SESSION_TIMEOUT_MS);
    }
  }, [isAuthenticated]);

  // Set up activity listeners
  useEffect(() => {
    if (isAuthenticated) {
      const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

      const handleActivity = () => resetActivityTimer();

      events.forEach(event => {
        document.addEventListener(event, handleActivity, { passive: true });
      });

      resetActivityTimer();

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, handleActivity);
        });
        if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      };
    }
  }, [isAuthenticated, resetActivityTimer]);

  // Validate API key against backend
  const validateApiKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/admin/tickets?limit=1`, {
        method: 'GET',
        headers: {
          'X-Admin-API-Key': key,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingMinutes = Math.ceil((lockoutUntil - Date.now()) / 60000);
      setError(`Too many failed attempts. Please try again in ${remainingMinutes} minute(s).`);
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    // Validate minimum key length
    if (apiKey.trim().length < 32) {
      setError('Invalid API key format');
      recordFailedAttempt();
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const isValid = await validateApiKey(apiKey.trim());

      if (isValid) {
        // Success - clear attempts and set session
        localStorage.removeItem('adminLoginAttempts');
        localStorage.removeItem('adminLockoutUntil');
        setLoginAttempts(0);

        const sessionExpiry = Date.now() + SESSION_TIMEOUT_MS;
        sessionStorage.setItem('adminApiKey', apiKey.trim());
        sessionStorage.setItem('adminSessionExpiry', sessionExpiry.toString());
        sessionStorage.setItem('adminLoginTime', new Date().toISOString());

        setIsAuthenticated(true);
        setLastActivity(Date.now());
      } else {
        setError('Invalid API key');
        recordFailedAttempt();
      }
    } catch {
      setError('Failed to validate API key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const recordFailedAttempt = () => {
    const newAttempts = loginAttempts + 1;
    setLoginAttempts(newAttempts);
    localStorage.setItem('adminLoginAttempts', newAttempts.toString());

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
      setLockoutUntil(lockoutTime);
      localStorage.setItem('adminLockoutUntil', lockoutTime.toString());
      setError(`Too many failed attempts. Locked out for 15 minutes.`);
    }
  };

  const handleLogout = (message?: string) => {
    sessionStorage.removeItem('adminApiKey');
    sessionStorage.removeItem('adminSessionExpiry');
    sessionStorage.removeItem('adminLoginTime');
    setApiKey('');
    setIsAuthenticated(false);
    setShowTimeoutWarning(false);
    if (message) {
      setError(message);
    }
  };

  const extendSession = () => {
    resetActivityTimer();
    setShowTimeoutWarning(false);
  };

  // Lockout countdown
  const [lockoutRemaining, setLockoutRemaining] = useState('');
  useEffect(() => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const interval = setInterval(() => {
        const remaining = lockoutUntil - Date.now();
        if (remaining <= 0) {
          setLockoutUntil(null);
          localStorage.removeItem('adminLockoutUntil');
          localStorage.removeItem('adminLoginAttempts');
          setLoginAttempts(0);
          setLockoutRemaining('');
        } else {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setLockoutRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lockoutUntil]);

  if (!isAuthenticated) {
    const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-2xl p-8 shadow-xl border border-gray-700">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-cyan-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
              <p className="text-gray-400">Secure authentication required</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
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
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition disabled:opacity-50"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {isLockedOut && (
                <div className="text-center py-2">
                  <p className="text-gray-400 text-sm">Lockout expires in</p>
                  <p className="text-2xl font-mono text-white">{lockoutRemaining}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLockedOut || isValidating}
                className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
              >
                {isValidating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Validating...
                  </>
                ) : (
                  'Access Admin Panel'
                )}
              </button>

              {loginAttempts > 0 && loginAttempts < MAX_LOGIN_ATTEMPTS && (
                <p className="text-center text-gray-500 text-xs">
                  {MAX_LOGIN_ATTEMPTS - loginAttempts} attempt(s) remaining
                </p>
              )}
            </form>

            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-gray-500 text-xs text-center">
                This is a secure admin area. All access attempts are logged.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Session timeout warning */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700 shadow-2xl">
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Session Expiring</h3>
              <p className="text-gray-400 mb-6">
                Your session will expire in 2 minutes due to inactivity.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleLogout()}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                >
                  Logout
                </button>
                <button
                  onClick={extendSession}
                  className="flex-1 py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/admin" className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">Promptomize</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-cyan-600 text-white rounded">
                  Admin
                </span>
              </Link>

              <nav className="flex items-center gap-1">
                <Link
                  href="/admin/tickets"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    pathname?.startsWith('/admin/tickets')
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  Support Tickets
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Secure Session
              </div>
              <button
                onClick={() => handleLogout()}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
