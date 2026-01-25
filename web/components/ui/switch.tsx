'use client'

import { cn } from '@/lib/utils/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className,
}: SwitchProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 cursor-pointer',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:ring-offset-2',
          checked ? 'bg-brand-indigo' : 'bg-[var(--border)]'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
          )}
          {description && (
            <span className="text-xs text-[var(--text-tertiary)]">{description}</span>
          )}
        </div>
      )}
    </label>
  )
}
