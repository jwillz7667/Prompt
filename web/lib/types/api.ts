import type {
  User,
  Prompt,
  Template,
  Collection,
  SubscriptionInfo,
  Analytics,
  StreakData,
  Session,
  PromptUsage,
  ToneType,
  OutputLength,
  PromptModality,
  DeepseekModel,
  SubscriptionTier,
  StripeProduct,
} from './models'

// Auth
export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface RefreshResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
}

// Prompts
export interface EnhanceRequest {
  prompt: string
  modality?: PromptModality
  tone?: ToneType
  length?: OutputLength
  model?: DeepseekModel
  temperature?: number
  customInstructions?: string
  deepThink?: boolean
  mode?: 'standard' | 'max'
  maxTokens?: number
  targetCharacterLength?: number
}

export interface EnhanceResponse {
  enhancedPrompt: string
  prompt: Prompt
  usage: PromptUsage
  subscription: {
    tier: SubscriptionTier
    promptQuality: string
    dailyPromptsUsed: number
    dailyPromptsLimit: number
    dailyPromptsRemaining: number
  }
}

/** A generated result may be usable even if history persistence failed. */
export interface EnhancementResult {
  id: string | null
  originalPrompt: string
  enhancedPrompt: string
  modality: PromptModality
  inputTokens: number | null
  outputTokens: number | null
  processingMs: number | null
  isSaved: boolean
}

export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'complete'; prompt: EnhancementResult; warning?: string; usage?: PromptUsage; subscription?: EnhanceResponse['subscription'] }
  | { type: 'error'; message: string }

export interface PromptsListResponse {
  prompts: Prompt[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Templates
export interface TemplatesListResponse {
  templates: Template[]
}

export interface CreateTemplateRequest {
  name: string
  content: string
  description?: string
  icon?: string
  category: string
}

// Collections
export interface CollectionsListResponse {
  collections: Collection[]
}

export interface CreateCollectionRequest {
  name: string
  description?: string
  color?: string
}

export interface AddToCollectionRequest {
  promptIds: string[]
}

// Subscription
export interface SubscriptionStatusResponse extends SubscriptionInfo {
  autoRenewEnabled?: boolean
}

export interface TrialEligibilityResponse {
  eligible: boolean
  reason?: string
}

export interface StartTrialResponse {
  success: boolean
  trialEndsAt: string
}

// Stripe
export interface StripeCheckoutRequest {
  priceId: string
  successUrl: string
  cancelUrl: string
}

export interface StripeCheckoutResponse {
  sessionId: string
  url: string
}

export interface StripePortalResponse {
  url: string
}

// Analytics
export interface AnalyticsResponse extends Analytics {}

export interface StreakResponse extends StreakData {}

// User
export interface UpdateProfileRequest {
  name?: string
  avatarUrl?: string
}

export interface UserStatsResponse {
  totalPrompts: number
  totalTokens: number
  memberSince: string
  currentStreak: number
  longestStreak: number
}

export interface SessionsListResponse {
  sessions: Session[]
}

// Generic
export interface APIError {
  error: string
  message: string
  statusCode: number
}

export interface SuccessResponse {
  success: boolean
  message?: string
}
