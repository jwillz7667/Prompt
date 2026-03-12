import { useEffect, useMemo, useState } from 'react'
import type {
  CapabilitiesPayload,
  EnhanceRequestPayload,
  EnhanceResponsePayload,
  Modality,
  PromptLength,
  Tone,
} from '../shared/types'

type WidgetState = {
  lastRequest?: EnhanceRequestPayload
}

function extractStructuredContent<T>(value: unknown): T | null {
  if (!value) {
    return null
  }

  if (typeof value === 'object' && value !== null && 'structuredContent' in value) {
    const structured = (value as { structuredContent?: unknown }).structuredContent
    return (structured as T | undefined) ?? null
  }

  return value as T
}

const fallbackCapabilities: CapabilitiesPayload = {
  modalities: [
    { id: 'text', name: 'Text' },
    { id: 'image', name: 'Image' },
    { id: 'video', name: 'Video' },
    { id: 'audio', name: 'Audio' },
    { id: 'code', name: 'Code' },
    { id: '3d', name: '3D' },
  ],
  tones: [
    { id: 'professional', name: 'Professional' },
    { id: 'creative', name: 'Creative' },
    { id: 'technical', name: 'Technical' },
  ],
  lengths: [
    { id: 'concise', name: 'Concise' },
    { id: 'standard', name: 'Standard' },
    { id: 'detailed', name: 'Detailed' },
  ],
  limits: {
    maxPromptLength: 100000,
    maxTokens: 8192,
    maxCustomInstructions: 2000,
  },
  fetchedAt: '',
}

