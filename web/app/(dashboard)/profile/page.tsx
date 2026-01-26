'use client'

import { useState, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal, ModalFooter } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/lib/stores/authStore'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useUserStats, useSessions } from '@/lib/hooks/useAnalytics'
import { updateProfile, deleteAccount } from '@/lib/api/users'
import { deleteSession } from '@/lib/api/analytics'
import { toast } from '@/lib/stores/uiStore'
import { formatDate, formatNumber } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'
import { useRouter } from 'next/navigation'
import {
  User,
  Mail,
  Crown,
  Calendar,
  LogOut,
  Trash2,
  Monitor,
  Smartphone,
  Laptop,
  Shield,
  AlertTriangle,
} from 'lucide-react'

const deviceIcons: Record<string, React.ReactNode> = {
  desktop: <Monitor className="h-5 w-5" />,
  mobile: <Smartphone className="h-5 w-5" />,
  tablet: <Laptop className="h-5 w-5" />,
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, logout, logoutAllDevices } = useAuthStore()
  const { subscription } = useSubscription()
  const { data: stats, isLoading: statsLoading } = useUserStats()
  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useSessions()

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(user?.name || '')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const sessions = sessionsData?.sessions || []

  const handleUpdateName = useCallback(async () => {
    if (!newName.trim()) return

    try {
      await updateProfile({ name: newName })
      toast.success('Profile updated')
      setEditingName(false)
    } catch {
      toast.error('Failed to update profile')
    }
  }, [newName])

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId)
        toast.success('Session terminated')
        refetchSessions()
      } catch {
        toast.error('Failed to terminate session')
      }
    },
    [refetchSessions]
  )

  const handleDeleteAccount = useCallback(async () => {
    if (deleteInput !== 'DELETE') return

    setIsDeleting(true)
    try {
      await deleteAccount()
      toast.success('Account deleted')
      logout()
      router.push('/')
    } catch {
      toast.error('Failed to delete account')
      setIsDeleting(false)
    }
  }, [deleteInput, logout, router])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Profile</h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          Manage your account and preferences
        </p>
      </div>

      {/* User Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden bg-brand-indigo dark:bg-brand-cyan flex-shrink-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || 'User'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-white dark:text-black">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={handleUpdateName}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingName(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">
                    {user?.name || 'User'}
                  </h2>
                  <button
                    onClick={() => {
                      setNewName(user?.name || '')
                      setEditingName(true)
                    }}
                    className="text-xs text-brand-indigo hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 mt-1 text-[var(--text-secondary)]">
                <Mail className="h-4 w-4" />
                <span>{user?.email}</span>
              </div>

              <div className="flex items-center gap-3 mt-3">
                <Badge
                  variant={
                    subscription.tier === 'PREMIUM'
                      ? 'premium'
                      : subscription.tier === 'PRO'
                      ? 'pro'
                      : 'outline'
                  }
                >
                  {subscription.tier === 'PREMIUM' && <Crown className="h-3 w-3 mr-1" />}
                  {subscription.tier}
                </Badge>
                {subscription.isTrialing && (
                  <Badge variant="cyan">Trial</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand-indigo" />
            Account Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Total Prompts</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatNumber(stats?.totalPrompts || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Total Tokens</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatNumber(stats?.totalTokens || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Current Streak</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {stats?.currentStreak || 0} days
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Member Since</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {stats?.memberSince
                    ? new Date(stats.memberSince).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-brand-cyan" />
              Active Sessions
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logoutAllDevices()
                router.push('/login')
              }}
              className="text-red-500 hover:text-red-600"
            >
              Sign out all
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)]">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-[var(--text-tertiary)] text-center py-4">No active sessions</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl',
                    session.isCurrent ? 'bg-brand-indigo/5 border border-brand-indigo/20' : 'bg-[var(--bg-tertiary)]'
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
                    {deviceIcons[session.deviceType || 'desktop'] || <Monitor className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {session.deviceName || 'Unknown Device'}
                      </p>
                      {session.isCurrent && (
                        <Badge variant="primary" className="text-[10px]">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Last active {formatDate(session.lastActive)}
                    </p>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteSession(session.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
            Delete Account
          </Button>
        </CardContent>
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setDeleteInput('')
        }}
        title="Delete Account"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
            <p className="text-sm text-red-500">
              This action cannot be undone. This will permanently delete your account and remove all
              your data from our servers.
            </p>
          </div>

          <Input
            label="Type DELETE to confirm"
            placeholder="DELETE"
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
          />

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setDeleteInput('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deleteInput !== 'DELETE'}
              isLoading={isDeleting}
            >
              Delete Account
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  )
}
