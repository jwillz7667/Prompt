'use client'

import { cn } from '@/lib/utils/cn'
import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
  className?: string
  fullScreen?: boolean
}

export function LoadingState({ message = 'Loading...', className, fullScreen = false }: LoadingStateProps) {
  const content = (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-[var(--border)]" />
        <Loader2 className="absolute inset-0 h-12 w-12 animate-spin text-brand-indigo" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{message}</p>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-primary)]">
        {content}
      </div>
    )
  }

  return content
}

export function PageLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <LoadingState />
    </div>
  )
}

export function InlineLoading({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-brand-indigo" />
    </div>
  )
}
