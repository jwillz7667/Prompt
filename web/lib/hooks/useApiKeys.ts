/**
 * API Keys React Query Hooks
 *
 * Hooks for managing API keys with React Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listApiKeys,
  getApiKey,
  createApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
  getApiKeyHistory,
  getAvailablePermissions,
  getApiSubscriptionStatus,
  getApiPlans,
  getApiCreditPacks,
  createApiCheckout,
  createApiCreditCheckout,
  createApiPortalSession,
  cancelApiSubscription,
  getApiInvoices,
  getApiBilling,
  type CreateApiKeyRequest,
  type UpdateApiKeyRequest,
  type ApiKey,
} from '@/lib/api/apiKeys'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const apiKeyQueryKeys = {
  all: ['apiKeys'] as const,
  lists: () => [...apiKeyQueryKeys.all, 'list'] as const,
  list: () => [...apiKeyQueryKeys.lists()] as const,
  details: () => [...apiKeyQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...apiKeyQueryKeys.details(), id] as const,
  usage: (id: string) => [...apiKeyQueryKeys.detail(id), 'usage'] as const,
  history: (id: string, params?: Record<string, unknown>) =>
    [...apiKeyQueryKeys.detail(id), 'history', params] as const,
  permissions: () => [...apiKeyQueryKeys.all, 'permissions'] as const,
}

export const apiSubscriptionQueryKeys = {
  all: ['apiSubscription'] as const,
  status: () => [...apiSubscriptionQueryKeys.all, 'status'] as const,
  plans: () => [...apiSubscriptionQueryKeys.all, 'plans'] as const,
  creditPacks: () => [...apiSubscriptionQueryKeys.all, 'creditPacks'] as const,
  invoices: (limit?: number) => [...apiSubscriptionQueryKeys.all, 'invoices', limit] as const,
  billing: () => [...apiSubscriptionQueryKeys.all, 'billing'] as const,
}

// ============================================================================
// API KEYS QUERIES
// ============================================================================

/**
 * Fetch all API keys for the current user.
 */
export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyQueryKeys.list(),
    queryFn: async () => {
      const response = await listApiKeys()
      return response.apiKeys
    },
  })
}

/**
 * Fetch a single API key by ID.
 */
export function useApiKey(id: string | undefined) {
  return useQuery({
    queryKey: apiKeyQueryKeys.detail(id!),
    queryFn: async () => {
      const response = await getApiKey(id!)
      return response.apiKey
    },
    enabled: !!id,
  })
}

/**
 * Fetch usage statistics for an API key.
 */
export function useApiKeyUsage(
  id: string | undefined,
  options?: { startDate?: string; endDate?: string }
) {
  return useQuery({
    queryKey: apiKeyQueryKeys.usage(id!),
    queryFn: async () => {
      const response = await getApiKeyUsage(id!, options)
      return response.usage
    },
    enabled: !!id,
  })
}

/**
 * Fetch usage history for an API key.
 */
export function useApiKeyHistory(
  id: string | undefined,
  options?: { page?: number; limit?: number; startDate?: string; endDate?: string }
) {
  return useQuery({
    queryKey: apiKeyQueryKeys.history(id!, options),
    queryFn: () => getApiKeyHistory(id!, options),
    enabled: !!id,
  })
}

/**
 * Fetch available permissions.
 */
export function useAvailablePermissions() {
  return useQuery({
    queryKey: apiKeyQueryKeys.permissions(),
    queryFn: async () => {
      const response = await getAvailablePermissions()
      return response.permissions
    },
    staleTime: 1000 * 60 * 60, // 1 hour - permissions rarely change
  })
}

// ============================================================================
// API KEYS MUTATIONS
// ============================================================================

/**
 * Create a new API key.
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyQueryKeys.lists() })
    },
  })
}

/**
 * Update an API key.
 */
export function useUpdateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiKeyRequest }) =>
      updateApiKey(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: apiKeyQueryKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: apiKeyQueryKeys.lists() })
    },
  })
}

/**
 * Revoke an API key.
 */
export function useRevokeApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      revokeApiKey(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyQueryKeys.lists() })
    },
  })
}

/**
 * Rotate an API key.
 */
export function useRotateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => rotateApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyQueryKeys.lists() })
    },
  })
}

// ============================================================================
// API SUBSCRIPTION QUERIES
// ============================================================================

/**
 * Fetch API subscription status.
 */
export function useApiSubscriptionStatus() {
  return useQuery({
    queryKey: apiSubscriptionQueryKeys.status(),
    queryFn: getApiSubscriptionStatus,
    staleTime: 1000 * 30, // 30 seconds
  })
}

/**
 * Fetch available API plans.
 */
export function useApiPlans() {
  return useQuery({
    queryKey: apiSubscriptionQueryKeys.plans(),
    queryFn: async () => {
      const response = await getApiPlans()
      return response.plans
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}

export function useApiCreditPacks() {
  return useQuery({
    queryKey: apiSubscriptionQueryKeys.creditPacks(),
    queryFn: async () => {
      const response = await getApiCreditPacks()
      return response.packs
    },
    staleTime: 1000 * 60 * 60,
  })
}

/**
 * Fetch invoice history.
 */
export function useApiInvoices(limit?: number) {
  return useQuery({
    queryKey: apiSubscriptionQueryKeys.invoices(limit),
    queryFn: async () => {
      const response = await getApiInvoices(limit)
      return response.invoices
    },
  })
}

/**
 * Fetch billing information.
 */
export function useApiBilling() {
  return useQuery({
    queryKey: apiSubscriptionQueryKeys.billing(),
    queryFn: getApiBilling,
  })
}

// ============================================================================
// API SUBSCRIPTION MUTATIONS
// ============================================================================

/**
 * Create Stripe checkout session for API subscription.
 */
export function useCreateApiCheckout() {
  return useMutation({
    mutationFn: ({
      tier,
      successUrl,
      cancelUrl,
    }: {
      tier: 'API_STARTER' | 'API_PRO'
      successUrl: string
      cancelUrl: string
    }) => createApiCheckout(tier, successUrl, cancelUrl),
  })
}

export function useCreateApiCreditCheckout() {
  return useMutation({
    mutationFn: ({
      packId,
      successUrl,
      cancelUrl,
    }: {
      packId: 'BOOST_5K' | 'GROWTH_25K' | 'SCALE_100K'
      successUrl: string
      cancelUrl: string
    }) => createApiCreditCheckout(packId, successUrl, cancelUrl),
  })
}

/**
 * Create Stripe billing portal session.
 */
export function useCreateApiPortalSession() {
  return useMutation({
    mutationFn: (returnUrl: string) => createApiPortalSession(returnUrl),
  })
}

/**
 * Cancel API subscription.
 */
export function useCancelApiSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cancelApiSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiSubscriptionQueryKeys.status() })
    },
  })
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if user has an active API subscription.
 */
export function useHasApiSubscription() {
  const { data } = useApiSubscriptionStatus()
  return data?.tier !== 'API_FREE' && data?.status === 'ACTIVE'
}

/**
 * Get remaining API requests.
 */
export function useRemainingApiRequests() {
  const { data } = useApiSubscriptionStatus()
  if (!data) return null
  return data.quota.remaining
}
