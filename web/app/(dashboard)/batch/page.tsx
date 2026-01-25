'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, type SelectOption } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useCanBatch } from '@/lib/hooks/useSubscription'
import { batchEnhance } from '@/lib/api/prompts'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'
import type { ToneType, OutputLength } from '@/lib/types/models'
import {
  Layers,
  Plus,
  Trash2,
  Play,
  Check,
  Loader2,
  AlertCircle,
  Crown,
  Copy,
} from 'lucide-react'

const toneOptions: SelectOption[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'academic', label: 'Academic' },
  { value: 'creative', label: 'Creative' },
  { value: 'technical', label: 'Technical' },
  { value: 'friendly', label: 'Friendly' },
]

const lengthOptions: SelectOption[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
]

interface BatchItem {
  id: string
  original: string
  enhanced?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
}

export default function BatchPage() {
  const router = useRouter()
  const canBatch = useCanBatch()

  const [items, setItems] = useState<BatchItem[]>([
    { id: '1', original: '', status: 'pending' },
    { id: '2', original: '', status: 'pending' },
    { id: '3', original: '', status: 'pending' },
  ])
  const [tone, setTone] = useState<ToneType>('professional')
  const [length, setLength] = useState<OutputLength>('standard')
  const [isProcessing, setIsProcessing] = useState(false)

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), original: '', status: 'pending' as const },
    ])
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const updateItem = useCallback((id: string, original: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, original, status: 'pending' as const } : item))
    )
  }, [])

  const handleProcess = useCallback(async () => {
    const validItems = items.filter((item) => item.original.trim())
    if (validItems.length === 0) {
      toast.warning('No prompts to enhance', 'Please add at least one prompt')
      return
    }

    setIsProcessing(true)

    // Mark all as processing
    setItems((prev) =>
      prev.map((item) =>
        item.original.trim() ? { ...item, status: 'processing' as const } : item
      )
    )

    try {
      const results = await batchEnhance({
        prompts: validItems.map((item) => item.original),
        tone,
        outputLength: length,
      })

      // Update items with results
      setItems((prev) =>
        prev.map((item) => {
          if (!item.original.trim()) return item

          const index = validItems.findIndex((v) => v.id === item.id)
          if (index === -1) return item

          const result = results[index]
          if (result?.enhancedPrompt) {
            return {
              ...item,
              enhanced: result.enhancedPrompt,
              status: 'completed' as const,
            }
          } else {
            return {
              ...item,
              status: 'failed' as const,
              error: 'Enhancement failed',
            }
          }
        })
      )

      toast.success('Batch processing complete')
    } catch (err) {
      setItems((prev) =>
        prev.map((item) =>
          item.status === 'processing'
            ? { ...item, status: 'failed' as const, error: 'Processing failed' }
            : item
        )
      )
      toast.error('Batch processing failed')
    } finally {
      setIsProcessing(false)
    }
  }, [items, tone, length])

  const copyAll = useCallback(() => {
    const enhanced = items
      .filter((item) => item.enhanced)
      .map((item) => item.enhanced)
      .join('\n\n---\n\n')

    if (enhanced) {
      navigator.clipboard.writeText(enhanced)
      toast.success('All enhanced prompts copied')
    }
  }, [items])

  const completedCount = items.filter((item) => item.status === 'completed').length

  // Gate premium feature
  if (!canBatch) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-indigo/10 mx-auto mb-4">
            <Crown className="h-8 w-8 text-brand-indigo" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Premium Feature
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Batch enhancement allows you to process multiple prompts at once. Upgrade to Premium to
            unlock this feature.
          </p>
          <Button onClick={() => router.push('/upgrade')}>Upgrade to Premium</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Layers className="h-6 w-6 text-brand-indigo" />
            Batch Enhancement
          </h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Process multiple prompts at once
          </p>
        </div>

        <div className="flex items-center gap-3">
          {completedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={copyAll}
              leftIcon={<Copy className="h-4 w-4" />}
            >
              Copy All ({completedCount})
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={addItem}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Add Prompt
          </Button>
        </div>
      </div>

      {/* Settings */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            options={toneOptions}
            value={tone}
            onChange={(value) => setTone(value as ToneType)}
            className="w-40"
            disabled={isProcessing}
          />
          <Select
            options={lengthOptions}
            value={length}
            onChange={(value) => setLength(value as OutputLength)}
            className="w-40"
            disabled={isProcessing}
          />
          <div className="flex-1" />
          <Button
            variant="cyan"
            onClick={handleProcess}
            isLoading={isProcessing}
            disabled={items.filter((i) => i.original.trim()).length === 0}
            leftIcon={!isProcessing && <Play className="h-4 w-4" />}
          >
            {isProcessing ? 'Processing...' : 'Enhance All'}
          </Button>
        </div>
      </Card>

      {/* Prompts list */}
      <div className="space-y-4">
        {items.map((item, index) => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-0">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  Prompt {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  {item.status === 'processing' && (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-indigo" />
                  )}
                  {item.status === 'completed' && (
                    <Badge variant="success">
                      <Check className="h-3 w-3 mr-1" />
                      Done
                    </Badge>
                  )}
                  {item.status === 'failed' && (
                    <Badge variant="danger">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  )}
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                      disabled={isProcessing}
                      className="text-red-500 hover:text-red-600 h-7 w-7"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-tertiary)] mb-1 block">
                    Original
                  </label>
                  <Textarea
                    placeholder="Enter your prompt..."
                    value={item.original}
                    onChange={(e) => updateItem(item.id, e.target.value)}
                    className="min-h-[100px]"
                    disabled={isProcessing}
                  />
                </div>

                {/* Enhanced */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-tertiary)] mb-1 block">
                    Enhanced
                  </label>
                  <div
                    className={cn(
                      'min-h-[100px] p-3 rounded-xl text-sm',
                      item.enhanced
                        ? 'bg-gradient-to-br from-brand-indigo/5 to-brand-cyan/5 border border-brand-indigo/20'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                    )}
                  >
                    {item.status === 'processing' ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Enhancing...</span>
                      </div>
                    ) : item.enhanced ? (
                      <p className="text-[var(--text-primary)] whitespace-pre-wrap">{item.enhanced}</p>
                    ) : item.error ? (
                      <p className="text-red-500">{item.error}</p>
                    ) : (
                      <p>Enhanced prompt will appear here</p>
                    )}
                  </div>
                  {item.enhanced && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        navigator.clipboard.writeText(item.enhanced!)
                        toast.success('Copied')
                      }}
                      leftIcon={<Copy className="h-3.5 w-3.5" />}
                    >
                      Copy
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add more prompt */}
      <Button
        variant="secondary"
        className="w-full"
        onClick={addItem}
        disabled={isProcessing}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        Add Another Prompt
      </Button>
    </div>
  )
}
