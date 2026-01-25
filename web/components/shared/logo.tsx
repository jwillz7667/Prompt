'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useSettingsStore } from '@/lib/stores/settingsStore'

interface LogoProps {
  className?: string
  size?: number
  priority?: boolean
  /** Force a specific variant regardless of theme */
  variant?: 'dark' | 'light' | 'auto'
}

/**
 * Logo component that automatically switches between dark and light variants
 * based on the current theme setting.
 *
 * - logo.png: Cyan/teal stars for dark backgrounds
 * - logo-light.png: Purple stars for light backgrounds
 */
export function Logo({
  className = '',
  size = 40,
  priority = false,
  variant = 'auto'
}: LogoProps) {
  const { appearanceMode } = useSettingsStore()
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    if (variant !== 'auto') {
      setIsDark(variant === 'dark')
      return
    }

    const checkDarkMode = () => {
      if (appearanceMode === 'dark') {
        setIsDark(true)
      } else if (appearanceMode === 'light') {
        setIsDark(false)
      } else {
        // System preference
        setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    }

    checkDarkMode()

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (appearanceMode === 'system') {
        checkDarkMode()
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [appearanceMode, variant])

  return (
    <Image
      src={isDark ? '/logo.png' : '/logo-light.png'}
      alt="Promptomize"
      width={size}
      height={size}
      className={className}
      priority={priority}
    />
  )
}

/**
 * Logo with text branding
 */
export function LogoBrand({
  size = 40,
  showText = true,
  className = '',
  textClassName = 'text-lg font-bold gradient-text'
}: LogoProps & { showText?: boolean; textClassName?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Logo size={size} />
      {showText && (
        <span className={textClassName}>Promptomize</span>
      )}
    </div>
  )
}
