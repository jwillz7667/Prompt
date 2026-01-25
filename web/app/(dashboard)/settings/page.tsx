'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, type SelectOption } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import { useIsPro } from '@/lib/hooks/useSubscription'
import { toast } from '@/lib/stores/uiStore'
import type { ToneType, OutputLength, AppearanceMode, DeepseekModel } from '@/lib/types/models'
import {
  Palette,
  Sliders,
  Brain,
  RotateCcw,
  Crown,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'

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

const modelOptions: SelectOption[] = [
  {
    value: 'deepseek-chat',
    label: 'Fast',
    description: 'Quick responses, great for most prompts',
    icon: <Brain className="h-4 w-4" />,
  },
  {
    value: 'deepseek-reasoner',
    label: 'Deep Think',
    description: 'Advanced reasoning, longer processing',
    icon: <Crown className="h-4 w-4" />,
  },
]

const appearanceOptions: { value: AppearanceMode; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'System', icon: <Monitor className="h-5 w-5" /> },
  { value: 'light', label: 'Light', icon: <Sun className="h-5 w-5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-5 w-5" /> },
]

export default function SettingsPage() {
  const isPro = useIsPro()
  const {
    selectedModel,
    setModel,
    deepThinkEnabled,
    setDeepThink,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    appearanceMode,
    setAppearance,
    selectedTone,
    setTone,
    outputLength,
    setOutputLength,
    customInstructions,
    setCustomInstructions,
    resetToDefaults,
  } = useSettingsStore()

  const handleReset = () => {
    resetToDefaults()
    toast.success('Settings reset to defaults')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Customize your prompt enhancement experience
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReset}
          leftIcon={<RotateCcw className="h-4 w-4" />}
        >
          Reset
        </Button>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-brand-indigo" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] mb-3 block">
              Theme
            </label>
            <div className="flex gap-3">
              {appearanceOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAppearance(option.value)}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    appearanceMode === option.value
                      ? 'border-brand-indigo bg-brand-indigo/5'
                      : 'border-[var(--border)] hover:border-brand-indigo/50'
                  }`}
                >
                  <div
                    className={`${
                      appearanceMode === option.value ? 'text-brand-indigo' : 'text-[var(--text-tertiary)]'
                    }`}
                  >
                    {option.icon}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      appearanceMode === option.value ? 'text-brand-indigo' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-brand-cyan" />
            Generation Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Select
            label="Default Tone"
            options={toneOptions}
            value={selectedTone}
            onChange={(value) => setTone(value as ToneType)}
          />

          <Select
            label="Default Output Length"
            options={lengthOptions}
            value={outputLength}
            onChange={(value) => setOutputLength(value as OutputLength)}
          />

          <Textarea
            label="Custom Instructions"
            placeholder="Add any additional instructions that should apply to all prompts..."
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            hint="These instructions will be included with every prompt enhancement"
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-brand-indigo" />
            Advanced
            {!isPro && (
              <Badge variant="pro" className="text-[10px]">
                PRO
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Select
            label="Model"
            options={modelOptions}
            value={selectedModel}
            onChange={(value) => setModel(value as DeepseekModel)}
            disabled={!isPro && selectedModel !== 'deepseek-chat'}
          />

          <div className="flex items-center justify-between">
            <Switch
              checked={deepThinkEnabled}
              onChange={setDeepThink}
              disabled={!isPro}
              label="Deep Think Mode"
              description="Enable advanced reasoning for complex prompts"
            />
            {!isPro && (
              <Badge variant="pro" className="text-[10px]">
                PRO
              </Badge>
            )}
          </div>

          <Slider
            label="Temperature"
            value={temperature}
            onChange={setTemperature}
            min={0}
            max={1}
            step={0.1}
            formatValue={(v) => v.toFixed(1)}
          />

          <Slider
            label="Max Output Tokens"
            value={maxTokens}
            onChange={setMaxTokens}
            min={1024}
            max={isPro ? 65536 : 4096}
            step={1024}
            formatValue={(v) => `${(v / 1024).toFixed(0)}K`}
          />

          {!isPro && (
            <div className="rounded-xl bg-brand-indigo/5 border border-brand-indigo/20 p-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Upgrade to Pro to unlock advanced models, higher token limits, and Deep Think mode.
              </p>
              <a href="/upgrade">
                <Button variant="primary" size="sm" className="mt-3">
                  Upgrade to Pro
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
