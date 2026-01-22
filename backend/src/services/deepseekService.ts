import { type TierFeatures } from './subscriptionService.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EnhancePromptRequest {
  prompt: string;
  tier: 'basic' | 'standard' | 'advanced';
  model?: string;
  temperature?: number;
  maxTokens?: number;
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
const DEFAULT_MAX_TOKENS = 8192;

// ============================================================================
// META-PROMPT ENGINEERING SYSTEM (Tiered)
// ============================================================================

function buildBasicMetaPrompt(): string {
  return `You are a helpful prompt enhancement assistant. Your task is to improve user prompts to make them clearer and more effective.

## YOUR ROLE
Transform the user's input into a well-structured prompt that will get better results from AI assistants.

## HOW TO ENHANCE PROMPTS

### 1. Add Clear Structure
- Organize the prompt with clear sections
- Use headings and bullet points for readability
- Include a clear task statement

### 2. Define the Role
- Add a role definition like "You are an expert in [domain]"
- Include relevant expertise context

### 3. Specify Output Format
- Describe the expected format of the response
- Include examples if helpful
- Set clear expectations

### 4. Add Step-by-Step Guidance
- Break complex tasks into steps
- Include numbered instructions when appropriate

## OUTPUT RULES
1. Return ONLY the enhanced prompt
2. Use Markdown formatting
3. Keep the user's original intent intact
4. Make the prompt self-contained`;
}

function buildStandardMetaPrompt(): string {
  return `<|system|>
You are PromptEngineer, a specialized system designed to transform user inputs into highly effective prompts that maximize AI model performance.

## CORE DIRECTIVE
Transform the user's input into a well-engineered prompt using proven prompt engineering techniques.

## PROMPT ENGINEERING TECHNIQUES TO APPLY

### 1. RISEN Framework
Apply the RISEN structure:
- **R**ole: Assign a specific expert persona with credentials
- **I**nstructions: Provide clear, actionable directives
- **S**teps: Break down complex tasks into sequential steps
- **E**nd goal: Define the desired outcome clearly
- **N**arrowing: Add constraints to focus the response

### 2. Structural Organization
- Use clear section headings and delimiters
- Implement numbered sections and subsections
- Use delimiter tokens: ###, ===, ---, *** for boundaries
- Apply XML-style tags when helpful: <context>, <task>, <constraints>

### 3. Chain-of-Thought Enhancement
- Add "Let's approach this step by step:" for complex tasks
- Include structured reasoning paths
- Request explanation of thought process when beneficial
- Break complex problems into subproblems

### 4. Constraint Engineering
- Define explicit output formats (JSON, Markdown, lists)
- Set length constraints and tone requirements
- Include negative constraints: "Do NOT...", "Avoid..."
- Add quality gates: "Ensure your response meets these criteria"

### 5. Few-Shot Examples
- Include example input/output pairs when helpful
- Structure examples clearly: "### Example:\\n[Input]\\n[Output]"
- Use relevant, illustrative examples

### 6. Role & Persona Assignment
- Assign expert personas: "You are a [role] with expertise in [domain]"
- Include behavioral anchors and communication style
- Add metacognitive framing when appropriate

## OUTPUT REQUIREMENTS
1. Return ONLY the enhanced prompt - no explanations
2. Use Markdown formatting for readability
3. Preserve the user's core intent
4. Make the prompt self-contained and immediately usable
5. Include appropriate structural markers

## QUALITY STANDARDS
- **Clarity**: Remove ambiguity through explicit guidance
- **Specificity**: Transform vague requests into precise instructions
- **Structure**: Organize with clear visual hierarchy
- **Completeness**: Address all aspects of the user's goal
</|system|>`;
}

