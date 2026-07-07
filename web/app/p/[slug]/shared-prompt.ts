// Public shared-prompt data access. No auth — the backend endpoint is public
// and returns only fields safe to expose on a shareable page.

export interface SharedPrompt {
  title: string | null
  originalPrompt: string
  enhancedPrompt: string
  modality: string
  model: string
  promptCreatedAt: string
  sharedAt: string
}

// Mirrors the backend slug contract: /^[A-Za-z0-9_-]{8,32}$/. Validating here
// avoids issuing a network request for obviously malformed links.
const SLUG_PATTERN = /^[A-Za-z0-9_-]{8,32}$/

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://backend-production-d538.up.railway.app/api/v1'

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

// Returns null when the slug is malformed or the backend responds 404
// (unknown or revoked share). Other non-2xx responses throw so the route's
// error boundary handles them rather than masking outages as "not found".
export async function getSharedPrompt(slug: string): Promise<SharedPrompt | null> {
  if (!isValidSlug(slug)) {
    return null
  }

  const response = await fetch(`${API_BASE_URL}/shared/${slug}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60 },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Failed to load shared prompt (${response.status})`)
  }

  return response.json()
}

// Human-readable, brand-neutral labels for the modality badge.
const MODALITY_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  code: 'Code',
  '3d': '3D',
}

export function modalityLabel(modality: string): string {
  return MODALITY_LABELS[modality.toLowerCase()] ?? 'Prompt'
}
