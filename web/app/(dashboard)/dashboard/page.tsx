'use client'

import { useState, useCallback, useEffect } from 'react'
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
  Flame,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

const toneOptions: SelectOption[] = [
  { value: 'professional', label: 'Professional', description: 'Clear and business-appropriate' },
  { value: 'casual', label: 'Casual', description: 'Friendly and conversational' },
  { value: 'academic', label: 'Academic', description: 'Scholarly and research-focused' },
  { value: 'creative', label: 'Creative', description: 'Imaginative and expressive' },
  { value: 'technical', label: 'Technical', description: 'Precise and detail-oriented' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
]

// Track unchained usage for free users (stored in localStorage)
const UNCHAINED_STORAGE_KEY = 'unchained_daily_usage'

function getUnchainedUsageToday(): number {
  if (typeof window === 'undefined') return 0
  const stored = localStorage.getItem(UNCHAINED_STORAGE_KEY)
  if (!stored) return 0
  try {
    const { date, count } = JSON.parse(stored)
    const today = new Date().toDateString()
    return date === today ? count : 0
  } catch {
    return 0
  }
}

function incrementUnchainedUsage(): void {
  if (typeof window === 'undefined') return
  const today = new Date().toDateString()
  const current = getUnchainedUsageToday()
  localStorage.setItem(UNCHAINED_STORAGE_KEY, JSON.stringify({ date: today, count: current + 1 }))
}

const lengthOptions: SelectOption[] = [
  { value: 'concise', label: 'Concise', description: 'Brief and to the point' },
  { value: 'standard', label: 'Standard', description: 'Balanced detail level' },
  { value: 'detailed', label: 'Detailed', description: 'Comprehensive coverage' },
]

export default function DashboardPage() {
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [unchainedEnabled, setUnchainedEnabled] = useState(false)
  const [unchainedUsedToday, setUnchainedUsedToday] = useState(0)
  const { selectedTone, setTone, outputLength, setOutputLength, deepThinkEnabled, setDeepThink } =
    useSettingsStore()
  const { subscription, usage } = useSubscription()
  const { isEnhancing, streamedContent, result, error, progress, enhance, reset } = useEnhance()

  // Load unchained usage on mount
  useEffect(() => {
    setUnchainedUsedToday(getUnchainedUsageToday())
  }, [])

  const tier = subscription.tier
  const isTrialing = subscription.isTrialing
  const canDeepThink = tier === 'PRO' || tier === 'PREMIUM'
  const canEnhance = usage.canCreatePrompt

  // Unchained access: Premium/Trial = unlimited, Free = 1/day
  const hasUnlimitedUnchained = tier === 'PREMIUM' || isTrialing
  const freeUnchainedRemaining = 1 - unchainedUsedToday
  const canUseUnchained = hasUnlimitedUnchained || freeUnchainedRemaining > 0

  const handleEnhance = useCallback(async () => {
    if (!prompt.trim()) {
      toast.warning('Empty prompt', 'Please enter a prompt to enhance')
      return
    }

    if (!canEnhance) {
      toast.error('Daily limit reached', 'Upgrade to get more prompts')
      return
    }

    // Check unchained quota for free users
    if (unchainedEnabled && !hasUnlimitedUnchained && freeUnchainedRemaining <= 0) {
      toast.error('Unchained limit reached', 'Free users get 1 Unchained prompt per day')
      return
    }

    try {
      // Use 'unchained' tone when enabled, otherwise use selected tone
      const effectiveTone = unchainedEnabled ? 'unchained' : selectedTone

      await enhance(prompt, {
        tone: effectiveTone as ToneType,
        outputLength,
        deepThink: canDeepThink && deepThinkEnabled,
      })

      // Track unchained usage for free users
      if (unchainedEnabled && !hasUnlimitedUnchained) {
        incrementUnchainedUsage()
        setUnchainedUsedToday(prev => prev + 1)
      }

      toast.success('Prompt enhanced!')
    } catch (err) {
      // Error already shown in state
    }
  }, [prompt, selectedTone, outputLength, deepThinkEnabled, canDeepThink, canEnhance, enhance, unchainedEnabled, hasUnlimitedUnchained, freeUnchainedRemaining])

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
      <Card variant="elevated">
        <CardContent className="p-0">
          {/* Input Section */}
          <div className="p-6 pb-4 border-b border-[var(--border)]">
            <Textarea
              placeholder="Enter your prompt here... e.g., 'Write a blog post about AI'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[150px] text-base border-0 bg-transparent focus:ring-0 resize-none"
              disabled={isEnhancing}
            />

            {/* Options Row */}
            <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-[var(--border)]">
              <div className="relative z-20">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Tone
                </label>
                <Select
                  options={toneOptions}
                  value={selectedTone}
                  onChange={(value) => setTone(value as ToneType)}
                  placeholder="Select tone"
                  className="w-44"
                  disabled={isEnhancing}
                />
              </div>

              <div className="relative z-10">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Length
                </label>
                <Select
                  options={lengthOptions}
                  value={outputLength}
                  onChange={(value) => setOutputLength(value as OutputLength)}
                  placeholder="Output length"
                  className="w-44"
                  disabled={isEnhancing}
                />
              </div>

              <div className="flex items-center gap-2 pb-2.5">
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

              {/* Unchained Mode Toggle */}
              <div className="flex items-center gap-2 pb-2.5">
                <Switch
                  checked={unchainedEnabled}
                  onChange={(checked) => {
                    if (checked && !canUseUnchained) {
                      toast.info('Unchained limit reached', 'Upgrade for unlimited Unchained prompts')
                      return
                    }
                    setUnchainedEnabled(checked)
                  }}
                  disabled={isEnhancing}
                />
                <div className="flex items-center gap-1.5">
                  <Flame className={cn('h-4 w-4', unchainedEnabled ? 'text-orange-500' : 'text-[var(--text-tertiary)]')} />
                  <span className="text-sm text-[var(--text-secondary)]">Unchained</span>
                </div>
                {!hasUnlimitedUnchained && (
                  <Badge variant="outline" className="text-[10px]">
                    {freeUnchainedRemaining}/1
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
                      <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-[var(--border)]">
                        {/* Primary actions row */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="cyan"
                            size="md"
                            onClick={handleCopy}
                            leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            className="min-w-[120px]"
                          >
                            {copied ? 'Copied!' : 'Copy Prompt'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={handleReset}
                            leftIcon={<RefreshCw className="h-4 w-4" />}
                          >
                            Clear
                          </Button>
                        </div>

                        {/* Try it out row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-tertiary)] mr-1">Try it in:</span>
                          <button
                            onClick={() => {
                              const text = result?.enhancedPrompt || streamedContent
                              if (text) {
                                window.open(`https://claude.ai/new?q=${encodeURIComponent(text)}`, '_blank')
                              }
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
                              const text = result?.enhancedPrompt || streamedContent
                              if (text) {
                                window.open(`https://chatgpt.com/?q=${encodeURIComponent(text)}`, '_blank')
                              }
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
                          <button
                            onClick={() => {
                              const text = result?.enhancedPrompt || streamedContent
                              if (text) {
                                window.open(`https://gemini.google.com/app?q=${encodeURIComponent(text)}`, '_blank')
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#4285F4]/30 hover:bg-[#4285F4]/10 transition-colors"
                          >
                            <Image
                              src="/logos/gemini-logo.svg"
                              alt="Gemini"
                              width={20}
                              height={20}
                              className="object-contain"
                            />
                            <ExternalLink className="h-3 w-3 text-[#4285F4]" />
                          </button>
                        </div>

                        {/* Stats row */}
                        {result && (
                          <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
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
