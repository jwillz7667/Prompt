/**
 * API Keys API Client
 *
 * Functions for managing API keys and API subscriptions.
 * Uses developer authentication (separate from regular user auth).
 */

import { developerApi as api } from './developerClient'

// ============================================================================
// TYPES
// ============================================================================

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  permissions: string[]
  rateLimit: number
  description?: string
  environment: 'production' | 'test'
  lastUsedAt?: string
  totalRequests: string
  expiresAt?: string
  isActive: boolean
  revokedAt?: string
  revokedReason?: string
  createdAt: string
  updatedAt: string
}

export interface CreateApiKeyRequest {
  name: string
  description?: string
  permissions?: string[]
  environment?: 'production' | 'test'
  expiresAt?: string
  rateLimit?: number
}

export interface CreateApiKeyResponse {
  key: string // Full raw key (shown only once)
  apiKey: ApiKey
  warning: string
}

export interface UpdateApiKeyRequest {
  name?: string
  description?: string
  permissions?: string[]
  rateLimit?: number
  expiresAt?: string | null
}

export interface RotateApiKeyResponse {
  newKey: string
  apiKey: ApiKey
  oldKeyValidUntil: string
  warning: string
}

export interface UsageStats {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  avgLatencyMs: number
  successRate: number
  requestsByEndpoint: Record<string, number>
  requestsByModality: Record<string, number>
  requestsByDay: Array<{
    date: string
    requests: number
    tokens: number
  }>
}

export interface UsageRecord {
  id: string
  endpoint: string
  method: string
  statusCode: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  latencyMs: number
  modality?: string
  createdAt: string
}

export interface UsageHistoryResponse {
  records: UsageRecord[]
  pagination: {
    page: number
    pages: number
    total: number
  }
}

export interface Permission {
  id: string
  name: string
  description: string
}

// ============================================================================
// API KEYS
// ============================================================================

/**
 * Create a new API key.
 */
export async function createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return api.post<CreateApiKeyResponse>('/api-keys', data)
}

/**
 * List all API keys for the current user.
 */
export async function listApiKeys(): Promise<{ apiKeys: ApiKey[] }> {
  return api.get<{ apiKeys: ApiKey[] }>('/api-keys')
}

/**
 * Get a single API key by ID.
 */
export async function getApiKey(id: string): Promise<{ apiKey: ApiKey }> {
  return api.get<{ apiKey: ApiKey }>(`/api-keys/${id}`)
}

/**
 * Update an API key.
 */
export async function updateApiKey(id: string, data: UpdateApiKeyRequest): Promise<{ apiKey: ApiKey }> {
  return api.patch<{ apiKey: ApiKey }>(`/api-keys/${id}`, data)
}

/**
 * Revoke (delete) an API key.
 */
export async function revokeApiKey(id: string, reason?: string): Promise<{ success: boolean; message: string }> {
  return api.delete<{ success: boolean; message: string }>(`/api-keys/${id}`, {
    body: reason ? { reason } : undefined,
  } as unknown as undefined)
}

/**
 * Rotate an API key (create new, expire old after grace period).
 */
export async function rotateApiKey(id: string): Promise<RotateApiKeyResponse> {
  return api.post<RotateApiKeyResponse>(`/api-keys/${id}/rotate`)
}

/**
 * Get usage statistics for an API key.
 */
export async function getApiKeyUsage(
  id: string,
  options?: { startDate?: string; endDate?: string }
): Promise<{ usage: UsageStats }> {
  const params = new URLSearchParams()
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  const query = params.toString()
  return api.get<{ usage: UsageStats }>(`/api-keys/${id}/usage${query ? `?${query}` : ''}`)
}

/**
 * Get paginated usage history for an API key.
 */
export async function getApiKeyHistory(
  id: string,
  options?: { page?: number; limit?: number; startDate?: string; endDate?: string }
): Promise<UsageHistoryResponse> {
  const params = new URLSearchParams()
  if (options?.page) params.set('page', options.page.toString())
  if (options?.limit) params.set('limit', options.limit.toString())
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  const query = params.toString()
  return api.get<UsageHistoryResponse>(`/api-keys/${id}/history${query ? `?${query}` : ''}`)
}

