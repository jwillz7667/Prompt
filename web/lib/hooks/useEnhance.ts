'use client'

import { useState, useCallback, useRef } from 'react'
import { enhancePromptStream } from '@/lib/api/prompts'
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import type { EnhanceRequest, StreamEvent } from '@/lib/types/api'
import type { Prompt, ToneType, OutputLength } from '@/lib/types/models'

interface EnhanceOptions {
  tone?: ToneType
  outputLength?: OutputLength
  customInstructions?: string
  deepThink?: boolean
}

interface EnhanceState {
  isEnhancing: boolean
  streamedContent: string
  result: Prompt | null
  error: string | null
  progress: 'idle' | 'starting' | 'streaming' | 'completing' | 'done' | 'error'
}

export function useEnhance() {
  const [state, setState] = useState<EnhanceState>({
    isEnhancing: false,
    streamedContent: '',
    result: null,
    error: null,
    progress: 'idle',
  })

  const abortRef = useRef<AbortController | null>(null)
  const { fetchSubscription } = useSubscriptionStore()
  const settings = useSettingsStore()

  const enhance = useCallback(
    async (prompt: string, options: EnhanceOptions = {}) => {
      // Abort any existing enhancement
      if (abortRef.current) {
        abortRef.current.abort()
      }

      abortRef.current = new AbortController()

      setState({
        isEnhancing: true,
        streamedContent: '',
        result: null,
        error: null,
        progress: 'starting',
      })

      const request: EnhanceRequest = {
        prompt,
        tone: options.tone ?? settings.selectedTone,
        outputLength: options.outputLength ?? settings.outputLength,
        model: settings.selectedModel,
        temperature: settings.temperature,
        customInstructions: options.customInstructions ?? settings.customInstructions,
        deepThink: options.deepThink ?? settings.deepThinkEnabled,
      }

      try {
        let content = ''
        let finalPrompt: Prompt | null = null

        for await (const event of enhancePromptStream(request)) {
          // Check for abort
          if (abortRef.current?.signal.aborted) {
            break
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
              finalPrompt = event.prompt || null
              setState((prev) => ({
                ...prev,
                progress: 'completing',
              }))
              break

            case 'error':
              throw new Error(event.error || 'Enhancement failed')
          }
        }

        // Refresh subscription to get updated usage
        await fetchSubscription()

        setState({
          isEnhancing: false,
          streamedContent: content,
          result: finalPrompt,
          error: null,
          progress: 'done',
        })

        return finalPrompt
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Enhancement failed'
        setState({
          isEnhancing: false,
          streamedContent: '',
          result: null,
          error: message,
          progress: 'error',
        })
        throw err
      } finally {
        abortRef.current = null
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
    setState({
      isEnhancing: false,
      streamedContent: '',
      result: null,
      error: null,
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
