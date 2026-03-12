'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal, ModalFooter } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorDisplay } from '@/components/shared/error-boundary'
import { usePrompts, useToggleFavorite, useDeletePrompt } from '@/lib/hooks/usePrompts'
import { useCanExport } from '@/lib/hooks/useSubscription'
import { toast } from '@/lib/stores/uiStore'
import { formatDate, truncateText } from '@/lib/utils/formatters'
import { exportToText, exportToMarkdown, exportToPDF, downloadFile } from '@/lib/utils/exporters'
import { cn } from '@/lib/utils/cn'
import type { Prompt } from '@/lib/types/models'
import {
  Search,
  Star,
  Copy,
  Trash2,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  History,
  FileText,
  File,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import Image from 'next/image'

export default function HistoryPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Prompt | null>(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)

  const canExport = useCanExport()

  const { data, isLoading, error, refetch } = usePrompts({
    page,
    limit: 20,
    search: search || undefined,
    favoritesOnly: favoritesOnly || undefined,
  })

  const toggleFavorite = useToggleFavorite()
  const deletePrompt = useDeletePrompt()

  // Deduplicate prompts by ID to prevent duplicate entries
  const prompts = (data?.prompts || []).filter(
    (prompt, index, self) => index === self.findIndex((p) => p.id === prompt.id)
  )
  const pagination = data?.pagination

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }, [])

  const handleReenhance = useCallback((originalPrompt: string, modality?: Prompt['modality']) => {
    setSelectedPrompt(null)
    const params = new URLSearchParams({
      prompt: originalPrompt,
    })
    if (modality) {
      params.set('modality', modality)
    }
    router.push(`/dashboard?${params.toString()}`)
  }, [router])

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    await deletePrompt.mutateAsync(deleteConfirm.id)
    setDeleteConfirm(null)
  }, [deleteConfirm, deletePrompt])

  const handleExport = useCallback(
    (format: 'txt' | 'md' | 'pdf') => {
      if (!prompts.length) return

      const timestamp = new Date().toISOString().split('T')[0]

      switch (format) {
        case 'txt':
          downloadFile(exportToText(prompts), `promptomize-export-${timestamp}.txt`, 'text/plain')
          break
        case 'md':
          downloadFile(exportToMarkdown(prompts), `promptomize-export-${timestamp}.md`, 'text/markdown')
          break
        case 'pdf':
          downloadFile(exportToPDF(prompts), `promptomize-export-${timestamp}.pdf`, 'application/pdf')
          break
      }

      setExportModalOpen(false)
      toast.success('Export complete')
    },
    [prompts]
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Prompt History</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            {pagination?.total || 0} prompts saved
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExportModalOpen(true)}
            disabled={!canExport || !prompts.length}
            leftIcon={<Download className="h-4 w-4" />}
          >
            Export
          </Button>
          {!canExport && (
            <Badge variant="pro" className="text-[10px]">
              PRO
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <Button
          variant={favoritesOnly ? 'primary' : 'secondary'}
          onClick={() => {
            setFavoritesOnly(!favoritesOnly)
            setPage(1)
          }}
          leftIcon={<Star className={cn('h-4 w-4', favoritesOnly && 'fill-current')} />}
        >
          Favorites
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-1/4 mb-3" />
              <Skeleton className="h-20 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorDisplay onRetry={() => refetch()} />
      ) : prompts.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title={search || favoritesOnly ? 'No matches found' : 'No prompts yet'}
          description={
            search || favoritesOnly
              ? 'Try adjusting your search or filters'
              : 'Enhanced prompts will appear here'
          }
        />
      ) : (
        <>
          {/* Prompt list */}
          <div className="space-y-4">
            {prompts.map((prompt) => (
              <Card
                key={prompt.id}
                hover
                className="p-4 cursor-pointer"
                onClick={() => setSelectedPrompt(prompt)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {formatDate(prompt.createdAt)}
                      </span>
                      {prompt.tone && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {prompt.tone}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                      {truncateText(prompt.originalPrompt, 150)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-primary)] line-clamp-2">
                      {truncateText(prompt.enhancedPrompt, 200)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite.mutate({ id: prompt.id, isFavorite: !prompt.isFavorite })
                      }}
                      className={cn(prompt.isFavorite && 'text-yellow-500')}
                    >
                      <Star className={cn('h-4 w-4', prompt.isFavorite && 'fill-current')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopy(prompt.enhancedPrompt)
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirm(prompt)
                      }}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                leftIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>
              <span className="text-sm text-[var(--text-secondary)]">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
                rightIcon={<ChevronRight className="h-4 w-4" />}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Prompt detail modal */}
      <Modal
        isOpen={!!selectedPrompt}
        onClose={() => setSelectedPrompt(null)}
        title="Prompt Details"
        size="lg"
      >
        {selectedPrompt && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)]">Original</label>
              <div className="mt-1 p-3 rounded-lg bg-[var(--bg-tertiary)] text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                {selectedPrompt.originalPrompt}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)]">Enhanced</label>
              <div className="mt-1 p-3 rounded-lg bg-brand-indigo/5 dark:bg-brand-cyan/5 border border-brand-indigo/20 dark:border-brand-cyan/20 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                {selectedPrompt.enhancedPrompt}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedPrompt.tone && (
                <Badge variant="outline" className="capitalize">
                  {selectedPrompt.tone}
                </Badge>
              )}
              {selectedPrompt.outputLength && (
                <Badge variant="outline" className="capitalize">
                  {selectedPrompt.outputLength}
                </Badge>
              )}
              {selectedPrompt.model && (
                <Badge variant="outline">{selectedPrompt.model}</Badge>
              )}
            </div>
            {/* Try it in AI services */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-[var(--text-tertiary)] mr-1">Try it in:</span>
              <button
                onClick={() => {
                  window.open(`https://claude.ai/new?q=${encodeURIComponent(selectedPrompt.enhancedPrompt)}`, '_blank')
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D97706]/30 hover:bg-[#D97706]/10 transition-colors"
              >
                <Image
                  src="/logos/claude-logo.png"
                  alt="Claude"
                  width={20}
                  height={20}
                  className="object-contain"
                />
                <ExternalLink className="h-3 w-3 text-[#D97706]" />
              </button>
              <button
                onClick={() => {
                  window.open(`https://chatgpt.com/?q=${encodeURIComponent(selectedPrompt.enhancedPrompt)}`, '_blank')
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#10A37F]/30 hover:bg-[#10A37F]/10 transition-colors"
              >
                <Image
                  src="/logos/chatgpt-logo.png"
                  alt="ChatGPT"
                  width={20}
                  height={20}
                  className="object-contain"
                />
                <ExternalLink className="h-3 w-3 text-[#10A37F]" />
              </button>
            </div>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setSelectedPrompt(null)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleReenhance(selectedPrompt.originalPrompt, selectedPrompt.modality)}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                Enhance Again
              </Button>
              <Button
                onClick={() => handleCopy(selectedPrompt.enhancedPrompt)}
                leftIcon={<Copy className="h-4 w-4" />}
              >
                Copy Enhanced
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Prompt"
        description="Are you sure you want to delete this prompt? This action cannot be undone."
        size="sm"
      >
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deletePrompt.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>

      {/* Export modal */}
      <Modal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Prompts"
        description="Choose a format to export your prompts"
        size="sm"
      >
        <div className="space-y-3">
          <button
            onClick={() => handleExport('txt')}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <File className="h-5 w-5 text-[var(--text-tertiary)]" />
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)]">Plain Text (.txt)</p>
              <p className="text-xs text-[var(--text-secondary)]">Simple text format</p>
            </div>
          </button>
          <button
            onClick={() => handleExport('md')}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <FileText className="h-5 w-5 text-[var(--text-tertiary)]" />
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)]">Markdown (.md)</p>
              <p className="text-xs text-[var(--text-secondary)]">Formatted with headers</p>
            </div>
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Download className="h-5 w-5 text-[var(--text-tertiary)]" />
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)]">PDF Document (.pdf)</p>
              <p className="text-xs text-[var(--text-secondary)]">Professional printable format</p>
            </div>
          </button>
        </div>
      </Modal>
    </div>
  )
}
