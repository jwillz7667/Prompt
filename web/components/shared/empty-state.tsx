'use client'

import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-4 py-16 text-center', className)}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}
