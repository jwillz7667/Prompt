'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useSettingsStore, applyAppearanceMode } from '@/lib/stores/settingsStore'
import { cn } from '@/lib/utils/cn'
import type { AppearanceMode } from '@/lib/types/models'

const modes: { value: AppearanceMode; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

export function ThemeToggle() {
  const { appearanceMode, setAppearance } = useSettingsStore()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const cycleTheme = () => {
    const currentIndex = modes.findIndex((m) => m.value === appearanceMode)
    const nextIndex = (currentIndex + 1) % modes.length
    const nextMode = modes[nextIndex].value
    setAppearance(nextMode)
    applyAppearanceMode(nextMode)
  }

  if (!mounted) {
    return (
      <button
        className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        aria-label="Toggle theme"
      >
        <Moon className="h-5 w-5" />
      </button>
    )
  }

  const currentMode = modes.find((m) => m.value === appearanceMode) || modes[0]
  const Icon = currentMode.icon

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
        'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
      )}
      aria-label={`Current theme: ${currentMode.label}. Click to change.`}
      title={`Theme: ${currentMode.label}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
