'use client'

import { useCallback, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface CopyablePromptProps {
  text: string
}

export function CopyablePrompt({ text }: CopyablePromptProps) {
  const [hasCopied, setHasCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setHasCopied(true)
      if (resetTimer.current) {
        clearTimeout(resetTimer.current)
      }
      resetTimer.current = setTimeout(() => setHasCopied(false), 2000)
    } catch {
      // Clipboard access can be denied (insecure context, permissions). The
      // prompt text remains selectable, so we fail silently rather than alarm.
    }
  }, [text])

  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={hasCopied ? 'Copied to clipboard' : 'Copy enhanced prompt'}
        className={cn(
          'absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
          hasCopied
            ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-brand-indigo/40'
        )}
      >
        {hasCopied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </>
        )}
      </button>

      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words px-5 py-5 pr-24 font-sans text-[15px] leading-relaxed text-[var(--text-primary)]">
        {text}
      </pre>
    </div>
  )
}
