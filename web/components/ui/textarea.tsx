'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  charCount?: boolean
  maxLength?: number
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, charCount, maxLength, value, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const currentLength = typeof value === 'string' ? value.length : 0

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <textarea
            id={textareaId}
            value={value}
            maxLength={maxLength}
            className={cn(
              'flex min-h-[120px] w-full rounded-xl border bg-[var(--bg-secondary)] px-4 py-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors resize-none',
              'border-[var(--border)] focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/20',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className
            )}
            ref={ref}
            {...props}
          />
          {charCount && maxLength && (
            <div className="absolute bottom-2 right-3 text-xs text-[var(--text-tertiary)]">
              {currentLength}/{maxLength}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">{hint}</p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
