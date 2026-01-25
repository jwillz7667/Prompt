'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastContainer } from '@/components/ui/toast'
import { useSettingsStore, applyAppearanceMode } from '@/lib/stores/settingsStore'

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { appearanceMode } = useSettingsStore()

  useEffect(() => {
    applyAppearanceMode(appearanceMode)

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (appearanceMode === 'system') {
        applyAppearanceMode('system')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [appearanceMode])

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
        <ToastContainer />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
