import { describe, expect, it, vi } from 'vitest';

import { loadChatConfig } from '../../src/features/chat/config.js';
import type { ChatRepo } from '../../src/features/chat/repo.js';
import { createChatService, type ChatStreamEvent, type ChatStreamSink } from '../../src/features/chat/service.js';

const NOW = new Date('2026-11-24T12:00:00Z');
const conversation = { id: 'conv_1', title: 'Existing', systemPrompt: null, createdAt: NOW, updatedAt: NOW };

function fakeRepo(overrides: Partial<Record<keyof ChatRepo, unknown>> = {}) {
  const repo = {
    findConversation: vi.fn().mockResolvedValue(conversation),
    hasClientMessage: vi.fn().mockResolvedValue(false),
    recentHistory: vi.fn().mockResolvedValue([]),
    createExchange: vi.fn().mockResolvedValue({ userMessageId: 'user_1', assistantMessageId: 'reply_1' }),
    commitReply: vi.fn().mockResolvedValue({ id: 'conv_1', title: 'Existing', updatedAt: NOW }),
    finalizeAssistant: vi.fn().mockResolvedValue(undefined),
    deleteMessages: vi.fn().mockResolvedValue(undefined),
    findFirstUserMessage: vi.fn().mockResolvedValue('hi'),
    ...overrides,
  };
  return repo;
}

function sink(onSend: (event: ChatStreamEvent) => void = () => undefined): ChatStreamSink & { events: ChatStreamEvent[] } {
  const events: ChatStreamEvent[] = [];
  return {
    events,
    signal: new AbortController().signal,
    open: () => undefined,
    send: (event) => {
      onSend(event);
      events.push(event);
    },
  };
}

function service(repo: ReturnType<typeof fakeRepo>) {
  const release = vi.fn().mockResolvedValue(undefined);
  const chat = createChatService({
    repo: repo as unknown as ChatRepo,
    streamChat: async (_request, callbacks) => {
      await callbacks.onToken('Answer');
      return {
        content: 'Answer',
        provider: 'deepseek',
        model: 'm',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
    moderate: async () => 'allow',
    fairUse: { reserve: async () => ({ isAllowed: true, reservation: { release } }) },
    config: loadChatConfig({}),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { chat, release };
}

const body = { content: 'hi', clientMessageId: '6f1d3c1e-2b1a-4c55-9f0e-0a7d2c3b4e5f' };

describe('chat turn failure handling', () => {
  it('never deletes a committed reply or the user message when a later step fails', async () => {
    const repo = fakeRepo();
    const { chat, release } = service(repo);
    const failingSink = sink((event) => {
      if (event.type === 'complete') throw new Error('socket write failed');
    });

    await chat.streamReply('user_a', 'conv_1', body, failingSink);

    expect(repo.commitReply).toHaveBeenCalledOnce();
    expect(repo.deleteMessages).not.toHaveBeenCalled();
    expect(repo.finalizeAssistant).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(failingSink.events.at(-1)).toMatchObject({ type: 'error' });
  });

  it('keeps the user message and marks the reply FAILED when saving the reply fails', async () => {
    const repo = fakeRepo({ commitReply: vi.fn().mockRejectedValue(new Error('pool timeout')) });
    const { chat, release } = service(repo);
    const events = sink();

    await chat.streamReply('user_a', 'conv_1', body, events);

    expect(repo.finalizeAssistant).toHaveBeenCalledWith('reply_1', { content: '', status: 'FAILED' });
    expect(repo.deleteMessages).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(events.events.map((event) => event.type)).toEqual(['start', 'token', 'error']);
  });
});
