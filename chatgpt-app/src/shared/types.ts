export const PROMPTOMIZE_TOOL_URI = 'ui://promptomize/enhancer.html'

export type Modality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d'
export type Tone =
  | 'professional'
  | 'casual'
  | 'academic'
  | 'creative'
  | 'technical'
  | 'friendly'
export type PromptLength = 'concise' | 'standard' | 'detailed'

export interface CapabilityItem {
  id: string
  name: string
  description?: string
}

export interface CapabilityLimits {
  maxPromptLength: number
  maxTokens: number
  maxCustomInstructions: number
}

export interface CapabilitiesPayload {
  modalities: CapabilityItem[]
  tones: CapabilityItem[]
  lengths: CapabilityItem[]
  limits: CapabilityLimits
  fetchedAt: string
}

export interface EnhanceRequestPayload {
  prompt: string
  modality: Modality
  tone?: Tone
  length?: PromptLength
  customInstructions?: string
}

export interface UsagePayload {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  processingMs: number
}

export interface QuotaPayload {
  used: number
  limit: number | string
  remaining: number | string
}

export interface EnhanceResponsePayload {
  enhancedPrompt: string
  request: EnhanceRequestPayload
  usage?: UsagePayload
  quota?: QuotaPayload
  capabilities?: CapabilitiesPayload
  generatedAt: string
  links: {
    webApp: string
    demo: string
    ios: string
  }
}
