'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Modal, ModalFooter } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorDisplay } from '@/components/shared/error-boundary'
import { useCollections, useCollection, useCreateCollection, useDeleteCollection, useRemoveFromCollection } from '@/lib/hooks/useCollections'
import { formatDate, truncateText } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'
import type { Collection, Prompt } from '@/lib/types/models'
import {
  Plus,
  FolderOpen,
  Folder,
  ChevronRight,
  Trash2,
  X,
} from 'lucide-react'

const collectionColors = [
  '#5B4CDB', // Indigo
  '#00E6E6', // Cyan
  '#F5A623', // Gold
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#A78BFA', // Purple
  '#34D399', // Green
  '#F472B6', // Pink
]

export default function CollectionsPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Collection | null>(null)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColor, setNewColor] = useState(collectionColors[0])

  const { data: collectionsData, isLoading, error, refetch } = useCollections()
  const { data: selectedCollectionData, isLoading: loadingCollection } = useCollection(selectedCollection || '')
  const createCollection = useCreateCollection()
  const deleteCollection = useDeleteCollection()
  const removeFromCollection = useRemoveFromCollection()

  const collections = collectionsData?.collections || []

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      return
    }

    await createCollection.mutateAsync({
      name: newName,
      description: newDescription || undefined,
      color: newColor,
    })

    setCreateModalOpen(false)
    setNewName('')
    setNewDescription('')
    setNewColor(collectionColors[0])
  }, [newName, newDescription, newColor, createCollection])

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    await deleteCollection.mutateAsync(deleteConfirm.id)
    setDeleteConfirm(null)
    if (selectedCollection === deleteConfirm.id) {
      setSelectedCollection(null)
    }
  }, [deleteConfirm, deleteCollection, selectedCollection])

  const handleRemovePrompt = useCallback(
    async (promptId: string) => {
      if (!selectedCollection) return
      await removeFromCollection.mutateAsync({
        collectionId: selectedCollection,
        promptIds: [promptId],
      })
    },
    [selectedCollection, removeFromCollection]
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Collections</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Organize your prompts into folders
          </p>
        </div>

        <Button onClick={() => setCreateModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
          New Collection
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collections list */}
        <div className="lg:col-span-1 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-2/3 mb-2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : error ? (
            <ErrorDisplay onRetry={() => refetch()} />
          ) : collections.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-8 w-8" />}
              title="No collections yet"
              description="Create your first collection to organize prompts"
              action={{
                label: 'Create Collection',
                onClick: () => setCreateModalOpen(true),
              }}
            />
          ) : (
            <div className="space-y-2">
              {collections.map((collection) => (
                <Card
                  key={collection.id}
                  hover
                  className={cn(
                    'p-4 cursor-pointer relative group',
                    selectedCollection === collection.id && 'ring-2 ring-brand-indigo'
                  )}
                  onClick={() => setSelectedCollection(collection.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${collection.color}20` }}
                    >
                      <Folder className="h-5 w-5" style={{ color: collection.color || '#5B4CDB' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[var(--text-primary)] truncate">
                        {collection.name}
                      </h3>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {collection.promptCount} prompts
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[var(--text-tertiary)]" />
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteConfirm(collection)
                    }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Collection detail */}
        <div className="lg:col-span-2">
          {selectedCollection ? (
            <Card className="h-full">
              <CardContent className="p-6">
                {loadingCollection ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="space-y-3 mt-6">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                      ))}
                    </div>
                  </div>
                ) : selectedCollectionData ? (
                  <>
                    <div className="flex items-center gap-3 mb-6">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${selectedCollectionData.color}20` }}
                      >
                        <Folder
                          className="h-6 w-6"
                          style={{ color: selectedCollectionData.color || '#5B4CDB' }}
                        />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">
                          {selectedCollectionData.name}
                        </h2>
                        {selectedCollectionData.description && (
                          <p className="text-sm text-[var(--text-secondary)]">
                            {selectedCollectionData.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {selectedCollectionData.prompts?.length === 0 ? (
                      <EmptyState
                        icon={<FolderOpen className="h-8 w-8" />}
                        title="No prompts yet"
                        description="Add prompts to this collection from the history page"
                      />
                    ) : (
                      <div className="space-y-3">
                        {selectedCollectionData.prompts?.map((prompt) => (
                          <div
                            key={prompt.id}
                            className="p-4 rounded-xl bg-[var(--bg-tertiary)] relative group"
                          >
                            <p className="text-sm text-[var(--text-secondary)] mb-2">
                              {truncateText(prompt.originalPrompt, 100)}
                            </p>
                            <p className="text-sm text-[var(--text-primary)]">
                              {truncateText(prompt.enhancedPrompt, 150)}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)] mt-2">
                              {formatDate(prompt.createdAt)}
                            </p>

                            <button
                              onClick={() => handleRemovePrompt(prompt.id)}
                              className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <EmptyState
                icon={<FolderOpen className="h-8 w-8" />}
                title="Select a collection"
                description="Choose a collection from the list to view its prompts"
              />
            </Card>
          )}
        </div>
      </div>

      {/* Create collection modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Collection"
        description="Create a new collection to organize your prompts"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g., Work Projects"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <Textarea
            label="Description (optional)"
            placeholder="What is this collection for?"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="min-h-[80px]"
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {collectionColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  className={cn(
                    'h-8 w-8 rounded-full transition-all',
                    newColor === color && 'ring-2 ring-offset-2 ring-brand-indigo'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <ModalFooter>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createCollection.isPending}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Create
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Collection"
        description="Are you sure you want to delete this collection? The prompts inside won't be deleted."
        size="sm"
      >
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteCollection.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
