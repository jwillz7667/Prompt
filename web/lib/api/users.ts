import { api } from './client'
import type { UpdateProfileRequest, SuccessResponse } from '@/lib/types/api'
import type { User } from '@/lib/types/models'

export async function updateProfile(data: UpdateProfileRequest): Promise<User> {
  return api.patch<User>('/users/profile', data)
}

export async function deleteAccount(): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>('/users/account')
}

export interface AiDataConsent {
  version: number
  grantedAt: string
}

export interface AiConsentState {
  aiDataConsent: AiDataConsent | null
  requiredVersion: number
}

/** Records the account's consent to `version` of the AI data-sharing disclosure. */
export async function grantAiConsent(version: number): Promise<AiConsentState> {
  return api.post<AiConsentState>('/users/me/ai-consent', { version })
}
