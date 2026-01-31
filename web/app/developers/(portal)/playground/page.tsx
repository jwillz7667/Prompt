'use client'

import { useState } from 'react'
import { useApiKeys } from '@/lib/hooks/useApiKeys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'

const MODALITIES = [
  { id: 'text', name: 'Text', description: 'General text and writing' },
  { id: 'image', name: 'Image', description: 'Image generation prompts' },
  { id: 'video', name: 'Video', description: 'Video generation prompts' },
  { id: 'audio', name: 'Audio', description: 'Audio/music prompts' },
  { id: 'code', name: 'Code', description: 'Programming assistance' },
  { id: '3d', name: '3D', description: '3D model generation' },
] as const

const TONES = ['professional', 'casual', 'academic', 'creative', 'technical', 'friendly'] as const

const LENGTHS = ['concise', 'standard', 'detailed'] as const

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

export default function PlaygroundPage() {
  const { data: apiKeys } = useApiKeys()
  const activeKeys = apiKeys?.filter((k) => k.isActive) || []

  const [selectedKeyId, setSelectedKeyId] = useState<string>('')
  const [prompt, setPrompt] = useState('Write a professional email to schedule a meeting')
  const [modality, setModality] = useState<string>('text')
  const [tone, setTone] = useState<string>('')
  const [length, setLength] = useState<string>('')

  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<{
    enhancedPrompt?: string
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number; processingMs: number }
    error?: string
  } | null>(null)

  const selectedKey = activeKeys.find((k) => k.id === selectedKeyId)

  const handleSubmit = async () => {
    if (!selectedKeyId) {
      toast.error('Select an API key', 'Choose an API key to use for testing')
      return
    }

    if (!prompt.trim()) {
      toast.error('Enter a prompt', 'Type something to enhance')
      return
    }

    setIsLoading(true)
    setResponse(null)

    try {
      // We need to make the request directly since we're using the API key
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        modality,
      }
      if (tone) body.tone = tone
      if (length) body.length = length

      const res = await fetch(`${API_BASE_URL}/public/enhance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': `pk_live_${selectedKey?.keyPrefix.replace('pk_live_', '')}...`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setResponse({ error: data.message || data.error || 'Request failed' })
      } else {
        setResponse({
          enhancedPrompt: data.enhancedPrompt,
          usage: data.usage,
        })
      }
    } catch (error) {
      setResponse({ error: (error as Error).message })
    } finally {
      setIsLoading(false)
    }
  }

  // Generate code examples
  const generateCurlExample = () => {
    const body: Record<string, unknown> = { prompt: prompt.trim(), modality }
    if (tone) body.tone = tone
    if (length) body.length = length

    return `curl -X POST ${API_BASE_URL}/public/enhance \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2).replace(/'/g, "\\'")}'`
  }

  const generatePythonExample = () => {
    const body: Record<string, unknown> = { prompt: prompt.trim(), modality }
    if (tone) body.tone = tone
    if (length) body.length = length

    return `import requests

response = requests.post(
    "${API_BASE_URL}/public/enhance",
    headers={"X-API-Key": "YOUR_API_KEY"},
    json=${JSON.stringify(body, null, 4).replace(/"/g, '"')}
)
print(response.json()["enhancedPrompt"])`
  }

  const generateJsExample = () => {
    const body: Record<string, unknown> = { prompt: prompt.trim(), modality }
    if (tone) body.tone = tone
    if (length) body.length = length

    return `const response = await fetch("${API_BASE_URL}/public/enhance", {
  method: "POST",
  headers: {
    "X-API-Key": "YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${JSON.stringify(body, null, 4)})
});
const { enhancedPrompt } = await response.json();
console.log(enhancedPrompt);`
  }

  const [codeTab, setCodeTab] = useState<'curl' | 'python' | 'javascript'>('curl')
  const codeExamples = {
    curl: generateCurlExample(),
    python: generatePythonExample(),
    javascript: generateJsExample(),
  }

  const copyCode = () => {
    navigator.clipboard.writeText(codeExamples[codeTab])
    toast.success('Copied', 'Code copied to clipboard')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-primary">API Playground</h2>
        <p className="text-sm text-muted">Test the API interactively and generate code examples.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Request Builder */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              {/* API Key Selection */}
              <div>
                <label className="block text-sm font-medium text-primary mb-1">API Key</label>
                {activeKeys.length > 0 ? (
                  <select
                    value={selectedKeyId}
                    onChange={(e) => setSelectedKeyId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-primary"
                  >
                    <option value="">Select an API key</option>
                    {activeKeys.map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name} ({key.keyPrefix}...)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-muted">
                    No API keys found.{' '}
                    <a href="/developers/keys" className="text-accent hover:underline">
                      Create one
                    </a>{' '}
                    to test the API.
                  </p>
                )}
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Enter your prompt to enhance..."
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              {/* Modality */}
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Modality</label>
                <div className="grid grid-cols-3 gap-2">
                  {MODALITIES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModality(m.id)}
                      className={cn(
                        'px-3 py-2 rounded text-sm border transition-colors',
                        modality === m.id
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-secondary text-primary hover:border-accent/50'
                      )}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone (Optional) */}
              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Tone <span className="text-muted font-normal">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setTone('')}
                    className={cn(
                      'px-3 py-1 rounded text-xs border transition-colors',
                      !tone
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-secondary text-primary hover:border-accent/50'
                    )}
                  >
                    Auto
                  </button>
                  {TONES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={cn(
                        'px-3 py-1 rounded text-xs border transition-colors capitalize',
                        tone === t
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-secondary text-primary hover:border-accent/50'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Length (Optional) */}
              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Length <span className="text-muted font-normal">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLength('')}
                    className={cn(
                      'px-3 py-1 rounded text-xs border transition-colors',
                      !length
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-secondary text-primary hover:border-accent/50'
                    )}
                  >
                    Auto
                  </button>
                  {LENGTHS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLength(l)}
                      className={cn(
                        'px-3 py-1 rounded text-xs border transition-colors capitalize',
                        length === l
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-secondary text-primary hover:border-accent/50'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !selectedKeyId || !prompt.trim()}
                className="w-full"
              >
                {isLoading ? 'Enhancing...' : 'Enhance Prompt'}
              </Button>
            </CardContent>
          </Card>

          {/* Code Examples */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-primary">Code Example</h3>
                <Button size="sm" variant="secondary" onClick={copyCode}>
                  Copy
                </Button>
              </div>
              <div className="flex gap-2 mb-3">
                {(['curl', 'python', 'javascript'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCodeTab(tab)}
                    className={cn(
                      'px-3 py-1 rounded text-xs transition-colors capitalize',
                      codeTab === tab
                        ? 'bg-accent text-white'
                        : 'bg-secondary text-muted hover:text-primary'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <pre className="bg-secondary rounded-lg p-4 text-xs text-primary overflow-x-auto font-mono">
                {codeExamples[codeTab]}
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* Response Panel */}
        <Card className="h-fit">
          <CardContent className="p-6">
            <h3 className="font-medium text-primary mb-4">Response</h3>

            {!response && !isLoading && (
              <div className="text-center py-12 text-muted">
                <div className="text-4xl mb-3">🎮</div>
                <p>Configure your request and click &quot;Enhance Prompt&quot; to see the response.</p>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-12 text-muted">
                <div className="animate-spin text-2xl mb-3">⏳</div>
                <p>Enhancing your prompt...</p>
              </div>
            )}

            {response?.error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                <div className="font-medium text-red-600 mb-1">Error</div>
                <div className="text-sm text-red-500">{response.error}</div>
              </div>
            )}

            {response?.enhancedPrompt && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted">Enhanced Prompt</label>
                  <div className="mt-1 rounded-lg bg-secondary p-4 text-sm text-primary whitespace-pre-wrap">
                    {response.enhancedPrompt}
                  </div>
                </div>

                {response.usage && (
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border">
                    <div>
                      <div className="text-xs text-muted">Input</div>
                      <div className="text-sm font-medium text-primary">
                        {response.usage.inputTokens}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Output</div>
                      <div className="text-sm font-medium text-primary">
                        {response.usage.outputTokens}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Total</div>
                      <div className="text-sm font-medium text-primary">
                        {response.usage.totalTokens}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Latency</div>
                      <div className="text-sm font-medium text-primary">
                        {response.usage.processingMs}ms
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(response.enhancedPrompt || '')
                    toast.success('Copied', 'Enhanced prompt copied to clipboard')
                  }}
                >
                  Copy Result
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