export default function App() {
  const initialResult = useMemo(
    () => (window.openai?.toolOutput as EnhanceResponsePayload | null) ?? null,
    []
  )

  const [result, setResult] = useState<EnhanceResponsePayload | null>(initialResult)
  const [capabilities, setCapabilities] = useState<CapabilitiesPayload>(
    initialResult?.capabilities ?? fallbackCapabilities
  )
  const [prompt, setPrompt] = useState(
    initialResult?.request.prompt ?? 'Write a stronger product launch prompt for my new AI feature.'
  )
  const [modality, setModality] = useState<Modality>(initialResult?.request.modality ?? 'text')
  const [tone, setTone] = useState<Tone | ''>(initialResult?.request.tone ?? '')
  const [length, setLength] = useState<PromptLength | ''>(initialResult?.request.length ?? 'standard')
  const [customInstructions, setCustomInstructions] = useState(
    initialResult?.request.customInstructions ?? ''
  )
  const [copyState, setCopyState] = useState('Copy enhanced prompt')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = window.openai?.theme === 'dark' ? 'dark' : 'light'
  }, [])

  useEffect(() => {
    if (initialResult?.capabilities) {
      return
    }

    let mounted = true

    async function loadCapabilities() {
      try {
        const response = await window.openai?.callTool?.<CapabilitiesPayload>('list_capabilities', {})
        const structured = extractStructuredContent<CapabilitiesPayload>(response)
        if (mounted && structured) {
          setCapabilities(structured)
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load capabilities')
        }
      }
    }

    void loadCapabilities()

    return () => {
      mounted = false
    }
  }, [initialResult?.capabilities])

  async function saveWidgetState(nextRequest: EnhanceRequestPayload) {
    const state: WidgetState = {
      lastRequest: nextRequest,
    }
    await window.openai?.setWidgetState?.(state as Record<string, unknown>)
  }

  async function handleEnhance() {
    if (!window.openai?.callTool) {
      setError('ChatGPT host tooling is unavailable in this widget context.')
      return
    }

    setBusy(true)
    setError(null)

    const request: EnhanceRequestPayload = {
      prompt,
      modality,
      tone: tone || undefined,
      length: length || undefined,
      customInstructions: customInstructions || undefined,
    }

    try {
      const response = await window.openai.callTool<EnhanceResponsePayload>('enhance_prompt', request)
      const structured = extractStructuredContent<EnhanceResponsePayload>(response)

      if (!structured) {
        throw new Error('No structured enhancement result was returned.')
      }

      setResult(structured)
      setCapabilities(structured.capabilities ?? capabilities)
      await saveWidgetState(request)
    } catch (enhanceError) {
      setError(enhanceError instanceof Error ? enhanceError.message : 'Prompt enhancement failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!result?.enhancedPrompt) {
      return
    }

    try {
      await navigator.clipboard.writeText(result.enhancedPrompt)
      setCopyState('Copied')
      window.setTimeout(() => setCopyState('Copy enhanced prompt'), 1500)
    } catch {
      setCopyState('Copy blocked')
      window.setTimeout(() => setCopyState('Copy enhanced prompt'), 1500)
    }
  }

  async function handleOpenExternal() {
    const target = result?.links.webApp ?? 'https://promptomize.app/login'
    await window.openai?.openExternal?.({ href: target })
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Promptomize</span>
          <h1>Refine prompts without leaving ChatGPT.</h1>
          <p>
            Tune modality, tone, and output depth, then regenerate or copy the final prompt into
            your next workflow.
          </p>
        </div>
        <button className="secondary-button" onClick={handleOpenExternal} type="button">
          Open Promptomize
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Prompt input</h2>
            <p>Configure the same enhancement settings exposed by the Promptomize public API.</p>
          </div>
          <span className="status-chip">{busy ? 'Enhancing' : 'Ready'}</span>
        </div>

        <label className="field">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={capabilities.limits.maxPromptLength}
            rows={6}
          />
        </label>

        <div className="grid">
          <label className="field">
            <span>Modality</span>
            <select value={modality} onChange={(event) => setModality(event.target.value as Modality)}>
              {capabilities.modalities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tone</span>
            <select value={tone} onChange={(event) => setTone(event.target.value as Tone | '')}>
              <option value="">Default</option>
              {capabilities.tones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Length</span>
            <select
              value={length}
              onChange={(event) => setLength(event.target.value as PromptLength | '')}
            >
              <option value="">Default</option>
              {capabilities.lengths.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Custom instructions</span>
          <textarea
            value={customInstructions}
            onChange={(event) => setCustomInstructions(event.target.value)}
            maxLength={capabilities.limits.maxCustomInstructions}
            rows={3}
            placeholder="Optional constraints, target platform, or formatting notes."
          />
        </label>

        <div className="actions">
          <button className="primary-button" onClick={handleEnhance} type="button" disabled={busy}>
            {busy ? 'Enhancing...' : result ? 'Regenerate' : 'Enhance prompt'}
          </button>
          <span className="hint">
            Limits: {capabilities.limits.maxPromptLength.toLocaleString()} chars prompt,{' '}
            {capabilities.limits.maxCustomInstructions.toLocaleString()} chars instructions.
          </span>
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-header">
          <div>
            <h2>Enhanced prompt</h2>
            <p>Copy the result directly or regenerate after changing the controls above.</p>
          </div>
          {result?.quota ? (
            <span className="status-chip">
              Quota {result.quota.remaining}/{result.quota.limit}
            </span>
          ) : null}
        </div>

        <div className="result-box">
          {result?.enhancedPrompt ?? 'Run the enhancement tool to populate the final prompt here.'}
        </div>

        <div className="actions split">
          <button className="secondary-button" onClick={handleCopy} type="button" disabled={!result}>
            {copyState}
          </button>
          <button className="ghost-button" onClick={handleOpenExternal} type="button">
            Open in Promptomize
          </button>
        </div>

        {result?.usage ? (
          <div className="metric-grid">
            <div className="metric-card">
              <span>Input tokens</span>
              <strong>{result.usage.inputTokens}</strong>
            </div>
            <div className="metric-card">
              <span>Output tokens</span>
              <strong>{result.usage.outputTokens}</strong>
            </div>
            <div className="metric-card">
              <span>Total tokens</span>
              <strong>{result.usage.totalTokens}</strong>
            </div>
            <div className="metric-card">
              <span>Latency</span>
              <strong>{result.usage.processingMs} ms</strong>
            </div>
          </div>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}
      </section>
    </main>
  )
}
