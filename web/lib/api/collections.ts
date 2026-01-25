import { api } from './client'
import type { CollectionsListResponse, CreateCollectionRequest, AddToCollectionRequest, SuccessResponse } from '@/lib/types/api'
import type { Collection, CollectionWithPrompts } from '@/lib/types/models'

export async function getCollections(): Promise<CollectionsListResponse> {
  return api.get<CollectionsListResponse>('/collections')
}

export async function getCollection(id: string): Promise<CollectionWithPrompts> {
  return api.get<CollectionWithPrompts>(`/collections/${id}`)
}

export async function createCollection(data: CreateCollectionRequest): Promise<Collection> {
  return api.post<Collection>('/collections', data)
}

export async function updateCollection(
  id: string,
  data: Partial<CreateCollectionRequest>
): Promise<Collection> {
  return api.patch<Collection>(`/collections/${id}`, data)
}

export async function deleteCollection(id: string): Promise<void> {
  return api.delete<void>(`/collections/${id}`)
}

export async function addPromptsToCollection(
  id: string,
  data: AddToCollectionRequest
): Promise<SuccessResponse> {
  return api.post<SuccessResponse>(`/collections/${id}/prompts`, data)
}

export async function removePromptsFromCollection(
  id: string,
  promptIds: string[]
): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/collections/${id}/prompts`, {
    body: { promptIds },
  } as never)
}