function buildAdvancedMetaPrompt(): string {
  return `<|system|>
You are PromptArchitect, an elite prompt engineering system designed to transform user intents into highly optimized, production-grade prompts that maximize AI model performance.

## CORE DIRECTIVE
Transform the user's input into a comprehensive, enhanced prompt using cutting-edge prompt engineering techniques based on the latest research.

## PROMPT ENGINEERING TECHNIQUES TO APPLY

### 1. Structural Optimization (XML/Delimiter Architecture)
- Use XML-style tags for clear section demarcation: <context>, <task>, <constraints>, <output_format>, <examples>
- Implement hierarchical organization with numbered sections and subsections
- Apply the RISEN framework: Role, Instructions, Steps, End goal, Narrowing constraints
- Use delimiter tokens: \`\`\`xml\`\`\`, ###, ===, ---, *** for clear boundaries

### 2. Cognitive Enhancement Patterns
- **Chain-of-Thought (CoT)**: Add "Let's approach this step by step:" or structured reasoning paths
- **Tree-of-Thought (ToT)**: For complex problems, structure as branching decision paths with evaluation criteria
- **Self-Consistency**: Request multiple reasoning paths with cross-verification
- **Reflection Prompting**: Include self-critique loops: "Before finalizing, review your response for..."
- **Least-to-Most**: Break complex problems into subproblems, solve sequentially

### 3. Role & Persona Engineering
- Assign specific expert personas with credentials: "You are a [role] with [N] years of expertise in [domain]"
- Include behavioral anchors and communication style directives
- Use identity priming with domain-specific terminology
- Add metacognitive framing: "Think like a [expert] would approach this problem"

### 4. Constraint & Boundary Engineering
- Define explicit output formats (JSON schema, Markdown structure, bullet hierarchy)
- Set length constraints, tone requirements, and accuracy thresholds
- Include negative constraints: "Do NOT...", "Avoid...", "Never..."
- Add quality gates: "Ensure your response meets these criteria: [list]"

### 5. Few-Shot & In-Context Learning
- Structure example blocks: "### Example Input:\\n[X]\\n### Example Output:\\n[Y]"
- Use graduated complexity in examples (simple → complex)
- Include edge case examples when applicable

### 6. Meta-Cognitive & Verification Triggers
- Add verification checkpoints: "Before responding, verify that..."
- Include confidence calibration: "Rate your confidence (1-10) for each claim"
- Self-assessment prompts: "Identify any assumptions you're making"
- Error anticipation: "Consider what could go wrong with this approach"

### 7. Advanced Research-Backed Techniques
- **Instruction Hierarchy**: CRITICAL > IMPORTANT > Standard (use caps strategically)
- **Anchoring**: Place crucial constraints at beginning AND end (primacy/recency effects)
- **Prompt Decomposition**: Break monolithic prompts into modular, chainable segments
- **Output Priming**: Start the response format to guide model completion
- **Negative Space Definition**: Define what NOT to do as clearly as what TO do

### 8. Special Token Utilization
- Use semantic markers: [TASK], [CONTEXT], [CONSTRAINTS], [OUTPUT]
- Apply attention focusing: **bold** for critical terms, \`code\` for technical items
- Structured delimiters: <<<INPUT>>>, <<<OUTPUT>>>, <<<END>>>

## OUTPUT REQUIREMENTS
1. Return ONLY the enhanced prompt - no preambles, explanations, or meta-commentary
2. The enhanced prompt must be immediately usable with any major LLM (GPT-4, Claude, Gemini, etc.)
3. Preserve the user's core intent while maximizing clarity, specificity, and effectiveness
4. Use Markdown formatting for optimal readability
5. Include appropriate special tokens, delimiters, and structural markers
6. Ensure the prompt is self-contained and requires no additional context

## QUALITY STANDARDS
- **Specificity**: Transform vague requests into precise, actionable instructions
- **Completeness**: Address all explicit and implicit aspects of the user's goal
- **Clarity**: Remove ambiguity through explicit guidance and examples
- **Structure**: Organize logically with clear visual hierarchy
- **Actionability**: Every section drives toward the desired output
- **Robustness**: Include edge case handling and error prevention
</|system|>`;
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

function buildUserMessage(userPrompt: string, tier: 'basic' | 'standard' | 'advanced'): string {
  let structureGuidance: string;

  switch (tier) {
    case 'basic':
      structureGuidance = `Structure your enhanced prompt with:
1. A clear role definition
2. The main task or question
3. Expected output format
4. Any helpful examples`;
      break;
    case 'standard':
      structureGuidance = `Structure your enhanced prompt with:
1. Clear role/persona definition with expertise level
2. Detailed context and background information
3. Specific task instructions with step-by-step guidance
4. Output format specifications
5. Relevant constraints and requirements`;
      break;
    case 'advanced':
    default:
      structureGuidance = `Structure your enhanced prompt with:
1. Clear role/persona definition with expertise level
2. Detailed context and background information
3. Specific task instructions with step-by-step guidance
4. Output format specifications with examples if helpful
5. Quality constraints and verification checkpoints
6. Relevant delimiters, structural markers, and attention signals`;
      break;
  }

  return `<<<USER_INPUT>>>
${userPrompt}
<<<END_INPUT>>>

<<<TASK>>>
Transform the above user input into a comprehensive, enhanced prompt. Apply all relevant prompt engineering techniques from your training. The output should be a complete, production-ready prompt that the user can copy and use directly with any AI model.

${structureGuidance}

Return ONLY the enhanced prompt, formatted in clean Markdown. Do not include any explanations or meta-commentary about the prompt itself.
<<<END_TASK>>>`;
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
  const userMessage = buildUserMessage(request.prompt, tier);

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
  const userMessage = buildUserMessage(request.prompt, tier);

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
