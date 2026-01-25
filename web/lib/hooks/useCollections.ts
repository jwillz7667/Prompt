'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addPromptsToCollection,
  removePromptsFromCollection,
} from '@/lib/api/collections'
import type { CreateCollectionRequest } from '@/lib/types/api'
import { toast } from '@/lib/stores/uiStore'

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
  })
}

export function useCollection(id: string) {
  return useQuery({
    queryKey: ['collection', id],
    queryFn: () => getCollection(id),
    enabled: !!id,
  })
}

export function useCreateCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success('Collection created')
    },
    onError: () => {
      toast.error('Failed to create collection')
    },
  })
}

export function useUpdateCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCollectionRequest> }) =>
      updateCollection(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(['collection', data.id], data)
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success('Collection updated')
    },
    onError: () => {
      toast.error('Failed to update collection')
    },
  })
}

export function useDeleteCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success('Collection deleted')
    },
    onError: () => {
      toast.error('Failed to delete collection')
    },
  })
}

export function useAddToCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ collectionId, promptIds }: { collectionId: string; promptIds: string[] }) =>
      addPromptsToCollection(collectionId, { promptIds }),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success('Added to collection')
    },
    onError: () => {
      toast.error('Failed to add to collection')
    },
  })
}

export function useRemoveFromCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ collectionId, promptIds }: { collectionId: string; promptIds: string[] }) =>
      removePromptsFromCollection(collectionId, promptIds),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success('Removed from collection')
    },
    onError: () => {
      toast.error('Failed to remove from collection')
    },
  })
}
