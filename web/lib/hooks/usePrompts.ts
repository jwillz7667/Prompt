'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPrompts,
  getPrompt,
  updatePrompt,
  deletePrompt,
  toggleFavorite as toggleFavoriteApi,
  bulkFavorite,
  bulkDelete,
  type PromptsQueryParams,
} from '@/lib/api/prompts'
import { toast } from '@/lib/stores/uiStore'

export function usePrompts(params: PromptsQueryParams = {}) {
  return useQuery({
    queryKey: ['prompts', params],
    queryFn: () => getPrompts(params),
  })
}

export function usePrompt(id: string) {
  return useQuery({
    queryKey: ['prompt', id],
    queryFn: () => getPrompt(id),
    enabled: !!id,
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      toggleFavoriteApi(id, isFavorite),
    onMutate: async ({ id, isFavorite }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['prompts'] })
      const previousPrompts = queryClient.getQueryData(['prompts'])

      queryClient.setQueriesData({ queryKey: ['prompts'] }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const data = old as { prompts: { id: string; isFavorite: boolean }[] }
        return {
          ...data,
          prompts: data.prompts?.map((p) =>
            p.id === id ? { ...p, isFavorite } : p
          ),
        }
      })

      return { previousPrompts }
    },
    onError: (err, variables, context) => {
      if (context?.previousPrompts) {
        queryClient.setQueryData(['prompts'], context.previousPrompts)
      }
      toast.error('Failed to update favorite')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
  })
}

export function useDeletePrompt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deletePrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      toast.success('Prompt deleted')
    },
    onError: () => {
      toast.error('Failed to delete prompt')
    },
  })
}

export function useBulkFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, isFavorite }: { ids: string[]; isFavorite: boolean }) =>
      bulkFavorite(ids, isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      toast.success('Prompts updated')
    },
    onError: () => {
      toast.error('Failed to update prompts')
    },
  })
}

export function useBulkDelete() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: bulkDelete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      toast.success('Prompts deleted')
    },
    onError: () => {
      toast.error('Failed to delete prompts')
    },
  })
}

export function useUpdatePrompt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePrompt>[1] }) =>
      updatePrompt(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(['prompt', data.id], data)
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: () => {
      toast.error('Failed to update prompt')
    },
  })
}
