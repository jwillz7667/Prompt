'use client'

import { forwardRef, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils/cn'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
}

interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  error?: string
  disabled?: boolean
  className?: string
}

const Select = forwardRef<HTMLDivElement, SelectProps>(
  ({ options, value, onChange, placeholder = 'Select...', label, error, disabled, className }, ref) => {
    const [isOpen, setIsOpen] = useState(false)
    const selectRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find((opt) => opt.value === value)

    // Close on outside click
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
          setIsOpen(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Close on escape
    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false)
      }

      if (isOpen) {
        document.addEventListener('keydown', handleEscape)
      }
      return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen])

    return (
      <div ref={ref} className={cn('relative w-full', className)}>
        {label && (
          <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <div ref={selectRef}>
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className={cn(
              'flex h-11 w-full items-center justify-between rounded-xl border bg-[var(--bg-secondary)] px-4 py-2 text-left',
              'border-[var(--border)] transition-colors',
              'focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/20',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isOpen && 'border-brand-indigo ring-2 ring-brand-indigo/20',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            )}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span className={cn('truncate', !selectedOption && 'text-[var(--text-tertiary)]')}>
              {selectedOption ? (
                <span className="flex items-center gap-2">
                  {selectedOption.icon}
                  {selectedOption.label}
                </span>
              ) : (
                placeholder
              )}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>

          {isOpen && (
            <div
              className={cn(
                'absolute z-50 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg',
                'animate-in fade-in-0 zoom-in-95 duration-150'
              )}
              role="listbox"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (!option.disabled) {
                      onChange(option.value)
                      setIsOpen(false)
                    }
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors',
                    'hover:bg-[var(--bg-tertiary)]',
                    option.disabled && 'cursor-not-allowed opacity-50',
                    option.value === value && 'bg-brand-indigo/5'
                  )}
                  role="option"
                  aria-selected={option.value === value}
                >
                  {option.icon}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {option.label}
                    </div>
                    {option.description && (
                      <div className="text-xs text-[var(--text-tertiary)] truncate">
                        {option.description}
                      </div>
                    )}
                  </div>
                  {option.value === value && (
                    <Check className="h-4 w-4 text-brand-indigo flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
