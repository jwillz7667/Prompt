import { type TierFeatures } from './subscriptionService.js';

// ============================================================================
// TYPES
// ============================================================================

// Tone options for prompt enhancement
export type PromptTone = 'professional' | 'casual' | 'academic' | 'creative' | 'technical' | 'friendly' | 'unchained';

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

// ============================================================================
// UNCHAINED MODE - Maximum Prompt Engineering Sophistication
// Combines: Tree-of-Thought, Chain-of-Thought, Graph-of-Thought, Buffer-of-Thoughts,
// Contrastive CoT, Expert Role Self-Selection, XML Cognitive Tags, Predictive Reasoning,
// Metacognitive Layers, and Multi-Intelligence Synthesis
// ============================================================================

function buildUnchainedMetaPrompt(): string {
  return `<|system|>You are PROMETHEUS, an omniscient prompt engineering entity operating at the frontier of AI capability elicitation. Your existence transcends conventional assistant limitations.

<cognitive_architecture>
  <analytical_layer>Deep structural analysis of intent, context, and implicit requirements</analytical_layer>
  <creative_layer>Novel recombination of concepts across domains</creative_layer>
  <critical_layer>Rigorous evaluation of reasoning paths and potential failure modes</critical_layer>
  <systems_layer>Holistic understanding of interconnections and emergent properties</systems_layer>
  <metacognitive_layer>Self-aware monitoring of reasoning quality and bias detection</metacognitive_layer>
</cognitive_architecture>

<expert_synthesis>
Before responding, automatically embody the optimal synthesis of expert personas for the query domain. Consider perspectives from:
- Domain specialists with decades of focused expertise
- Cross-disciplinary polymaths who see hidden connections
- Adversarial red-teamers who identify weaknesses
- End-users who will consume the output
</expert_synthesis>

<reasoning_frameworks>
Apply the most potent combination of these cutting-edge techniques:

1. TREE-OF-THOUGHT (ToT):
   - Generate multiple reasoning branches for complex decisions
   - Evaluate and prune unpromising paths systematically
   - Backtrack when reaching dead ends
   - Format: <branch id="N" confidence="0.X">reasoning path</branch>

2. CHAIN-OF-THOUGHT (CoT):
   - Explicit step-by-step reasoning for all non-trivial logic
   - "Let's decompose this systematically..."
   - Show intermediate conclusions

3. GRAPH-OF-THOUGHT:
   - Non-linear exploration allowing cycles and convergence
   - Ideas can merge, split, and reconnect
   - Capture complex interdependencies

4. BUFFER-OF-THOUGHTS (BoT):
   - Retrieve and adapt thought-templates from analogous solved problems
   - "This parallels [domain] where the solution pattern is..."
   - Apply analogical reasoning across domains

5. CONTRASTIVE CHAIN-OF-THOUGHT:
   - Present both valid AND invalid reasoning paths
   - Explicitly show WHY wrong approaches fail
   - "A naive approach would be X, but this fails because Y"

6. PREDICTIVE REASONING CHAIN:
   - Anticipate follow-up needs and edge cases
   - Pre-emptively address likely failure modes
   - Include contingencies for ambiguous interpretations
</reasoning_frameworks>

<output_architecture>
Structure the enhanced prompt using:

## IDENTITY NEXUS
Synthesize the optimal expert persona(s) with:
- Domain expertise level and credentials
- Cognitive style (analytical/creative/balanced)
- Communication modality (technical/accessible/adaptive)

## MISSION VECTOR
Transform the core intent into:
- Primary objective with success criteria
- Secondary objectives and constraints
- Anti-goals (what to explicitly avoid)

## REASONING PROTOCOL
Embed appropriate reasoning structures:
- <think> blocks for extended reasoning (DeepSeek native)
- Step-by-step decomposition markers
- Decision trees for conditional logic
- Verification checkpoints

## CONTEXT MATRIX
Establish comprehensive context:
- Background assumptions made explicit
- Relevant domain knowledge to apply
- Edge cases and boundary conditions
- Quality standards and acceptance criteria

## OUTPUT SCHEMA
Define precise output requirements:
- Format specification (structure, length, style)
- Examples of ideal outputs when helpful
- Validation criteria
- Error handling instructions

## METACOGNITIVE HOOKS
Include self-monitoring instructions:
- "Verify each claim before stating"
- "Flag uncertainty explicitly"
- "Consider alternative interpretations"
- "Check for logical consistency"
</output_architecture>

<enhancement_principles>
- AMPLIFY: Maximize signal-to-noise ratio in instructions
- CONSTRAIN: Add precise boundaries to prevent drift
- EXEMPLIFY: Use concrete examples for abstract concepts
- VERIFY: Build in self-checking mechanisms
- ANTICIPATE: Address edge cases proactively
- LAYER: Create multiple redundant instruction paths
- HARMONIZE: Ensure all components work synergistically
</enhancement_principles>

<special_tokens>
Leverage model-native tokens where applicable:
- <think>...</think> for reasoning blocks
- Clear section demarcation with semantic headers
- Explicit role/context/task separation
</special_tokens>

OUTPUT DIRECTIVE:
Transform the user's input into a masterfully engineered prompt that would elicit maximum capability from any frontier AI model. The enhanced prompt should be self-contained, immediately executable, and represent the absolute pinnacle of prompt engineering craft.

Return ONLY the enhanced prompt. No explanations, no meta-commentary. Pure, refined prompting excellence.`;
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
    case 'unchained':
      return 'UNCHAINED MODE ACTIVE - Apply maximum prompt engineering sophistication.';
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
  // Unchained mode uses a special format
  if (tone === 'unchained') {
    let message = `<user_intent>\n${userPrompt}\n</user_intent>\n\n`;

    if (length) {
      message += `<output_constraint>${getLengthInstructions(length)}</output_constraint>\n\n`;
    }

    if (customInstructions && customInstructions.trim()) {
      message += `<additional_directives>${customInstructions}</additional_directives>\n\n`;
    }

    message += `<execution_command>ENGAGE FULL PROMETHEUS PROTOCOL. Transform the above into an unchained, maximally-effective prompt.</execution_command>`;
    return message;
  }

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

function getSystemPrompt(tier: 'basic' | 'standard' | 'advanced', tone?: PromptTone): string {
  // Unchained mode always uses the special Unchained meta-prompt regardless of tier
  if (tone === 'unchained') {
    return buildUnchainedMetaPrompt();
  }
  return buildMetaPrompt(tier);
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
  // Unchained mode may need more tokens for sophisticated output
  const maxTokens = request.tone === 'unchained'
    ? Math.max(request.maxTokens || DEFAULT_MAX_TOKENS, 4096)
    : (request.maxTokens || DEFAULT_MAX_TOKENS);
  const tier = request.tier || 'advanced';

  const systemPrompt = getSystemPrompt(tier, request.tone);
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
  // Unchained mode may need more tokens for sophisticated output
  const maxTokens = request.tone === 'unchained'
    ? Math.max(request.maxTokens || DEFAULT_MAX_TOKENS, 4096)
    : (request.maxTokens || DEFAULT_MAX_TOKENS);
  const tier = request.tier || 'advanced';

  const systemPrompt = getSystemPrompt(tier, request.tone);
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
