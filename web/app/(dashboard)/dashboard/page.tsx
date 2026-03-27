'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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
import type { ToneType, OutputLength, PromptModality } from '@/lib/types/models'
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Crown,
  AlertCircle,
  Flame,
  FileText,
  ImageIcon,
  Video,
  Mic,
  Code2,
  Box,
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

// Track MAX MODE usage for free/pro users (stored in localStorage)
const MAX_MODE_STORAGE_KEY = 'max_mode_daily_usage'

function getMaxModeUsageToday(): number {
  if (typeof window === 'undefined') return 0
  const stored = localStorage.getItem(MAX_MODE_STORAGE_KEY)
  if (!stored) return 0
  try {
    const { date, count } = JSON.parse(stored)
    const today = new Date().toDateString()
    return date === today ? count : 0
  } catch {
    return 0
  }
}

function incrementMaxModeUsage(): void {
  if (typeof window === 'undefined') return
  const today = new Date().toDateString()
  const current = getMaxModeUsageToday()
  localStorage.setItem(MAX_MODE_STORAGE_KEY, JSON.stringify({ date: today, count: current + 1 }))
}

const lengthOptions: SelectOption[] = [
  { value: 'concise', label: 'Concise', description: 'Brief and to the point' },
  { value: 'standard', label: 'Standard', description: 'Balanced detail level' },
  { value: 'detailed', label: 'Detailed', description: 'Comprehensive coverage' },
]

const modalityOptions: SelectOption[] = [
  {
    value: 'text',
    label: 'Text',
    description: 'Writing, analysis, business, and general AI tasks',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    value: 'image',
    label: 'Image',
    description: 'Photos, illustrations, concept art, and product shots',
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    value: 'video',
    label: 'Video',
    description: 'Motion, scenes, pacing, and camera direction',
    icon: <Video className="h-4 w-4" />,
  },
  {
    value: 'audio',
    label: 'Audio',
    description: 'Music, voice, sound design, and lyrics',
    icon: <Mic className="h-4 w-4" />,
  },
  {
    value: 'code',
    label: 'Code',
    description: 'Functions, components, debugging, and refactors',
    icon: <Code2 className="h-4 w-4" />,
  },
  {
    value: '3d',
    label: '3D',
    description: 'Assets, renders, visualization, and printable models',
    icon: <Box className="h-4 w-4" />,
  },
]

const modalityDetails: Record<
  PromptModality,
  {
    title: string
    description: string
    placeholder: string
    helper: string
    outputLabel: string
  }
> = {
  text: {
    title: 'Text prompts',
    description: 'Optimize prompts for writing, summarization, research, planning, and assistant workflows.',
    placeholder: "Enter the writing or assistant task you want improved. Example: 'Write a launch email for a new AI feature aimed at product managers.'",
    helper: 'Promptomize will emphasize structure, audience, tone, and clear output requirements for text models.',
    outputLabel: 'text',
  },
  image: {
    title: 'Image prompts',
    description: 'Optimize prompts for image generators with stronger subject, composition, style, lighting, and camera detail.',
    placeholder: "Describe the scene you want improved. Example: 'A luxury perfume bottle on black marble with water droplets and dramatic lighting.'",
    helper: 'Best for image-generation tools and workflows.',
    outputLabel: 'image',
  },
  video: {
    title: 'Video prompts',
    description: 'Optimize prompts for motion, pacing, camera movement, scene progression, and cinematic detail.',
    placeholder: "Describe the sequence you want improved. Example: 'A futuristic sports car racing through neon Tokyo at night for a short ad.'",
    helper: 'Promptomize will add motion cues, camera direction, timing, and scene continuity for video tools.',
    outputLabel: 'video',
  },
  audio: {
    title: 'Audio prompts',
    description: 'Optimize prompts for music, lyrics, voice, or sound design with richer sonic and production language.',
    placeholder: "Describe the audio output you want improved. Example: 'An uplifting synth-pop anthem with a female lead vocal and glossy 80s production.'",
    helper: 'Best for music generation, voice synthesis, podcast scripting, and sound design workflows.',
    outputLabel: 'audio',
  },
  code: {
    title: 'Code prompts',
    description: 'Optimize prompts for implementation details, frameworks, constraints, architecture, and test expectations.',
    placeholder: "Describe the coding task you want improved. Example: 'Build a secure Express auth API with JWT refresh tokens, rate limiting, and tests.'",
    helper: 'Promptomize will sharpen technical requirements, expected outputs, constraints, and edge cases.',
    outputLabel: 'code',
  },
  '3d': {
    title: '3D prompts',
    description: 'Optimize prompts for 3D assets, renders, topology, materials, scale, and target use cases.',
    placeholder: "Describe the 3D asset or render you want improved. Example: 'A stylized medieval sword game asset with leather grip and worn steel blade.'",
    helper: 'Best for 3D generation, visualization, asset ideation, and 3D-printing prep prompts.',
    outputLabel: '3D',
  },
}

