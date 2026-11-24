'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Modal, ModalFooter } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { grantAiConsent } from '@/lib/api/users'

interface AiConsentDialogProps {
  /** The disclosure version the backend asked for; null keeps the dialog closed. */
  requiredVersion: number | null
  onConsented: () => void
  onDismiss: () => void
}

/**
 * Asks for the account-level AI data-sharing consent the backend requires
 * (403 AI_CONSENT_REQUIRED) and records it, so the rejected request can run
 * again. The same consent covers the iOS app.
 */
export function AiConsentDialog({ requiredVersion, onConsented, onDismiss }: AiConsentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const handleDismiss = () => {
    if (isSubmitting) return
    setFailure(null)
    onDismiss()
  }

  const handleAgree = async () => {
    if (requiredVersion === null) return
    setIsSubmitting(true)
    setFailure(null)
    try {
      await grantAiConsent(requiredVersion)
      onConsented()
    } catch {
      setFailure('We could not save your choice. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={requiredVersion !== null}
      onClose={handleDismiss}
      title="How your prompts are processed"
      size="md"
    >
      <div className="space-y-3 text-sm text-[var(--text-secondary)]">
        <p>
          To generate responses, Promptomize sends your prompts, chat messages and any images you
          attach to third-party AI service providers that process them on our behalf.
        </p>
        <p>
          This choice applies to your account. You can withdraw it at any time in the Promptomize
          iOS app under Profile. Read the{' '}
          <Link href="/privacy" className="text-brand-indigo underline-offset-4 hover:underline">
            Privacy Policy
          </Link>{' '}
          for details.
        </p>
        {failure && (
          <p role="alert" className="text-red-500">
            {failure}
          </p>
        )}
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={handleDismiss} disabled={isSubmitting}>
          Not now
        </Button>
        <Button onClick={() => void handleAgree()} isLoading={isSubmitting}>
          Agree and continue
        </Button>
      </ModalFooter>
    </Modal>
  )
}
