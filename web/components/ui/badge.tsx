'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
        primary: 'bg-brand-indigo/10 text-brand-indigo',
        cyan: 'bg-brand-cyan/10 text-brand-cyan',
        success: 'bg-green-500/10 text-green-600 dark:text-green-400',
        warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
        danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
        outline: 'border border-[var(--border)] text-[var(--text-secondary)]',
        pro: 'bg-gradient-to-r from-brand-indigo to-brand-indigo-light text-white',
        premium: 'bg-gradient-to-r from-brand-indigo via-brand-cyan to-brand-cyan text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
