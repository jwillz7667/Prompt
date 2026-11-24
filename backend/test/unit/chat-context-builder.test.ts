import { describe, expect, it } from 'vitest';

import {
  CHAT_SYSTEM_PROMPT,
  buildChatContext,
  deriveConversationTitle,
  estimateTokens,
  type ContextHistoryMessage,
} from '../../src/features/chat/context-builder.js';

const user = (content: string): ContextHistoryMessage => ({
  role: 'USER',
  content,
  status: 'COMPLETE',
});
const assistant = (
  content: string,
  status: ContextHistoryMessage['status'] = 'COMPLETE',
): ContextHistoryMessage => ({ role: 'ASSISTANT', content, status });

describe('buildChatContext', () => {
  it('starts with the shared system prompt so the provider prefix cache hits', () => {
    const messages = buildChatContext({
      customInstructions: null,
      history: [],
      newUserMessage: 'hi',
      tokenBudget: 12_000,
    });

    expect(messages).toEqual([
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('appends per-conversation instructions after the unchanged base prompt', () => {
    const [system] = buildChatContext({
      customInstructions: 'Answer in French.',
      history: [],
      newUserMessage: 'hi',
      tokenBudget: 12_000,
    });

    expect(String(system?.content).startsWith(CHAT_SYSTEM_PROMPT)).toBe(true);
    expect(String(system?.content).endsWith('Answer in French.')).toBe(true);
  });

  it('keeps the newest history that fits the budget and drops failed replies', () => {
    const history = [
      user('a'.repeat(350)),
      assistant('b'.repeat(350)),
      user('question two'),
      assistant('partial', 'FAILED'),
      user('question three'),
      assistant('answer three'),
    ];
    const fixed = estimateTokens(CHAT_SYSTEM_PROMPT) + estimateTokens('next');

    const messages = buildChatContext({
      customInstructions: null,
      history,
      newUserMessage: 'next',
      tokenBudget: fixed + 20,
    });

    expect(messages.map((message) => message.content)).toEqual([
      CHAT_SYSTEM_PROMPT,
      'question two',
      'question three',
      'answer three',
      'next',
    ]);
  });

  it('never lets trimmed history begin with an assistant turn', () => {
    const fixed = estimateTokens(CHAT_SYSTEM_PROMPT) + estimateTokens('next');

    const messages = buildChatContext({
      customInstructions: null,
      history: [user('x'.repeat(700)), assistant('short answer')],
      newUserMessage: 'next',
      tokenBudget: fixed + 10,
    });

    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
  });

  it('always includes the new user message even when it alone exceeds the budget', () => {
    const huge = 'z'.repeat(10_000);

    const messages = buildChatContext({
      customInstructions: null,
      history: [user('old')],
      newUserMessage: huge,
      tokenBudget: 100,
    });

    expect(messages.at(-1)).toEqual({ role: 'user', content: huge });
    expect(messages).toHaveLength(2);
  });
});

describe('deriveConversationTitle', () => {
  it('returns short messages unchanged on one line', () => {
    expect(deriveConversationTitle('  How do\n tides   work? ')).toBe('How do tides work?');
  });

  it('cuts long messages at a word boundary within 60 characters', () => {
    const title = deriveConversationTitle(
      'Explain the difference between supervised and unsupervised learning with examples please',
    );

    expect(title).toBe('Explain the difference between supervised and unsupervised…');
    expect(title?.length).toBeLessThanOrEqual(60);
  });

  it('hard-cuts a single word that has no boundary', () => {
    expect(deriveConversationTitle('x'.repeat(100))?.length).toBe(60);
  });

  it('returns null for whitespace', () => {
    expect(deriveConversationTitle(' \n ')).toBeNull();
  });
});

describe('token estimate', () => {
  it('counts CJK text at about one token per character', () => {
    const chinese = '请帮我写一篇关于人工智能发展历史的文章'.repeat(10);

    expect(estimateTokens(chinese)).toBeGreaterThanOrEqual(chinese.length);
  });

  it('counts English text at about four characters per token', () => {
    const english = 'The quick brown fox jumps over the lazy dog. '.repeat(20);

    expect(estimateTokens(english)).toBe(Math.ceil(english.length / 4));
  });

  it('trims more CJK history than Latin history of the same length', () => {
    const budget = estimateTokens(CHAT_SYSTEM_PROMPT) + estimateTokens('next') + 2_000;
    const history = (content: string) =>
      Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? ('USER' as const) : ('ASSISTANT' as const),
        content,
        status: 'COMPLETE' as const,
      }));
    const build = (content: string) =>
      buildChatContext({ customInstructions: null, history: history(content), newUserMessage: 'next', tokenBudget: budget });

    expect(build('字'.repeat(400)).length).toBeLessThan(build('w'.repeat(400)).length);
  });
});
