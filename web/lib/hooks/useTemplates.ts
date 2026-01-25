'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  incrementTemplateUsage,
  type TemplatesQueryParams,
} from '@/lib/api/templates'
import type { CreateTemplateRequest } from '@/lib/types/api'
import { toast } from '@/lib/stores/uiStore'

export function useTemplates(params: TemplatesQueryParams = {}) {
  return useQuery({
    queryKey: ['templates', params],
    queryFn: () => getTemplates(params),
  })
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['template', id],
    queryFn: () => getTemplate(id),
    enabled: !!id,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template created')
    },
    onError: () => {
      toast.error('Failed to create template')
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTemplateRequest> }) =>
      updateTemplate(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(['template', data.id], data)
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template updated')
    },
    onError: () => {
      toast.error('Failed to update template')
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template deleted')
    },
    onError: () => {
      toast.error('Failed to delete template')
    },
  })
}

export function useIncrementTemplateUsage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: incrementTemplateUsage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
