import { api } from './client'
import type { TemplatesListResponse, CreateTemplateRequest, SuccessResponse } from '@/lib/types/api'
import type { Template, TemplateCategory } from '@/lib/types/models'

export interface TemplatesQueryParams {
  category?: TemplateCategory
  search?: string
  builtInOnly?: boolean
  userOnly?: boolean
}

export async function getTemplates(params: TemplatesQueryParams = {}): Promise<TemplatesListResponse> {
  const searchParams = new URLSearchParams()
  if (params.category) searchParams.set('category', params.category)
  if (params.search) searchParams.set('search', params.search)
  if (params.builtInOnly) searchParams.set('builtInOnly', 'true')
  if (params.userOnly) searchParams.set('userOnly', 'true')

  const query = searchParams.toString()
  return api.get<TemplatesListResponse>(`/templates${query ? `?${query}` : ''}`)
}

export async function getTemplate(id: string): Promise<Template> {
  return api.get<Template>(`/templates/${id}`)
}

export async function createTemplate(data: CreateTemplateRequest): Promise<Template> {
  return api.post<Template>('/templates', data)
}

export async function updateTemplate(
  id: string,
  data: Partial<CreateTemplateRequest>
): Promise<Template> {
  return api.patch<Template>(`/templates/${id}`, data)
}

export async function deleteTemplate(id: string): Promise<void> {
  return api.delete<void>(`/templates/${id}`)
}

export async function incrementTemplateUsage(id: string): Promise<SuccessResponse> {
  return api.post<SuccessResponse>(`/templates/${id}/use`)
}