/**
 * Get available permissions.
 */
export async function getAvailablePermissions(): Promise<{ permissions: Permission[] }> {
  return api.get<{ permissions: Permission[] }>('/api-keys/meta/permissions')
}

// ============================================================================
// API SUBSCRIPTIONS
// ============================================================================

export interface ApiTierPlan {
  id: string
  name: string
  description: string
  priceMonthly: number
  monthlyRequests: number | 'unlimited'
  requestsPerMinute: number
  overagePerHundred: number
  features: string[]
  recommended?: boolean
}

export interface ApiSubscriptionStatus {
  tier: string
  status: string
  quota: {
    used: number
    limit: number | 'unlimited'
    remaining: number | 'unlimited'
  }
  credits: {
    purchasedRemaining: number
    monthlyIncluded: number | 'unlimited'
  }
  rateLimit: {
    requestsPerMinute: number
  }
  period: {
    start: string
    end: string
  }
  usage: {
    totalRequests: number
    includedRequests: number
    overageRequests: number
    totalTokens: number
    estimatedCostCents: number
  }
  features: string[]
  canMakeRequests: boolean
  overageAllowed: boolean
  hasBillingAccount: boolean
}

export interface ApiCreditPack {
  id: 'BOOST_5K' | 'GROWTH_25K' | 'SCALE_100K'
  name: string
  description: string
  credits: number
  price: number
  featured: boolean
}

export interface BillingInfo {
  period: {
    start: string
    end: string
  }
  requests: {
    included: number
    used: number
    overage: number
  }
  costs: {
    base: number
    overage: number
    total: number
    overageRate: number
  }
  currency: string
}

export interface Invoice {
  id: string
  number?: string
  amount: number
  status?: string
  date: string
  pdfUrl?: string
}

/**
 * Get current API subscription status.
 */
export async function getApiSubscriptionStatus(): Promise<ApiSubscriptionStatus> {
  return api.get<ApiSubscriptionStatus>('/api-subscriptions/status')
}

/**
 * Get available API plans.
 */
export async function getApiPlans(): Promise<{ plans: ApiTierPlan[] }> {
  return api.get<{ plans: ApiTierPlan[] }>('/api-subscriptions/plans')
}

export async function getApiCreditPacks(): Promise<{ packs: ApiCreditPack[] }> {
  return api.get<{ packs: ApiCreditPack[] }>('/api-subscriptions/credit-packs')
}

/**
 * Create a Stripe checkout session for API subscription.
 */
export async function createApiCheckout(
  tier: 'API_STARTER' | 'API_PRO',
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> {
  return api.post<{ url: string }>('/api-subscriptions/checkout', {
    tier,
    successUrl,
    cancelUrl,
  })
}

export async function createApiCreditCheckout(
  packId: ApiCreditPack['id'],
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> {
  return api.post<{ url: string }>('/api-subscriptions/credits/checkout', {
    packId,
    successUrl,
    cancelUrl,
  })
}

/**
 * Create a Stripe billing portal session.
 */
export async function createApiPortalSession(returnUrl: string): Promise<{ url: string }> {
  return api.post<{ url: string }>('/api-subscriptions/portal', { returnUrl })
}

/**
 * Cancel API subscription at period end.
 */
export async function cancelApiSubscription(): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>('/api-subscriptions/cancel')
}

/**
 * Get invoice history.
 */
export async function getApiInvoices(limit?: number): Promise<{ invoices: Invoice[] }> {
  const query = limit ? `?limit=${limit}` : ''
  return api.get<{ invoices: Invoice[] }>(`/api-subscriptions/invoices${query}`)
}

/**
 * Get billing information for current period.
 */
export async function getApiBilling(): Promise<BillingInfo> {
  return api.get<BillingInfo>('/api-subscriptions/billing')
}
