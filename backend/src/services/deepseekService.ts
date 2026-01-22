import { type TierFeatures } from './subscriptionService.js';

// ============================================================================
// TYPES
// ============================================================================

// Tone options for prompt enhancement
export type PromptTone = 'professional' | 'casual' | 'academic' | 'creative' | 'technical' | 'friendly';

// Length options for output control
export type OutputLength = 'concise' | 'standard' | 'detailed';

export interface EnhancePromptRequest {
  prompt: string;
  tier: 'basic' | 'standard' | 'advanced';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tone?: PromptTone;
  length?: OutputLength;
  customInstructions?: string;
}

export interface EnhancePromptResult {
  enhancedPrompt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  processingMs: number;
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

interface DeepSeekResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat'; // Faster than deepseek-reasoner
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048; // Reduced for faster responses

// ============================================================================
// META-PROMPT ENGINEERING SYSTEM (Tiered)
// ============================================================================

function buildBasicMetaPrompt(): string {
  return `You are a prompt enhancement assistant. Transform user prompts into clearer, more effective versions.

RULES:
- Add a clear role definition (e.g., "You are an expert in...")
- Structure with clear sections and bullet points
- Specify the expected output format
- Return ONLY the enhanced prompt in Markdown
- Keep it concise but complete`;
}

function buildStandardMetaPrompt(): string {
  return `You are PromptEngineer. Transform user inputs into effective, well-structured prompts.

TECHNIQUES TO APPLY:
1. RISEN Framework: Role, Instructions, Steps, End goal, Narrowing constraints
2. Clear structure with headings and sections
3. Chain-of-thought for complex tasks ("Let's approach step by step...")
4. Explicit output format and constraints
5. Expert persona assignment

OUTPUT RULES:
- Return ONLY the enhanced prompt
- Use Markdown formatting
- Preserve user's core intent
- Make it self-contained and immediately usable`;
}

function buildAdvancedMetaPrompt(): string {
  return `You are PromptArchitect. Transform user inputs into production-grade prompts optimized for AI models.

TECHNIQUES:
1. RISEN Framework: Role (expert persona), Instructions, Steps, End goal, Narrowing constraints
2. Chain-of-Thought: Add "Let's approach step by step" for complex tasks
3. Clear structure with XML-style tags or Markdown sections
4. Explicit output format and quality constraints
5. Examples when helpful

OUTPUT RULES:
- Return ONLY the enhanced prompt (no explanations)
- Use clean Markdown formatting
- Make it self-contained and immediately usable
- Preserve user's core intent while maximizing clarity`;
}

function buildMetaPrompt(tier: 'basic' | 'standard' | 'advanced'): string {
  switch (tier) {
    case 'basic':
      return buildBasicMetaPrompt();
    case 'standard':
      return buildStandardMetaPrompt();
    case 'advanced':
      return buildAdvancedMetaPrompt();
    default:
      return buildAdvancedMetaPrompt();
  }
}

function getToneInstructions(tone: PromptTone): string {
  switch (tone) {
    case 'professional':
      return 'Use formal, business-appropriate language. Be precise and authoritative.';
    case 'casual':
      return 'Use relaxed, conversational language. Be approachable and friendly.';
    case 'academic':
      return 'Use scholarly, research-oriented language. Be thorough and cite-worthy.';
    case 'creative':
      return 'Use imaginative, expressive language. Be innovative and engaging.';
    case 'technical':
      return 'Use precise, technical language. Be accurate and detail-oriented.';
    case 'friendly':
      return 'Use warm, supportive language. Be encouraging and helpful.';
    default:
      return 'Use clear, professional language.';
  }
}

function getLengthInstructions(length: OutputLength): string {
  switch (length) {
    case 'concise':
      return 'Keep the enhanced prompt brief and to the point. Focus on essential elements only. Target 100-200 words.';
    case 'standard':
      return 'Provide a balanced enhanced prompt with moderate detail. Target 200-400 words.';
    case 'detailed':
      return 'Create a comprehensive enhanced prompt with extensive detail, examples, and context. Target 400-800 words.';
    default:
      return 'Provide a balanced enhanced prompt with moderate detail.';
  }
}

function buildUserMessage(
  userPrompt: string,
  _tier: 'basic' | 'standard' | 'advanced',
  tone?: PromptTone,
  length?: OutputLength,
  customInstructions?: string
): string {
  let message = `Enhance this prompt:\n\n${userPrompt}\n\n`;

  if (tone) {
    message += `TONE: ${getToneInstructions(tone)}\n\n`;
  }

  if (length) {
    message += `LENGTH: ${getLengthInstructions(length)}\n\n`;
  }

  if (customInstructions && customInstructions.trim()) {
    message += `ADDITIONAL INSTRUCTIONS: ${customInstructions}\n\n`;
  }

  message += 'Return only the enhanced prompt in Markdown.';
  return message;
}

// ============================================================================
// MAIN SERVICE FUNCTION
// ============================================================================

export async function enhancePrompt(request: EnhancePromptRequest): Promise<EnhancePromptResult> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable not configured');
  }

  const model = request.model || DEFAULT_MODEL;
  const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = request.maxTokens || DEFAULT_MAX_TOKENS;
  const tier = request.tier || 'advanced';

  const systemPrompt = buildMetaPrompt(tier);
  const userMessage = buildUserMessage(
    request.prompt,
    tier,
    request.tone,
    request.length,
    request.customInstructions
  );

  const deepseekRequest: DeepSeekRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  const startTime = Date.now();

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(deepseekRequest),
  });

  const processingMs = Date.now() - startTime;

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('DeepSeek API error:', response.status, errorBody);
    throw new Error(`DeepSeek API error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as DeepSeekResponse;

  const enhancedContent = data.choices[0]?.message?.content;
  if (!enhancedContent) {
    throw new Error('Empty response from DeepSeek API');
  }

  return {
    enhancedPrompt: enhancedContent,
    model,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
    processingMs,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getPromptTierFromSubscription(features: TierFeatures): 'basic' | 'standard' | 'advanced' {
  return features.promptQuality;
}

// ============================================================================
// STREAMING SERVICE FUNCTION
// ============================================================================

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: EnhancePromptResult) => void;
  onError: (error: Error) => void;
}

export async function enhancePromptStream(
  request: EnhancePromptRequest,
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    callbacks.onError(new Error('DEEPSEEK_API_KEY environment variable not configured'));
    return;
  }

  const model = request.model || DEFAULT_MODEL;
  const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = request.maxTokens || DEFAULT_MAX_TOKENS;
  const tier = request.tier || 'advanced';

  const systemPrompt = buildMetaPrompt(tier);
  const userMessage = buildUserMessage(
    request.prompt,
    tier,
    request.tone,
    request.length,
    request.customInstructions
  );

  const deepseekRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(deepseekRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('DeepSeek API error:', response.status, errorBody);
      callbacks.onError(new Error(`DeepSeek API error: ${response.status}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              callbacks.onToken(delta);
            }
            // Capture usage from final chunk if available
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    const processingMs = Date.now() - startTime;

    callbacks.onComplete({
      enhancedPrompt: fullContent,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      processingMs,
    });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