const promptModalityValues: PromptModality[] = ['text', 'image', 'video', 'audio', 'code', '3d']

function isPromptModality(value: string | null): value is PromptModality {
  return value !== null && promptModalityValues.includes(value as PromptModality)
}

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [modality, setModality] = useState<PromptModality>('text')
  const [copied, setCopied] = useState(false)
  const [maxModeEnabled, setMaxModeEnabled] = useState(false)
  const [maxModeUsedToday, setMaxModeUsedToday] = useState(0)
  const { selectedTone, setTone, outputLength, setOutputLength, deepThinkEnabled, setDeepThink } =
    useSettingsStore()
  const { subscription, usage } = useSubscription()
  const { isEnhancing, streamedContent, result, error, progress, enhance, reset } = useEnhance()

  // Load MAX MODE usage on mount
  useEffect(() => {
    setMaxModeUsedToday(getMaxModeUsageToday())
  }, [])

  // Pre-fill prompt from URL params (for re-enhance from history)
  useEffect(() => {
    const promptParam = searchParams.get('prompt')
    const modalityParam = searchParams.get('modality')

    if (isPromptModality(modalityParam)) {
      setModality(modalityParam)
    }

    if (promptParam || modalityParam) {
      setPrompt(promptParam ?? '')
      reset() // Clear any previous enhancement
      // Clean up URL
      router.replace('/dashboard', { scroll: false })
    }
  }, [searchParams, reset, router])

  const tier = subscription.tier
  const isTrialing = subscription.isTrialing
  const canDeepThink = tier === 'PRO' || tier === 'PREMIUM'
  const canEnhance = usage.canCreatePrompt

  // MAX MODE access: Premium = unlimited, Pro = 5/day, Free = none
  const hasUnlimitedMaxMode = tier === 'PREMIUM' || isTrialing
  const maxModeLimit = tier === 'PRO' ? 5 : 0 // Pro gets 5/day, Free gets 0
  const maxModeRemaining = hasUnlimitedMaxMode ? Infinity : maxModeLimit - maxModeUsedToday
  const canUseMaxMode = hasUnlimitedMaxMode || (tier === 'PRO' && maxModeRemaining > 0)
  const activeModality = modalityDetails[modality]
  const outputModality = result?.modality ?? modality
  const outputModalityDetails = modalityDetails[outputModality]

  const handleEnhance = useCallback(async () => {
    if (!prompt.trim()) {
      toast.warning('Empty prompt', 'Please enter a prompt to enhance')
      return
    }

    if (!canEnhance) {
      toast.error('Daily limit reached', 'Upgrade to get more prompts')
      return
    }

    // Check MAX MODE quota
    if (maxModeEnabled && !canUseMaxMode) {
      if (tier === 'FREE') {
        toast.error('MAX MODE requires Pro', 'Upgrade to Pro for 5 MAX prompts/day or Premium for unlimited')
      } else {
        toast.error('MAX MODE limit reached', 'Upgrade to Premium for unlimited MAX prompts')
      }
      return
    }

    try {
      // Use 'max' tone when enabled, otherwise use selected tone
      const effectiveTone = maxModeEnabled ? 'max' : selectedTone

      await enhance(prompt, {
        modality,
        tone: effectiveTone as ToneType,
        length: outputLength,
        deepThink: canDeepThink && deepThinkEnabled,
      })

      // Track MAX MODE usage for Pro users
      if (maxModeEnabled && !hasUnlimitedMaxMode) {
        incrementMaxModeUsage()
        setMaxModeUsedToday(prev => prev + 1)
      }

      toast.success('Prompt enhanced!')
    } catch (err) {
      // Error already shown in state
    }
  }, [prompt, modality, selectedTone, outputLength, deepThinkEnabled, canDeepThink, canEnhance, enhance, maxModeEnabled, hasUnlimitedMaxMode, canUseMaxMode, tier])

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
          Choose a modality, then turn rough ideas into stronger AI-ready prompts.
        </p>
      </div>

      {/* Quota warning */}
      {!canEnhance && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-[var(--text-primary)]">Daily limit reached</p>
            <p className="text-sm text-[var(--text-secondary)]">
              You&apos;ve used all {usage.dailyPromptsLimit} prompts today.
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
            <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] mb-4">
              <div className="relative z-30">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Modality
                </label>
                <Select
                  options={modalityOptions}
                  value={modality}
                  onChange={(value) => setModality(value as PromptModality)}
                  placeholder="Select modality"
                  disabled={isEnhancing}
                />
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-brand-indigo/5 dark:bg-brand-cyan/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{activeModality.outputLabel}</Badge>
                  <p className="font-medium text-[var(--text-primary)]">{activeModality.title}</p>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{activeModality.description}</p>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">{activeModality.helper}</p>
              </div>
            </div>

            <Textarea
              placeholder={activeModality.placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[150px] text-base border-0 bg-transparent focus:ring-0 resize-none"
              disabled={isEnhancing}
            />
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Promptomize will optimize this prompt specifically for {activeModality.outputLabel.toLowerCase()} workflows.
            </p>

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

              {/* MAX MODE Toggle */}
              <div className="flex items-center gap-2 pb-2.5">
                <Switch
                  checked={maxModeEnabled}
                  onChange={(checked) => {
                    if (checked && !canUseMaxMode) {
                      if (tier === 'FREE') {
                        toast.info('MAX MODE requires Pro', 'Upgrade to Pro or Premium for MAX MODE access')
                      } else {
                        toast.info('MAX MODE limit reached', 'Upgrade to Premium for unlimited MAX prompts')
                      }
                      return
                    }
                    setMaxModeEnabled(checked)
                  }}
                  disabled={isEnhancing || tier === 'FREE'}
                />
                <div className="flex items-center gap-1.5">
                  <Flame className={cn('h-4 w-4', maxModeEnabled ? 'text-orange-500' : 'text-[var(--text-tertiary)]')} />
                  <span className="text-sm text-[var(--text-secondary)]">MAX</span>
                </div>
                {tier === 'FREE' && (
                  <Badge variant="pro" className="text-[10px]">
                    PRO
                  </Badge>
                )}
                {tier === 'PRO' && (
                  <Badge variant="outline" className="text-[10px]">
                    {maxModeRemaining}/5
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
                className="min-w-[180px]"
              >
                {isEnhancing ? `Optimizing ${activeModality.outputLabel}...` : `Optimize ${activeModality.outputLabel}`}
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
                    <div className="flex items-center gap-2 mb-4">
                      <Badge variant="outline">{outputModalityDetails.outputLabel} optimized</Badge>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        Structured for {outputModalityDetails.outputLabel.toLowerCase()} generation workflows.
                      </span>
                    </div>
                    <div
                      className={cn(
                        'min-h-[120px] whitespace-pre-wrap text-base text-[var(--text-primary)]',
                        isEnhancing && 'animate-pulse'
                      )}
                    >
                      {displayContent || (
                        <span className="text-[var(--text-tertiary)]">
                          Your optimized {outputModalityDetails.outputLabel.toLowerCase()} prompt will appear here...
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
