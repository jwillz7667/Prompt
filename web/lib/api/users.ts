import { api } from './client'
import type { UpdateProfileRequest, SuccessResponse } from '@/lib/types/api'
import type { User } from '@/lib/types/models'

export async function updateProfile(data: UpdateProfileRequest): Promise<User> {
  return api.patch<User>('/users/profile', data)
}

export async function deleteAccount(): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>('/users/account')
}
