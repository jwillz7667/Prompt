'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { enhancePromptStream } from '@/lib/api/prompts'
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import type { EnhanceRequest, EnhancementResult } from '@/lib/types/api'
import type { ToneType, OutputLength, PromptModality } from '@/lib/types/models'

interface EnhanceOptions {
  modality?: PromptModality
  tone?: ToneType
  length?: OutputLength
  customInstructions?: string
  deepThink?: boolean
  mode?: 'standard' | 'max'
}

interface EnhanceState {
  isEnhancing: boolean
  streamedContent: string
  result: EnhancementResult | null
  error: string | null
  warning: string | null
  progress: 'idle' | 'starting' | 'streaming' | 'completing' | 'done' | 'error'
}

export function useEnhance() {
  const [state, setState] = useState<EnhanceState>({
    isEnhancing: false,
    streamedContent: '',
    result: null,
    error: null,
    warning: null,
    progress: 'idle',
  })

  const abortRef = useRef<AbortController | null>(null)
  const { fetchSubscription } = useSubscriptionStore()
  const settings = useSettingsStore()
  useEffect(() => () => abortRef.current?.abort(), [])

  const enhance = useCallback(
    async (prompt: string, options: EnhanceOptions = {}) => {
      // Abort any existing enhancement
      if (abortRef.current) {
        abortRef.current.abort()
      }

      const controller = new AbortController()
      abortRef.current = controller

      setState({
        isEnhancing: true,
        streamedContent: '',
        result: null,
        error: null,
        warning: null,
        progress: 'starting',
      })

      const request: EnhanceRequest = {
        prompt,
        modality: options.modality ?? 'text',
        tone: options.tone ?? settings.selectedTone,
        length: options.length ?? settings.outputLength,
        model: settings.selectedModel,
        temperature: settings.temperature,
        customInstructions: options.customInstructions ?? settings.customInstructions,
        deepThink: options.deepThink ?? settings.deepThinkEnabled,
        targetCharacterLength: settings.targetCharacterLength,
        mode: options.mode,
        maxTokens: settings.maxTokens,
      }

      let content = ''
      try {
        let finalPrompt: EnhancementResult | null = null
        let warning: string | null = null

        for await (const event of enhancePromptStream(request, controller.signal)) {
          // Check for abort
          if (controller.signal.aborted || abortRef.current !== controller) {
            return null
          }

          switch (event.type) {
            case 'token':
              content += event.content || ''
              setState((prev) => ({
                ...prev,
                streamedContent: content,
                progress: 'streaming',
              }))
              break

            case 'complete':
              finalPrompt = event.prompt
              content = event.prompt.enhancedPrompt
              warning = event.warning ?? null
              setState((prev) => ({
                ...prev,
                progress: 'completing',
              }))
              break

            case 'error':
              throw new Error(event.message)
          }
        }

        if (controller.signal.aborted || abortRef.current !== controller) return null
        if (!finalPrompt) throw new Error('The connection ended before completion. Any text below may be incomplete and has not been confirmed as saved.')

        setState({
          isEnhancing: false,
          streamedContent: content,
          result: finalPrompt,
          error: null,
          warning,
          progress: 'done',
        })

        // A completed result must not wait on an unrelated usage refresh.
        void fetchSubscription()
        return finalPrompt
      } catch (err) {
        if (controller.signal.aborted || abortRef.current !== controller) return null
        const message = err instanceof Error ? err.message : 'Enhancement failed'
        setState({
          isEnhancing: false,
          streamedContent: content,
          result: null,
          error: message,
          warning: null,
          progress: 'error',
        })
        throw err
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [settings, fetchSubscription]
  )

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      setState((prev) => ({
        ...prev,
        isEnhancing: false,
        progress: 'idle',
      }))
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({
      isEnhancing: false,
      streamedContent: '',
      result: null,
      error: null,
      warning: null,
      progress: 'idle',
    })
  }, [])

  return {
    ...state,
    enhance,
    cancel,
    reset,
  }
}
