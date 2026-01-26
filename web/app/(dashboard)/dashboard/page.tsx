'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, type SelectOption } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useEnhance } from '@/lib/hooks/useEnhance'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'
import type { ToneType, OutputLength } from '@/lib/types/models'
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Crown,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

const toneOptions: SelectOption[] = [
  { value: 'professional', label: 'Professional', description: 'Clear and business-appropriate' },
  { value: 'casual', label: 'Casual', description: 'Friendly and conversational' },
  { value: 'academic', label: 'Academic', description: 'Scholarly and research-focused' },
  { value: 'creative', label: 'Creative', description: 'Imaginative and expressive' },
  { value: 'technical', label: 'Technical', description: 'Precise and detail-oriented' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
]

const lengthOptions: SelectOption[] = [
  { value: 'concise', label: 'Concise', description: 'Brief and to the point' },
  { value: 'standard', label: 'Standard', description: 'Balanced detail level' },
  { value: 'detailed', label: 'Detailed', description: 'Comprehensive coverage' },
]

export default function DashboardPage() {
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const { selectedTone, setTone, outputLength, setOutputLength, deepThinkEnabled, setDeepThink } =
    useSettingsStore()
  const { subscription, usage } = useSubscription()
  const { isEnhancing, streamedContent, result, error, progress, enhance, reset } = useEnhance()

  const tier = subscription.tier
  const canDeepThink = tier === 'PRO' || tier === 'PREMIUM'
  const canEnhance = usage.canCreatePrompt

  const handleEnhance = useCallback(async () => {
    if (!prompt.trim()) {
      toast.warning('Empty prompt', 'Please enter a prompt to enhance')
      return
    }

    if (!canEnhance) {
      toast.error('Daily limit reached', 'Upgrade to get more prompts')
      return
    }

    try {
      await enhance(prompt, {
        tone: selectedTone,
        outputLength,
        deepThink: canDeepThink && deepThinkEnabled,
      })
      toast.success('Prompt enhanced!')
    } catch (err) {
      // Error already shown in state
    }
  }, [prompt, selectedTone, outputLength, deepThinkEnabled, canDeepThink, canEnhance, enhance])

  const handleCopy = useCallback(async () => {
    const textToCopy = result?.enhancedPrompt || streamedContent
    if (!textToCopy) return

    await navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }, [result, streamedContent])

  const handleReset = useCallback(() => {
    setPrompt('')
    reset()
  }, [reset])

  const displayContent = result?.enhancedPrompt || streamedContent
  const hasOutput = !!displayContent

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Enhance Your Prompt</h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          Transform your ideas into powerful AI instructions
        </p>
      </div>

      {/* Quota warning */}
      {!canEnhance && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-[var(--text-primary)]">Daily limit reached</p>
            <p className="text-sm text-[var(--text-secondary)]">
              You've used all {usage.dailyPromptsLimit} prompts today.
            </p>
          </div>
          <Link href="/upgrade">
            <Button variant="cyan" size="sm">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Main enhancement card */}
      <Card variant="elevated" className="overflow-hidden">
        <CardContent className="p-0">
          {/* Input Section */}
          <div className="p-6 border-b border-[var(--border)]">
            <Textarea
              placeholder="Enter your prompt here... e.g., 'Write a blog post about AI'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[150px] text-base border-0 bg-transparent focus:ring-0 resize-none"
              disabled={isEnhancing}
            />

            {/* Options Row */}
            <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-[var(--border)]">
              <Select
                options={toneOptions}
                value={selectedTone}
                onChange={(value) => setTone(value as ToneType)}
                placeholder="Select tone"
                className="w-40"
                disabled={isEnhancing}
              />

              <Select
                options={lengthOptions}
                value={outputLength}
                onChange={(value) => setOutputLength(value as OutputLength)}
                placeholder="Output length"
                className="w-40"
                disabled={isEnhancing}
              />

              <div className="flex items-center gap-2">
                <Switch
                  checked={canDeepThink && deepThinkEnabled}
                  onChange={setDeepThink}
                  disabled={!canDeepThink || isEnhancing}
                />
                <span className="text-sm text-[var(--text-secondary)]">Deep Think</span>
                {!canDeepThink && (
                  <Badge variant="pro" className="text-[10px]">
                    PRO
                  </Badge>
                )}
              </div>

              <div className="flex-1" />

              <Button
                variant="cyan"
                size="lg"
                onClick={handleEnhance}
                disabled={!prompt.trim() || isEnhancing || !canEnhance}
                isLoading={isEnhancing}
                leftIcon={!isEnhancing && <Sparkles className="h-5 w-5" />}
                className="min-w-[140px]"
              >
                {isEnhancing ? 'Enhancing...' : 'Enhance'}
              </Button>
            </div>
          </div>

          {/* Output Section */}
          {(hasOutput || isEnhancing || error) && (
            <div className="p-6 bg-brand-indigo/5 dark:bg-brand-cyan/5">
              {error ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                  <p className="text-red-500">{error}</p>
                </div>
              ) : (
                <>
                  {/* Progress indicator */}
                  {isEnhancing && (
                    <div className="flex items-center gap-2 mb-4">
                      <div className="relative h-1 flex-1 rounded-full bg-[var(--border)] overflow-hidden">
                        <div
                          className={cn(
                            'absolute left-0 top-0 h-full rounded-full transition-all duration-300',
                            progress === 'starting' && 'w-1/4 bg-brand-indigo dark:bg-brand-cyan animate-pulse',
                            progress === 'streaming' && 'w-3/4 bg-brand-indigo dark:bg-brand-cyan',
                            progress === 'completing' && 'w-full bg-brand-cyan'
                          )}
                        />
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)] capitalize">{progress}</span>
                    </div>
                  )}

                  {/* Enhanced output */}
                  <div className="relative">
                    <div
                      className={cn(
                        'min-h-[120px] whitespace-pre-wrap text-base text-[var(--text-primary)]',
                        isEnhancing && 'animate-pulse'
                      )}
                    >
                      {displayContent || (
                        <span className="text-[var(--text-tertiary)]">
                          Enhanced prompt will appear here...
                        </span>
                      )}
                      {isEnhancing && progress === 'streaming' && (
                        <span className="inline-block w-2 h-5 ml-1 bg-brand-cyan animate-pulse" />
                      )}
                    </div>

                    {/* Actions */}
                    {hasOutput && !isEnhancing && (
                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleCopy}
                          leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        >
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleReset}
                          leftIcon={<RefreshCw className="h-4 w-4" />}
                        >
                          New Prompt
                        </Button>

                        {result && (
                          <div className="flex-1 flex items-center justify-end gap-4 text-xs text-[var(--text-tertiary)]">
                            {result.inputTokens && (
                              <span>{result.inputTokens} input tokens</span>
                            )}
                            {result.outputTokens && (
                              <span>{result.outputTokens} output tokens</span>
                            )}
                            {result.processingMs && (
                              <span>{(result.processingMs / 1000).toFixed(1)}s</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo/10">
              <Zap className="h-5 w-5 text-brand-indigo" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)]">Daily Prompts</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {usage.dailyPromptsUsed}/{usage.dailyPromptsLimit}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/10">
              <Crown className="h-5 w-5 text-brand-cyan" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)]">Current Plan</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">{tier}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
              <Sparkles className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)]">Quality</p>
              <p className="text-lg font-semibold text-[var(--text-primary)] capitalize">
                {subscription.tier === 'FREE' ? 'Basic' : subscription.tier === 'PRO' ? 'Standard' : 'Advanced'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
