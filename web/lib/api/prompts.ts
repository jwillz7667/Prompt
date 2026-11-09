import { api } from './client'
import type {
  EnhanceRequest,
  EnhanceResponse,
  PromptsListResponse,
  StreamEvent,
  EnhancementResult,
  SuccessResponse,
} from '@/lib/types/api'
import type { Prompt, PromptUsage } from '@/lib/types/models'

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
  const { prompt } = await api.get<{ prompt: Prompt }>(`/prompts/${id}`)
  return prompt
}

export async function enhancePrompt(request: EnhanceRequest): Promise<EnhanceResponse> {
  return api.post<EnhanceResponse>('/prompts/enhance', buildEnhancePayload(request))
}

/** Translate UI settings into the fields accepted by the enhancement backend. */
export function buildEnhancePayload(request: EnhanceRequest) {
  const instructions = [request.customInstructions?.trim()].filter(Boolean) as string[]
  if (request.tone) instructions.push(`Use a ${request.tone} tone in the enhanced prompt.`)
  const lengthInstructions = {
    concise: 'Keep the enhanced prompt brief and focused; include only essential instructions.',
    standard: 'Use a balanced level of detail in the enhanced prompt.',
    detailed: 'Make the enhanced prompt comprehensive, with explicit constraints and output requirements.',
  }
  if (request.length) instructions.push(lengthInstructions[request.length])
  if (request.targetCharacterLength !== undefined) {
    if (!Number.isSafeInteger(request.targetCharacterLength) || request.targetCharacterLength < 1) {
      throw new Error('Target length must be a positive whole number of characters.')
    }
    instructions.push(`Aim for approximately ${request.targetCharacterLength} characters in the enhanced prompt without dropping essential requirements.`)
  }
  const customInstructions = instructions.join('\n')
  if (customInstructions.length > 2000) {
    throw new Error('Custom instructions and style settings must fit within 2,000 characters. Please shorten your instructions.')
  }
  return {
    prompt: request.prompt,
    modality: request.modality ?? 'text',
    mode: request.mode === 'max' || request.deepThink ? 'max' : 'standard',
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    customInstructions: customInstructions || undefined,
  }
}

interface BackendStreamEvent {
  type: 'token' | 'complete' | 'error'
  content?: string
  promptId?: string | null
  prompt?: Prompt
  usage?: PromptUsage
  subscription?: EnhanceResponse['subscription']
  message?: string
  error?: string
}

export async function* enhancePromptStream(
  request: EnhanceRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent, void, unknown> {
  const stream = api.stream('/prompts/enhance/stream', buildEnhancePayload(request), signal)
  let content = ''
  for await (const data of stream) {
    const event = JSON.parse(data) as BackendStreamEvent
    if (event?.type === 'token') {
      if (typeof event.content !== 'string') throw new Error('The enhancement stream contained an invalid response.')
      content += event.content
      yield { type: 'token', content: event.content }
    } else if (event?.type === 'error') {
      yield { type: 'error', message: event.message || event.error || 'Enhancement failed. Please try again.' }
    } else if (event?.type === 'complete') {
      // The backend returns promptId (nullable), not a whole Prompt object.
      // Use the streamed output immediately, without another network dependency.
      const id = event.prompt?.id || event.promptId || null
      const enhancedPrompt = event.prompt?.enhancedPrompt || content
      if (!enhancedPrompt.trim()) throw new Error('The enhancement finished without any output. Please try again.')
      const prompt: EnhancementResult = {
        id,
        originalPrompt: event.prompt?.originalPrompt ?? request.prompt,
        enhancedPrompt,
        modality: event.prompt?.modality ?? request.modality ?? 'text',
        inputTokens: event.usage?.inputTokens ?? event.prompt?.inputTokens ?? null,
        outputTokens: event.usage?.outputTokens ?? event.prompt?.outputTokens ?? null,
        processingMs: event.usage?.processingMs ?? event.prompt?.processingMs ?? null,
        isSaved: id !== null,
      }
      yield {
        type: 'complete', prompt, usage: event.usage, subscription: event.subscription,
        ...(!id ? { warning: 'Your prompt was generated but could not be saved to history. Copy it before leaving this page.' } : {}),
      }
      return
    } else {
      throw new Error('The enhancement stream contained an invalid response.')
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
  const { prompt } = await api.post<{ prompt: Prompt }>('/prompts', data)
  return prompt
}

export async function updatePrompt(
  id: string,
  data: Partial<Pick<Prompt, 'isFavorite' | 'tags'>>
): Promise<Prompt> {
  const { prompt } = await api.patch<{ prompt: Prompt }>(`/prompts/${id}`, data)
  return prompt
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
