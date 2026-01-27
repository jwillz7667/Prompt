import { api } from './client'
import type {
  EnhanceRequest,
  EnhanceResponse,
  PromptsListResponse,
  StreamEvent,
  SuccessResponse,
} from '@/lib/types/api'
import type { Prompt } from '@/lib/types/models'

export interface PromptsQueryParams {
  page?: number
  limit?: number
  search?: string
  favoritesOnly?: boolean
  collectionId?: string
}

export async function getPrompts(params: PromptsQueryParams = {}): Promise<PromptsListResponse> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', params.page.toString())
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.search) searchParams.set('search', params.search)
  if (params.favoritesOnly) searchParams.set('favoritesOnly', 'true')
  if (params.collectionId) searchParams.set('collectionId', params.collectionId)

  const query = searchParams.toString()
  return api.get<PromptsListResponse>(`/prompts${query ? `?${query}` : ''}`)
}

export async function getPrompt(id: string): Promise<Prompt> {
  return api.get<Prompt>(`/prompts/${id}`)
}

export async function enhancePrompt(request: EnhanceRequest): Promise<EnhanceResponse> {
  return api.post<EnhanceResponse>('/prompts/enhance', request)
}

export async function* enhancePromptStream(
  request: EnhanceRequest
): AsyncGenerator<StreamEvent, void, unknown> {
  const stream = api.stream('/prompts/enhance/stream', request)

  for await (const data of stream) {
    try {
      const event = JSON.parse(data) as StreamEvent
      yield event
    } catch {
      // Skip malformed JSON
      console.warn('Failed to parse stream event:', data)
    }
  }
}

export async function createPrompt(data: {
  originalPrompt: string
  enhancedPrompt: string
  tone?: string
  outputLength?: string
  model?: string
  temperature?: number
  inputTokens?: number
  outputTokens?: number
  processingMs?: number
}): Promise<Prompt> {
  return api.post<Prompt>('/prompts', data)
}

export async function updatePrompt(
  id: string,
  data: Partial<Pick<Prompt, 'isFavorite' | 'tags'>>
): Promise<Prompt> {
  return api.patch<Prompt>(`/prompts/${id}`, data)
}

export async function deletePrompt(id: string): Promise<void> {
  return api.delete<void>(`/prompts/${id}`)
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<Prompt> {
  return updatePrompt(id, { isFavorite })
}

export async function bulkFavorite(ids: string[], isFavorite: boolean): Promise<SuccessResponse> {
  return api.post<SuccessResponse>('/prompts/bulk/favorite', { ids, isFavorite })
}

export async function bulkDelete(ids: string[]): Promise<SuccessResponse> {
  return api.post<SuccessResponse>('/prompts/bulk/delete', { ids })
}
