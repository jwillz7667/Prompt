'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-indigo text-white hover:bg-brand-indigo-light focus-visible:ring-brand-indigo shadow-lg hover:shadow-xl hover:shadow-brand-indigo/25',
        secondary:
          'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-tertiary)] focus-visible:ring-brand-indigo',
        cyan:
          'bg-brand-cyan text-black hover:bg-brand-cyan-dark focus-visible:ring-brand-cyan shadow-lg hover:shadow-xl hover:shadow-brand-cyan/25',
        ghost:
          'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] focus-visible:ring-brand-indigo',
        danger:
          'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 shadow-lg hover:shadow-xl hover:shadow-red-500/25',
        link: 'text-brand-indigo underline-offset-4 hover:underline focus-visible:ring-brand-indigo',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-base',
        lg: 'h-13 px-7 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
