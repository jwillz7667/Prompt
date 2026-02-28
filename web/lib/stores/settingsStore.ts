import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { UserSettings, ToneType, OutputLength, AppearanceMode, DeepseekModel } from '@/lib/types/models'

interface SettingsState extends UserSettings {
  // Actions
  setModel: (model: DeepseekModel) => void
  setDeepThink: (enabled: boolean) => void
  setTemperature: (temp: number) => void
  setMaxTokens: (tokens: number) => void
  setAppearance: (mode: AppearanceMode) => void
  setTone: (tone: ToneType) => void
  setOutputLength: (length: OutputLength) => void
  setCustomInstructions: (instructions: string) => void
  setTargetCharacterLength: (length: number | undefined) => void
  resetToDefaults: () => void
}

const defaultSettings: UserSettings = {
  selectedModel: 'deepseek-chat',
  deepThinkEnabled: false,
  temperature: 0.7,
  maxTokens: 4096,
  appearanceMode: 'system',
  selectedTone: 'professional',
  outputLength: 'standard',
  customInstructions: '',
  targetCharacterLength: undefined,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setModel: (selectedModel) => set({ selectedModel }),
      setDeepThink: (deepThinkEnabled) => set({ deepThinkEnabled }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setAppearance: (appearanceMode) => set({ appearanceMode }),
      setTone: (selectedTone) => set({ selectedTone }),
      setOutputLength: (outputLength) => set({ outputLength }),
      setCustomInstructions: (customInstructions) => set({ customInstructions }),
      setTargetCharacterLength: (targetCharacterLength) => set({ targetCharacterLength }),
      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Apply appearance mode to document
export function applyAppearanceMode(mode: AppearanceMode) {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', mode === 'dark')
  }
}
