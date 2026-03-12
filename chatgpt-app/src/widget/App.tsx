import { useEffect, useMemo, useState } from 'react'
import { getModalityDetail } from '../shared/modalityDetails'
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
    { id: 'text', name: 'Text', description: getModalityDetail('text').description },
    { id: 'image', name: 'Image', description: getModalityDetail('image').description },
    { id: 'video', name: 'Video', description: getModalityDetail('video').description },
    { id: 'audio', name: 'Audio', description: getModalityDetail('audio').description },
    { id: 'code', name: 'Code', description: getModalityDetail('code').description },
    { id: '3d', name: '3D', description: getModalityDetail('3d').description },
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
  const [prompt, setPrompt] = useState(initialResult?.request.prompt ?? '')
  const [modality, setModality] = useState<Modality>(initialResult?.request.modality ?? 'text')
  const [tone, setTone] = useState<Tone | ''>(initialResult?.request.tone ?? '')
  const [length, setLength] = useState<PromptLength | ''>(initialResult?.request.length ?? 'standard')
  const [customInstructions, setCustomInstructions] = useState(
    initialResult?.request.customInstructions ?? ''
  )
  const [copyState, setCopyState] = useState('Copy optimized prompt')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const activeModality = getModalityDetail(modality)
  const activeModalityDescription =
    capabilities.modalities.find((item) => item.id === modality)?.description ?? activeModality.description
  const resultModality = result?.request.modality ?? modality
  const resultModalityDetail = getModalityDetail(resultModality)

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

    if (!prompt.trim()) {
      setError(`Enter the ${activeModality.name.toLowerCase()} prompt you want Promptomize to optimize.`)
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
      window.setTimeout(() => setCopyState('Copy optimized prompt'), 1500)
    } catch {
      setCopyState('Copy blocked')
      window.setTimeout(() => setCopyState('Copy optimized prompt'), 1500)
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
          <h1>Choose a modality, then optimize the prompt.</h1>
          <p>
            Pick the workflow first, paste the rough prompt, and get back a modality-specific
            version you can use immediately.
          </p>
        </div>
        <button className="secondary-button" onClick={handleOpenExternal} type="button">
          Open Promptomize
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Prompt setup</h2>
            <p>Choose the target workflow, then configure how Promptomize should optimize the prompt.</p>
          </div>
          <span className="status-chip">{busy ? 'Enhancing' : 'Ready'}</span>
        </div>

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

        <div className="modality-card">
          <div className="modality-card-header">
            <strong>{activeModality.name} optimization</strong>
            <span className="modality-pill">{activeModality.name}</span>
          </div>
          <p>{activeModalityDescription}</p>
          <p className="modality-helper">{activeModality.helper}</p>
          <div className="example-box">
            <span>Example input</span>
            <strong>{activeModality.example}</strong>
          </div>
        </div>

        <label className="field">
          <span>Prompt to optimize</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={capabilities.limits.maxPromptLength}
            rows={6}
            placeholder={activeModality.placeholder}
          />
        </label>

        <div className="grid">
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
            {busy ? `Optimizing ${activeModality.name}...` : result ? `Re-optimize ${activeModality.name}` : `Optimize ${activeModality.name}`}
          </button>
          <span className="hint">
            Choose a modality first. Limits: {capabilities.limits.maxPromptLength.toLocaleString()}{' '}
            chars prompt, {capabilities.limits.maxCustomInstructions.toLocaleString()} chars instructions.
          </span>
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-header">
          <div>
            <h2>{resultModalityDetail.name} optimized prompt</h2>
            <p>Copy the result directly or switch modalities and run it again for a different workflow.</p>
          </div>
          {result?.quota ? (
            <span className="status-chip">
              Quota {result.quota.remaining}/{result.quota.limit}
            </span>
          ) : null}
        </div>

        <div className="result-box">
          {result?.enhancedPrompt ?? `Choose a modality and run the tool to generate an optimized ${activeModality.name.toLowerCase()} prompt here.`}
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
