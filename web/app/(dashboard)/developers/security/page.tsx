'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal, ModalFooter } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/stores/uiStore'
import { apiClient } from '@/lib/api/client'
import {
  Shield,
  Key,
  Globe,
  Lock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  environment: string
}

interface SecurityStatus {
  score: number
  grade: string
  ipWhitelistEnabled: boolean
  allowedIpsCount: number
  requestSigningEnabled: boolean
  failedAttempts: number
  isLocked: boolean
  lockedUntil: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  recentHighRiskEvents: number
  recommendations: string[]
}

interface AuditLog {
  id: string
  action: string
  endpoint: string
  method: string
  statusCode: number
  ipAddress: string
  riskLevel: string
  createdAt: string
}

export default function SecurityPage() {
  const queryClient = useQueryClient()
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [ipInput, setIpInput] = useState('')
  const [showSigningSecret, setShowSigningSecret] = useState(false)
  const [signingSecret, setSigningSecret] = useState<string | null>(null)
  const [enableSigningModal, setEnableSigningModal] = useState(false)

  // Fetch API keys
  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const response = await apiClient.get('/api-keys')
      return response.data as { apiKeys: ApiKey[] }
    },
  })

  const apiKeys = keysData?.apiKeys || []

  // Fetch security status for selected key
  const { data: securityData, isLoading: securityLoading } = useQuery({
    queryKey: ['apiKeySecurity', selectedKeyId],
    queryFn: async () => {
      if (!selectedKeyId) return null
      const response = await apiClient.get(`/api-keys/${selectedKeyId}/security`)
      return response.data as { security: SecurityStatus }
    },
    enabled: !!selectedKeyId,
  })

  const security = securityData?.security

  // Fetch IP whitelist
  const { data: ipData } = useQuery({
    queryKey: ['apiKeyIpWhitelist', selectedKeyId],
    queryFn: async () => {
      if (!selectedKeyId) return null
      const response = await apiClient.get(`/api-keys/${selectedKeyId}/ip-whitelist`)
      return response.data as { allowedIps: string[]; allowedOrigins: string[] }
    },
    enabled: !!selectedKeyId,
  })

  // Fetch audit logs
  const { data: auditData } = useQuery({
    queryKey: ['apiKeyAuditLogs', selectedKeyId],
    queryFn: async () => {
      if (!selectedKeyId) return null
      const response = await apiClient.get(`/api-keys/${selectedKeyId}/audit-logs?limit=10`)
      return response.data as { auditLogs: AuditLog[] }
    },
    enabled: !!selectedKeyId,
  })

  // Add IP mutation
  const addIpMutation = useMutation({
    mutationFn: async (ips: string[]) => {
      const response = await apiClient.post(`/api-keys/${selectedKeyId}/ip-whitelist`, { ips })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeyIpWhitelist', selectedKeyId] })
      queryClient.invalidateQueries({ queryKey: ['apiKeySecurity', selectedKeyId] })
      toast.success('IP added to whitelist')
      setIpInput('')
    },
    onError: () => {
      toast.error('Failed to add IP')
    },
  })

  // Remove IP mutation
  const removeIpMutation = useMutation({
    mutationFn: async (ips: string[]) => {
      const response = await apiClient.delete(`/api-keys/${selectedKeyId}/ip-whitelist`, {
        data: { ips },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeyIpWhitelist', selectedKeyId] })
      queryClient.invalidateQueries({ queryKey: ['apiKeySecurity', selectedKeyId] })
      toast.success('IP removed from whitelist')
    },
    onError: () => {
      toast.error('Failed to remove IP')
    },
  })

  // Enable signing mutation
  const enableSigningMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/api-keys/${selectedKeyId}/signing`)
      return response.data as { signingSecret: string }
    },
    onSuccess: (data) => {
      setSigningSecret(data.signingSecret)
      setEnableSigningModal(true)
      queryClient.invalidateQueries({ queryKey: ['apiKeySecurity', selectedKeyId] })
    },
    onError: () => {
      toast.error('Failed to enable request signing')
    },
  })

  // Disable signing mutation
  const disableSigningMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/api-keys/${selectedKeyId}/signing`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeySecurity', selectedKeyId] })
      toast.success('Request signing disabled')
    },
    onError: () => {
      toast.error('Failed to disable request signing')
    },
  })

  const handleAddIp = () => {
    if (!ipInput.trim()) return
    addIpMutation.mutate([ipInput.trim()])
  }

  const handleCopySecret = () => {
    if (signingSecret) {
      navigator.clipboard.writeText(signingSecret)
      toast.success('Signing secret copied')
    }
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
        return 'text-green-500'
      case 'B':
        return 'text-blue-500'
      case 'C':
        return 'text-yellow-500'
      case 'D':
        return 'text-orange-500'
      default:
        return 'text-red-500'
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'bg-green-500/10 text-green-500'
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-500'
      case 'high':
        return 'bg-orange-500/10 text-orange-500'
      case 'critical':
        return 'bg-red-500/10 text-red-500'
      default:
        return 'bg-gray-500/10 text-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Security Settings</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Configure enterprise-grade security features for your API keys
        </p>
      </div>

      {/* Key Selector */}
      <Card className="p-4">
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
          Select API Key
        </label>
        {keysLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <select
            value={selectedKeyId || ''}
            onChange={(e) => setSelectedKeyId(e.target.value || null)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)]"
          >
            <option value="">Select a key...</option>
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name} ({key.keyPrefix}...){' '}
                {key.environment === 'test' ? '[TEST]' : '[LIVE]'}
              </option>
            ))}
          </select>
        )}
      </Card>

      {selectedKeyId && (
        <>
          {/* Security Score */}
          {securityLoading ? (
            <Card className="p-6">
              <Skeleton className="h-32 w-full" />
            </Card>
          ) : security ? (
            <Card className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security Score
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Based on your current security configuration
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-4xl font-bold ${getGradeColor(security.grade)}`}>
                    {security.grade}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">{security.score}/100</div>
                </div>
              </div>

              {/* Security Status Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Globe className="h-4 w-4" />
                    IP Whitelist
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {security.ipWhitelistEnabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {security.ipWhitelistEnabled
                        ? `${security.allowedIpsCount} IPs`
                        : 'Disabled'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Key className="h-4 w-4" />
                    Request Signing
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {security.requestSigningEnabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {security.requestSigningEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Lock className="h-4 w-4" />
                    Failed Attempts
                  </div>
                  <div className="mt-1">
                    <span
                      className={`text-sm font-medium ${
                        security.failedAttempts > 0 ? 'text-orange-500' : 'text-green-500'
                      }`}
                    >
                      {security.failedAttempts}
                    </span>
                    {security.isLocked && (
                      <Badge variant="danger" className="ml-2 text-xs">
                        LOCKED
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <AlertTriangle className="h-4 w-4" />
                    High-Risk Events
                  </div>
                  <div className="mt-1">
                    <span
                      className={`text-sm font-medium ${
                        security.recentHighRiskEvents > 0 ? 'text-red-500' : 'text-green-500'
                      }`}
                    >
                      {security.recentHighRiskEvents} (24h)
                    </span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              {security.recommendations.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {security.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-[var(--text-primary)]"
                      >
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ) : null}

          {/* IP Whitelist */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Globe className="h-5 w-5" />
              IP Whitelist
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 mb-4">
              Restrict API access to specific IP addresses. Supports exact IPs, CIDR notation
              (192.168.1.0/24), and wildcards (192.168.*.*).
            </p>

            {/* Add IP */}
            <div className="flex gap-2 mb-4">
              <Input
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="Enter IP address or CIDR..."
                className="flex-1"
              />
              <Button
                onClick={handleAddIp}
                disabled={!ipInput.trim() || addIpMutation.isPending}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add IP
              </Button>
            </div>

            {/* IP List */}
            {ipData?.allowedIps && ipData.allowedIps.length > 0 ? (
              <div className="space-y-2">
                {ipData.allowedIps.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]"
                  >
                    <code className="text-sm text-[var(--text-primary)]">{ip}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIpMutation.mutate([ip])}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] italic">
                No IP restrictions configured. All IPs are currently allowed.
              </p>
            )}
          </Card>

          {/* Request Signing */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Key className="h-5 w-5" />
              Request Signing (HMAC-SHA256)
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 mb-4">
              Require cryptographic signatures on all requests to prevent tampering and replay
              attacks.
            </p>

            {security?.requestSigningEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="success">Enabled</Badge>
                  <span className="text-sm text-[var(--text-secondary)]">
                    All requests must include X-Signature and X-Timestamp headers
                  </span>
                </div>
                <Button
                  variant="danger"
                  onClick={() => disableSigningMutation.mutate()}
                  disabled={disableSigningMutation.isPending}
                >
                  Disable Request Signing
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => enableSigningMutation.mutate()}
                disabled={enableSigningMutation.isPending}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                Enable Request Signing
              </Button>
            )}

            {/* Documentation */}
            <div className="mt-4 p-4 rounded-lg bg-[var(--bg-secondary)]">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">
                How to sign requests:
              </h4>
              <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
                <li>Get current timestamp in milliseconds</li>
                <li>Create payload: {'{timestamp}.{requestBody}'}</li>
                <li>Generate HMAC-SHA256 signature using your signing secret</li>
                <li>Include X-Timestamp and X-Signature headers</li>
              </ol>
              <pre className="mt-3 p-3 rounded bg-[var(--bg-primary)] text-xs overflow-x-auto">
                {`const timestamp = Date.now();
const payload = \`\${timestamp}.\${JSON.stringify(body)}\`;
const signature = crypto
  .createHmac('sha256', signingSecret)
  .update(payload)
  .digest('hex');

headers['X-Timestamp'] = timestamp;
headers['X-Signature'] = signature;`}
              </pre>
            </div>
          </Card>

          {/* Audit Logs */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Recent Security Events
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Last 10 security-related events for this API key
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ['apiKeyAuditLogs', selectedKeyId] })
                }
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                Refresh
              </Button>
            </div>

            {auditData?.auditLogs && auditData.auditLogs.length > 0 ? (
              <div className="space-y-2">
                {auditData.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]"
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={getRiskColor(log.riskLevel)}>{log.riskLevel}</Badge>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {log.action}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {log.method} {log.endpoint} from {log.ipAddress}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={log.statusCode < 400 ? 'success' : 'danger'}
                        className="text-xs"
                      >
                        {log.statusCode}
                      </Badge>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] italic">No security events yet.</p>
            )}
          </Card>
        </>
      )}

      {/* Signing Secret Modal */}
      <Modal
        isOpen={enableSigningModal}
        onClose={() => {
          setEnableSigningModal(false)
          setSigningSecret(null)
        }}
        title="Request Signing Enabled"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              <strong>Important:</strong> Save this signing secret now. You won't be able to see it
              again.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Signing Secret
            </label>
            <div className="flex gap-2">
              <Input
                value={showSigningSecret ? signingSecret || '' : '••••••••••••••••••••••••••••••••'}
                readOnly
                className="font-mono"
              />
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setShowSigningSecret(!showSigningSecret)}
              >
                {showSigningSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button variant="secondary" size="icon" onClick={handleCopySecret}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button
            onClick={() => {
              setEnableSigningModal(false)
              setSigningSecret(null)
            }}
          >
            I've saved the secret
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
