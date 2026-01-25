'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, type SelectOption } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal, ModalFooter } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorDisplay } from '@/components/shared/error-boundary'
import { useTemplates, useCreateTemplate, useDeleteTemplate, useIncrementTemplateUsage } from '@/lib/hooks/useTemplates'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'
import type { Template, TemplateCategory } from '@/lib/types/models'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  FileText,
  Code,
  PenLine,
  Briefcase,
  Palette,
  BookOpen,
  BarChart,
  Trash2,
  Sparkles,
} from 'lucide-react'

const categoryIcons: Record<TemplateCategory, React.ReactNode> = {
  general: <FileText className="h-5 w-5" />,
  coding: <Code className="h-5 w-5" />,
  writing: <PenLine className="h-5 w-5" />,
  business: <Briefcase className="h-5 w-5" />,
  creative: <Palette className="h-5 w-5" />,
  research: <BookOpen className="h-5 w-5" />,
  analysis: <BarChart className="h-5 w-5" />,
}

const categoryOptions: SelectOption[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'general', label: 'General', icon: <FileText className="h-4 w-4" /> },
  { value: 'coding', label: 'Coding', icon: <Code className="h-4 w-4" /> },
  { value: 'writing', label: 'Writing', icon: <PenLine className="h-4 w-4" /> },
  { value: 'business', label: 'Business', icon: <Briefcase className="h-4 w-4" /> },
  { value: 'creative', label: 'Creative', icon: <Palette className="h-4 w-4" /> },
  { value: 'research', label: 'Research', icon: <BookOpen className="h-4 w-4" /> },
  { value: 'analysis', label: 'Analysis', icon: <BarChart className="h-4 w-4" /> },
]

const createCategoryOptions = categoryOptions.filter((opt) => opt.value !== 'all')

export default function TemplatesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Template | null>(null)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState<TemplateCategory>('general')

  const { setCustomInstructions } = useSettingsStore()

  const { data, isLoading, error, refetch } = useTemplates({
    category: category !== 'all' ? (category as TemplateCategory) : undefined,
    search: search || undefined,
  })

  const createTemplate = useCreateTemplate()
  const deleteTemplate = useDeleteTemplate()
  const incrementUsage = useIncrementTemplateUsage()

  const templates = data?.templates || []

  const handleUseTemplate = useCallback(
    async (template: Template) => {
      // Update usage count
      incrementUsage.mutate(template.id)

      // Navigate to dashboard with template content
      router.push(`/dashboard?template=${encodeURIComponent(template.content)}`)
      toast.success('Template loaded')
    },
    [incrementUsage, router]
  )

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !newContent.trim()) {
      toast.error('Please fill in name and content')
      return
    }

    await createTemplate.mutateAsync({
      name: newName,
      content: newContent,
      description: newDescription || undefined,
      category: newCategory,
    })

    setCreateModalOpen(false)
    setNewName('')
    setNewContent('')
    setNewDescription('')
    setNewCategory('general')
  }, [newName, newContent, newDescription, newCategory, createTemplate])

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    await deleteTemplate.mutateAsync(deleteConfirm.id)
    setDeleteConfirm(null)
  }, [deleteConfirm, deleteTemplate])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Templates</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Pre-built prompts for common use cases
          </p>
        </div>

        <Button onClick={() => setCreateModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
          Create Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <Select
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          className="w-48"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-6 w-6 rounded-lg mb-3" />
              <Skeleton className="h-5 w-2/3 mb-2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4 mt-1" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorDisplay onRetry={() => refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={search || category !== 'all' ? 'No templates found' : 'No templates yet'}
          description={
            search || category !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first template to get started'
          }
          action={{
            label: 'Create Template',
            onClick: () => setCreateModalOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card
              key={template.id}
              hover
              className="p-4 cursor-pointer relative group"
              onClick={() => setSelectedTemplate(template)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0',
                    template.isBuiltIn ? 'bg-brand-indigo/10 text-brand-indigo' : 'bg-brand-cyan/10 text-brand-cyan'
                  )}
                >
                  {categoryIcons[template.category] || <FileText className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[var(--text-primary)] truncate">
                      {template.name}
                    </h3>
                    {template.isBuiltIn && (
                      <Badge variant="outline" className="text-[10px]">
                        Built-in
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mt-1">
                    {template.description || template.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {template.category}
                    </Badge>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      Used {template.usageCount} times
                    </span>
                  </div>
                </div>
              </div>

              {/* Delete button for user templates */}
              {!template.isBuiltIn && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirm(template)
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Template detail modal */}
      <Modal
        isOpen={!!selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        title={selectedTemplate?.name}
        size="lg"
      >
        {selectedTemplate && (
          <div className="space-y-4">
            {selectedTemplate.description && (
              <p className="text-[var(--text-secondary)]">{selectedTemplate.description}</p>
            )}

            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Template Content
              </label>
              <div className="mt-1 p-4 rounded-xl bg-[var(--bg-tertiary)] text-sm whitespace-pre-wrap font-mono">
                {selectedTemplate.content}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {selectedTemplate.category}
              </Badge>
              {selectedTemplate.isBuiltIn && (
                <Badge variant="primary">Built-in</Badge>
              )}
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={() => setSelectedTemplate(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  handleUseTemplate(selectedTemplate)
                  setSelectedTemplate(null)
                }}
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                Use Template
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

      {/* Create template modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Template"
        description="Create a reusable prompt template"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g., Blog Post Writer"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <Select
            label="Category"
            options={createCategoryOptions}
            value={newCategory}
            onChange={(value) => setNewCategory(value as TemplateCategory)}
          />

          <Textarea
            label="Template Content"
            placeholder="Enter your prompt template..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="min-h-[150px] font-mono"
          />

          <Textarea
            label="Description (optional)"
            placeholder="Describe what this template is for..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="min-h-[80px]"
          />

          <ModalFooter>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createTemplate.isPending}
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
        title="Delete Template"
        description="Are you sure you want to delete this template? This action cannot be undone."
        size="sm"
      >
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteTemplate.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
