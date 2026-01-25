'use client'

import { cn } from '@/lib/utils/cn'
import { useUIStore, type ToastType } from '@/lib/stores/uiStore'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
}

const toastStyles: Record<ToastType, string> = {
  success: 'border-green-500/20 bg-green-500/10',
  error: 'border-red-500/20 bg-red-500/10',
  info: 'border-blue-500/20 bg-blue-500/10',
  warning: 'border-yellow-500/20 bg-yellow-500/10',
}

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-sm',
            'animate-in slide-in-from-right-full duration-300',
            'min-w-[300px] max-w-[420px]',
            toastStyles[toast.type]
          )}
          role="alert"
        >
          <div className="flex-shrink-0">{toastIcons[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--text-primary)]">{toast.title}</p>
            {toast.message && (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{toast.message}</p>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
