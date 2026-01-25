'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button onClick={this.handleReset} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Try Again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

// Functional error display component
interface ErrorDisplayProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorDisplay({
  title = 'Something went wrong',
  message = 'An unexpected error occurred',
  onRetry,
}: ErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{title}</h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Try Again
        </Button>
      )}
    </div>
  )
}
