'use client'

import { useState } from 'react'
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useRotateApiKey,
  useAvailablePermissions,
} from '@/lib/hooks/useApiKeys'
import type { ApiKey, CreateApiKeyRequest } from '@/lib/api/apiKeys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'

export default function ApiKeysPage() {
  const { data: apiKeys, isLoading } = useApiKeys()
  const { data: permissions } = useAvailablePermissions()
  const createKeyMutation = useCreateApiKey()
  const revokeKeyMutation = useRevokeApiKey()
  const rotateKeyMutation = useRotateApiKey()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; name: string } | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)
  const [rotateConfirm, setRotateConfirm] = useState<string | null>(null)

  const handleCreate = async (data: CreateApiKeyRequest) => {
    try {
      const result = await createKeyMutation.mutateAsync(data)
      setNewKeyResult({ key: result.key, name: data.name })
      setShowCreateModal(false)
      toast.success('API key created', 'Make sure to copy your key now.')
    } catch (error) {
      toast.error('Failed to create API key', (error as Error).message)
    }
  }

  const handleRevoke = async (id: string) => {
    try {
      await revokeKeyMutation.mutateAsync({ id })
      setRevokeConfirm(null)
      toast.success('API key revoked', 'The key is no longer valid.')
    } catch (error) {
      toast.error('Failed to revoke API key', (error as Error).message)
    }
  }

  const handleRotate = async (id: string) => {
    try {
      const result = await rotateKeyMutation.mutateAsync(id)
      setRotateConfirm(null)
      setNewKeyResult({ key: result.newKey, name: 'Rotated Key' })
      toast.success(
        'API key rotated',
        `Old key valid until ${new Date(result.oldKeyValidUntil).toLocaleString()}`
      )
    } catch (error) {
      toast.error('Failed to rotate API key', (error as Error).message)
    }
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    toast.success('Copied', 'API key copied to clipboard')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary">API Keys</h2>
          <p className="text-sm text-muted">Manage your API keys for programmatic access.</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>Create API Key</Button>
      </div>

      {/* New Key Display */}
      {newKeyResult && (
        <Card className="border-accent bg-accent/5">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-primary">New API Key Created</h3>
                <p className="text-sm text-muted mt-1">
                  This is your only chance to copy this key. It won&apos;t be shown again.
                </p>
              </div>
              <button onClick={() => setNewKeyResult(null)} className="text-muted hover:text-primary">
                ✕
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <code className="flex-1 rounded bg-secondary px-3 py-2 font-mono text-sm text-primary">
                {newKeyResult.key}
              </code>
              <Button onClick={() => copyKey(newKeyResult.key)} size="sm">
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keys List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted">Loading...</div>
      ) : apiKeys && apiKeys.length > 0 ? (
        <div className="space-y-4">
          {apiKeys.map((key) => (
            <ApiKeyCard
              key={key.id}
              apiKey={key}
              onRevoke={() => setRevokeConfirm(key.id)}
              onRotate={() => setRotateConfirm(key.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">🔑</div>
            <h3 className="text-lg font-medium text-primary">No API keys yet</h3>
            <p className="text-muted mt-1">Create your first API key to start using the API.</p>
            <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
              Create API Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateKeyModal
          permissions={permissions || []}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          isLoading={createKeyMutation.isPending}
        />
      )}

      {/* Revoke Confirmation */}
      {revokeConfirm && (
        <ConfirmModal
          title="Revoke API Key"
          message="This will immediately invalidate the API key. Any applications using this key will stop working."
          confirmLabel="Revoke Key"
          confirmVariant="danger"
          onCancel={() => setRevokeConfirm(null)}
          onConfirm={() => handleRevoke(revokeConfirm)}
          isLoading={revokeKeyMutation.isPending}
        />
      )}

      {/* Rotate Confirmation */}
      {rotateConfirm && (
        <ConfirmModal
          title="Rotate API Key"
          message="A new key will be generated. The old key will remain valid for 24 hours to allow migration."
          confirmLabel="Rotate Key"
          onCancel={() => setRotateConfirm(null)}
          onConfirm={() => handleRotate(rotateConfirm)}
          isLoading={rotateKeyMutation.isPending}
        />
      )}
    </div>
  )
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ApiKeyCard({
  apiKey,
  onRevoke,
  onRotate,
}: {
  apiKey: ApiKey
  onRevoke: () => void
  onRotate: () => void
}) {
  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()

  return (
    <Card className={cn(!apiKey.isActive && 'opacity-60')}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-primary">{apiKey.name}</h3>
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium',
                  apiKey.isActive && !isExpired
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-red-500/10 text-red-600'
                )}
              >
                {isExpired ? 'Expired' : apiKey.isActive ? 'Active' : 'Revoked'}
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  apiKey.environment === 'production'
                    ? 'bg-orange-500/10 text-orange-600'
                    : 'bg-blue-500/10 text-blue-600'
                )}
              >
                {apiKey.environment}
              </span>
            </div>

            <code className="text-sm text-muted font-mono mt-2 block">
              {apiKey.keyPrefix}...
            </code>

            {apiKey.description && (
              <p className="text-sm text-muted mt-2">{apiKey.description}</p>
            )}

            <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted">
              <span>
                Permissions:{' '}
                <span className="text-primary">{apiKey.permissions.join(', ')}</span>
              </span>
              <span>
                Rate limit:{' '}
                <span className="text-primary">{apiKey.rateLimit}/min</span>
              </span>
              <span>
                Total requests:{' '}
                <span className="text-primary">
                  {BigInt(apiKey.totalRequests).toLocaleString()}
                </span>
              </span>
              {apiKey.lastUsedAt && (
                <span>
                  Last used:{' '}
                  <span className="text-primary">
                    {new Date(apiKey.lastUsedAt).toLocaleDateString()}
                  </span>
                </span>
              )}
            </div>
          </div>

          {apiKey.isActive && !isExpired && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={onRotate}>
                Rotate
              </Button>
              <Button size="sm" variant="ghost" onClick={onRevoke}>
                Revoke
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CreateKeyModal({
  permissions,
  onClose,
  onSubmit,
  isLoading,
}: {
  permissions: Array<{ id: string; name: string; description: string }>
  onClose: () => void
  onSubmit: (data: CreateApiKeyRequest) => void
  isLoading: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState(['enhance'])
  const [environment, setEnvironment] = useState<'production' | 'test'>('production')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions: selectedPermissions,
      environment,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-primary mb-4">Create API Key</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My API Key"
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Used for production app"
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1">Environment</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={environment === 'production'}
                    onChange={() => setEnvironment('production')}
                    className="text-accent"
                  />
                  <span className="text-sm text-primary">Production</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={environment === 'test'}
                    onChange={() => setEnvironment('test')}
                    className="text-accent"
                  />
                  <span className="text-sm text-primary">Test</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1">Permissions</label>
              <div className="space-y-2">
                {(permissions.length > 0 ? permissions : [
                  { id: 'enhance', name: 'Enhance', description: 'Use the /enhance endpoint' },
                  { id: 'read_history', name: 'Read History', description: 'Read enhancement history' },
                  { id: 'models', name: 'Models', description: 'List available modalities' },
                ]).map((perm) => (
                  <label key={perm.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(perm.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPermissions([...selectedPermissions, perm.id])
                        } else {
                          setSelectedPermissions(selectedPermissions.filter((p) => p !== perm.id))
                        }
                      }}
                      className="mt-1 text-accent"
                    />
                    <div>
                      <span className="text-sm text-primary">{perm.name}</span>
                      <p className="text-xs text-muted">{perm.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={!name.trim() || selectedPermissions.length === 0 || isLoading}
              >
                {isLoading ? 'Creating...' : 'Create Key'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  onCancel,
  onConfirm,
  isLoading,
}: {
  title: string
  message: string
  confirmLabel: string
  confirmVariant?: 'primary' | 'danger'
  onCancel: () => void
  onConfirm: () => void
  isLoading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-sm mx-4">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-primary mb-2">{title}</h3>
          <p className="text-sm text-muted mb-6">{message}</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
