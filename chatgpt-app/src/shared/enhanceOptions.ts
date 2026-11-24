import type { CapabilityItem, EnhanceRequestPayload, PromptLength, Tone } from './types.js'

// The public API has no tone or length fields (GET /models lists modalities,
// modes and limits only), so these options belong to this app and are sent
// to POST /enhance as custom instructions.
export const TONE_OPTIONS: ReadonlyArray<CapabilityItem & { id: Tone }> = [
  { id: 'professional', name: 'Professional' },
  { id: 'casual', name: 'Casual' },
  { id: 'academic', name: 'Academic' },
  { id: 'creative', name: 'Creative' },
  { id: 'technical', name: 'Technical' },
  { id: 'friendly', name: 'Friendly' },
]

export const LENGTH_OPTIONS: ReadonlyArray<CapabilityItem & { id: PromptLength }> = [
  { id: 'concise', name: 'Concise' },
  { id: 'standard', name: 'Standard' },
  { id: 'detailed', name: 'Detailed' },
]

/** POST /public/enhance accepts at most this many characters of customInstructions. */
export const MAX_CUSTOM_INSTRUCTIONS = 2000

/**
 * Folds tone and length into the custom instructions the API accepts. The
 * caller's own instructions come first; the result never exceeds the API
 * limit, so a long instruction cannot turn a valid request into a 400.
 */
export function toCustomInstructions(
  request: Pick<EnhanceRequestPayload, 'tone' | 'length' | 'customInstructions'>
): string | undefined {
  const parts = [
    request.customInstructions?.trim() || null,
    request.tone ? `Use a ${request.tone} tone.` : null,
    request.length ? `Keep the result ${request.length}.` : null,
  ].filter((part): part is string => part !== null)

  if (parts.length === 0) {
    return undefined
  }

  return parts.join(' ').slice(0, MAX_CUSTOM_INSTRUCTIONS)
}
