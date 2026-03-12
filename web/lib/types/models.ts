// User & Auth
export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  isPremium: boolean
  createdAt: string
}

export interface Session {
  id: string
  deviceName: string | null
  deviceType: string | null
  lastActive: string
  createdAt: string
  isCurrent: boolean
}

// Subscription
export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM'
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELED' | 'GRACE_PERIOD' | 'TRIAL'

export interface Subscription {
  tier: SubscriptionTier
  status: SubscriptionStatus
  expiresAt: string | null
  isTrialing: boolean
  trialEndsAt: string | null
  autoRenewEnabled: boolean
}

export interface UsageInfo {
  dailyPromptsUsed: number
  dailyPromptsLimit: number
  canCreatePrompt: boolean
}

export interface FeatureFlags {
  promptQuality: 'basic' | 'standard' | 'advanced'
  canExport: boolean
  maxTokensPerPrompt: number
}

export interface SubscriptionInfo {
  subscription: Subscription
  usage: UsageInfo
  features: FeatureFlags
}

// Prompts
export interface Prompt {
  id: string
  originalPrompt: string
  enhancedPrompt: string
  modality: PromptModality
  tone: ToneType | null
  outputLength: OutputLength | null
  model: string | null
  temperature: number | null
  inputTokens: number | null
  outputTokens: number | null
  processingMs: number | null
  isFavorite: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface PromptUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  processingMs: number
}

// Templates
export type TemplateCategory =
  | 'general'
  | 'coding'
  | 'writing'
  | 'business'
  | 'creative'
  | 'research'
  | 'analysis'

export interface Template {
  id: string
  name: string
  content: string
  description: string | null
  icon: string | null
  category: TemplateCategory
  isBuiltIn: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}

// Collections
export interface Collection {
  id: string
  name: string
  description: string | null
  color: string | null
  promptCount: number
  createdAt: string
  updatedAt: string
}

export interface CollectionWithPrompts extends Collection {
  prompts: Prompt[]
}

// Analytics
export interface AnalyticsSummary {
  totalPrompts: number
  favoriteCount: number
  totalTokens: number
  avgPromptsPerDay: number
  avgTokensPerPrompt: number
  collectionCount: number
  templateCount: number
  // Legacy fields for backwards compatibility
  totalTokensUsed?: number
  averageProcessingTime?: number
  currentStreak?: number
  longestStreak?: number
}

export interface DailyAnalytics {
  date: string
  promptCount?: number
  count?: number
  tokensUsed?: number
}

export interface ModelUsage {
  model: string
  count: number
}

export interface TagUsage {
  tag: string
  count: number
}

export interface AnalyticsCharts {
  promptsByDay: { date: string; count: number }[]
  modelUsage: ModelUsage[]
  topTags: TagUsage[]
}

export interface UsageHistoryRecord {
  date: string
  prompts: number
  tokens: number
}

export interface Analytics {
  summary: AnalyticsSummary
  charts: AnalyticsCharts
  usageHistory: UsageHistoryRecord[]
  period: {
    days: number
    startDate: string
    endDate: string
  }
  // Legacy fields for backwards compatibility
  daily?: DailyAnalytics[]
  topTones?: { tone: string; count: number }[]
  topCategories?: { category: string; count: number }[]
}

export interface StreakData {
  currentStreak: number
  longestStreak: number
  totalActiveDays: number
}

// Settings
export type ToneType =
  | 'professional'
  | 'casual'
  | 'academic'
  | 'creative'
  | 'technical'
  | 'friendly'
  | 'max'

export type OutputLength = 'concise' | 'standard' | 'detailed'
export type PromptModality = 'text' | 'image' | 'video' | 'audio' | 'code' | '3d'

export type AppearanceMode = 'system' | 'light' | 'dark'

export type DeepseekModel = 'deepseek-chat' | 'deepseek-reasoner'

export interface UserSettings {
  selectedModel: DeepseekModel
  deepThinkEnabled: boolean
  temperature: number
  maxTokens: number
  appearanceMode: AppearanceMode
  selectedTone: ToneType
  outputLength: OutputLength
  customInstructions: string
  targetCharacterLength?: number
}

// Stripe
export interface StripeProduct {
  id: string
  name: string
  description: string
  priceId: string
  tier: SubscriptionTier
  interval: 'month' | 'year'
  amount: number
  currency: string
}
