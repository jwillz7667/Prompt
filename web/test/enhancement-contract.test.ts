import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, setTokens } from '@/lib/api/client'
import {
  buildEnhancePayload,
  createPrompt,
  enhancePromptStream,
  getPrompt,
  updatePrompt,
} from '@/lib/api/prompts'
import type { StreamEvent } from '@/lib/types/api'

const fetchMock = vi.fn()
beforeEach(() => {
  clearTokens()
  setTokens('local-access-token', undefined, 900)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

function response(events: unknown[]) {
  const wire =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  // Exercise the real transport/parser across arbitrary network chunk boundaries.
  const bytes = new TextEncoder().encode(wire)
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 17)
          controller.enqueue(bytes.slice(offset, offset + 17))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
async function collect() {
  const events: StreamEvent[] = []
  for await (const event of enhancePromptStream({
    prompt: 'Write a launch email',
    modality: 'text',
  }))
    events.push(event)
  return events
}

describe('backend enhancement stream contract', () => {
  it('turns the real promptId completion into a successful saved result', async () => {
    fetchMock.mockResolvedValue(
      response([
        { type: 'token', content: 'Write a concise ' },
        { type: 'token', content: 'launch email for café owners.' },
        {
          type: 'complete',
          promptId: 'prompt_saved',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, processingMs: 400 },
        },
      ]),
    )
    const events = await collect()
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      prompt: {
        id: 'prompt_saved',
        isSaved: true,
        originalPrompt: 'Write a launch email',
        enhancedPrompt: 'Write a concise launch email for café owners.',
        modality: 'text',
        inputTokens: 10,
        outputTokens: 20,
        processingMs: 400,
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps completed output readable and explicitly unsaved when history persistence fails', async () => {
    fetchMock.mockResolvedValue(
      response([
        { type: 'token', content: 'A complete usable prompt.' },
        { type: 'complete', promptId: null },
      ]),
    )
    expect((await collect()).at(-1)).toMatchObject({
      type: 'complete',
      prompt: {
        id: null,
        isSaved: false,
        enhancedPrompt: 'A complete usable prompt.',
      },
      warning: expect.stringContaining('could not be saved'),
    })
  })

  it('delivers the backend error message after any partial text', async () => {
    fetchMock.mockResolvedValue(
      response([
        { type: 'token', content: 'Partial content' },
        { type: 'error', message: 'MAX mode daily limit reached.' },
      ]),
    )
    expect(await collect()).toEqual([
      { type: 'token', content: 'Partial content' },
      { type: 'error', message: 'MAX mode daily limit reached.' },
    ])
  })

  it('does not synthesize success when the stream ends before completion', async () => {
    fetchMock.mockResolvedValue(response([{ type: 'token', content: 'Partial content' }]))
    expect(await collect()).toEqual([{ type: 'token', content: 'Partial content' }])
  })

  it('rejects empty completed output rather than inventing a usable result', async () => {
    fetchMock.mockResolvedValue(response([{ type: 'complete', promptId: null }]))
    await expect(collect()).rejects.toThrow('without any output')
  })
})

describe('enhancement controls', () => {
  it('maps reasoning to server-authorized MAX mode and style controls to instructions', () => {
    const payload = buildEnhancePayload({
      prompt: 'Write an email',
      tone: 'friendly',
      length: 'concise',
      targetCharacterLength: 500,
      customInstructions: 'Mention our launch date.',
      deepThink: true,
      maxTokens: 2048,
    })
    expect(payload).toMatchObject({ prompt: 'Write an email', mode: 'max', maxTokens: 2048 })
    expect(payload.customInstructions).toContain('Mention our launch date.')
    expect(payload.customInstructions).toContain('friendly tone')
    expect(payload.customInstructions).toContain('brief and focused')
    expect(payload.customInstructions).toContain('500 characters')
    expect(payload).not.toHaveProperty('deepThink')
    expect(payload).not.toHaveProperty('tone')
  })
  it('keeps normal prompts on standard mode and honors the explicit MAX toggle', () => {
    expect(buildEnhancePayload({ prompt: 'Write an email' }).mode).toBe('standard')
    expect(buildEnhancePayload({ prompt: 'Write an email', mode: 'max' }).mode).toBe('max')
  })
  it('validates instruction length and target length before making a paid request', () => {
    expect(() =>
      buildEnhancePayload({ prompt: 'Write an email', customInstructions: 'a'.repeat(2001) }),
    ).toThrow('2,000')
    expect(() =>
      buildEnhancePayload({ prompt: 'Write an email', targetCharacterLength: -1 }),
    ).toThrow('positive')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('prompt response envelopes', () => {
  it('unwraps prompt detail, create, and update responses', async () => {
    const prompt = { id: 'prompt_saved', originalPrompt: 'Raw', enhancedPrompt: 'Enhanced' }
    fetchMock.mockImplementation(async () => Response.json({ prompt }))
    expect(await getPrompt('prompt_saved')).toEqual(prompt)
    expect(await createPrompt({ originalPrompt: 'Raw', enhancedPrompt: 'Enhanced' })).toEqual(
      prompt,
    )
    expect(await updatePrompt('prompt_saved', { isFavorite: true })).toEqual(prompt)
  })
})
