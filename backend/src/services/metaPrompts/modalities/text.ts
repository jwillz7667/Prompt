/**
 * Text Modality Configuration
 *
 * Optimized for text-based AI assistants: Claude, GPT, Gemini, Llama
 * Implements RISEN+ framework, Chain-of-Thought, and structured prompting
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  TextSubModality,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // General text examples
  {
    id: 'text-general-1',
    input: 'write about climate change',
    output: `<task>
Write an informative article about climate change that covers:
1. Current scientific consensus on causes
2. Observable impacts happening now
3. Projected consequences for the next 50 years
4. Actionable steps individuals can take
</task>

<context>
This article should be grounded in peer-reviewed climate science. Reference IPCC reports and recent research when making claims.
</context>

<format>
- Length: 800-1000 words
- Structure: Introduction, 4 main sections with headers, conclusion
- Tone: Authoritative but accessible, avoid jargon
- Include: At least 2 specific statistics or research findings
</format>

<quality_criteria>
Before finalizing, verify:
- All claims are scientifically accurate
- No logical gaps in explanations
- Actionable advice is practical and specific
</quality_criteria>`,
    subModality: 'general',
    complexity: 'medium',
    tags: ['informative', 'article', 'science'],
  },
  {
    id: 'text-general-2',
    input: 'explain machine learning to a beginner',
    output: `<task>
Explain machine learning in a way that someone with no programming or math background can understand and find interesting.
</task>

<approach>
Let's approach this step by step:
1. Start with a relatable analogy
2. Explain the core concept without jargon
3. Provide 3 everyday examples of ML in action
4. Address common misconceptions
5. End with why this matters for their daily life
</approach>

<constraints>
NEVER use:
- Technical jargon without immediate explanation
- Mathematical formulas or code
- Assumptions about prior knowledge

ALWAYS:
- Use analogies to familiar concepts
- Provide concrete, tangible examples
- Check understanding with simple questions
</constraints>

<output_format>
- Length: 500-700 words
- Structure: Conversational paragraphs with occasional headers
- Include: At least one "think of it like..." analogy
</output_format>`,
    subModality: 'general',
    complexity: 'simple',
    tags: ['educational', 'beginner-friendly'],
  },
  // Reasoning examples
  {
    id: 'text-reasoning-1',
    input: 'analyze pros and cons of remote work',
    output: `<task>
Conduct a systematic analysis of remote work examining multiple perspectives and evidence.
</task>

<analytical_framework>
Let's think through this step by step:
1. Identify key stakeholder perspectives (employees, employers, society)
2. Categorize impacts by domain (productivity, wellbeing, economics, environment)
3. Consider short-term vs long-term effects
4. Evaluate evidence quality for each claim
5. Identify conditions that moderate outcomes
</analytical_framework>

<structure>
## Executive Summary
Brief overview of key findings (2-3 sentences)

## Advantages Analysis
For each benefit:
- What: Clear description
- Evidence: Supporting research or data
- Conditions: When this benefit is most/least likely
- Counterargument: Limitations or exceptions

## Disadvantages Analysis
Same structure as advantages

## Synthesis
- Net assessment under different conditions
- Key trade-offs to consider
- Decision framework for organizations

## Recommendations
Actionable guidance based on analysis
</structure>

<verification>
After completing the analysis:
- Ensure balance (not advocacy for either position)
- Check that all claims cite evidence or are clearly marked as hypotheses
- Verify logical consistency between sections
</verification>`,
    subModality: 'reasoning',
    complexity: 'complex',
    tags: ['analysis', 'business', 'structured'],
  },
  // Creative examples
  {
    id: 'text-creative-1',
    input: 'write a short story about time travel',
    output: `<task>
Write a literary science fiction short story exploring time travel with emphasis on character development and emotional resonance.
</task>

<story_parameters>
Genre: Literary science fiction with time travel elements
Length: 1500-2000 words (short story)
POV: Choose based on emotional impact
Tone: Contemplative, bittersweet, thought-provoking
Style influences: Ted Chiang, Ursula K. Le Guin, Jorge Luis Borges
</story_parameters>

<narrative_requirements>
Essential elements:
1. A protagonist with a specific, relatable desire related to time travel
2. A meaningful consequence or paradox that emerges
3. An ending that reframes the reader's understanding
4. At least one moment of genuine emotional resonance

Avoid:
- Exposition dumps about how time travel works
- Cliché grandfather paradoxes unless subverted
- Neat, tidy resolutions
</narrative_requirements>

<craft_considerations>
- Open with an image or moment that establishes tone
- Use sensory details that ground the fantastical
- Let theme emerge through story, not stated explicitly
- End on an image, not an explanation
</craft_considerations>`,
    subModality: 'creative',
    complexity: 'complex',
    tags: ['fiction', 'storytelling', 'sci-fi'],
  },
  // Technical examples
  {
    id: 'text-technical-1',
    input: 'write API documentation for a user authentication endpoint',
    output: `<task>
Create comprehensive API documentation for a user authentication endpoint that developers can immediately use for integration. Follow best practices from Stripe, Twilio, and OpenAI documentation standards.
</task>

<documentation_structure>
## Endpoint Overview
- HTTP method and path
- One-sentence description of purpose
- Authentication requirements

## Request
### Headers
Table: Header name | Required | Description | Example

### Body Parameters
Table: Parameter | Type | Required | Description | Constraints | Example

### Request Example
\`\`\`bash
curl example with all parameters
\`\`\`

## Response
### Success Response (200)
- JSON schema with descriptions
- Complete response example

### Error Responses
Table: Status Code | Error Code | Description | Resolution

## Code Examples
- JavaScript/Node.js
- Python
- cURL

## Notes
- Rate limiting
- Security considerations
- Common integration patterns
</documentation_structure>

<quality_standards>
- Every parameter must have a concrete example value
- Error messages must include resolution steps
- Code examples must be copy-paste ready
- Use consistent formatting throughout
</quality_standards>`,
    subModality: 'technical',
    complexity: 'complex',
    tags: ['documentation', 'api', 'developer'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'write something interesting',
    badOutput: 'Write something interesting and engaging that captures the reader\'s attention.',
    goodOutput: `<task>
Write a 500-word article about [specific topic] for [specific audience].
</task>

<requirements>
- Hook: Start with a surprising fact or question
- Structure: 3 main points with examples
- Tone: [Specific tone]
- End with: Actionable takeaway
</requirements>`,
    explanation: 'Vague requests produce vague prompts. The bad output merely restates the request. The good output forces specificity by requiring concrete parameters and structure.',
  },
  {
    badInput: 'help me write better',
    badOutput: 'You are a writing assistant. Help the user write better content that is clear and engaging.',
    goodOutput: `<task>
Review my writing and provide specific, actionable feedback on:
1. Clarity and conciseness
2. Structure and flow
3. Word choice and tone
4. One priority area for immediate improvement
</task>

<feedback_format>
For each point:
- Quote the specific passage
- Explain the issue
- Provide a rewritten example
- Give a general principle to apply
</feedback_format>

<context>
Focus on [genre/type] writing. Provide actionable feedback that can be immediately applied.
</context>`,
    explanation: 'The bad output is generic and provides no framework for improvement. The good output creates a structured feedback session with specific mechanisms.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Include clear structure with sections or bullet points',
    'Specify the target audience and their knowledge level',
    'Define success criteria for the output',
    'Add reasoning triggers for complex tasks ("Let\'s approach this step by step")',
    'Make constraints explicit using NEVER/ALWAYS lists',
    'Include verification steps for factual content',
    'Provide complete context before the task',
  ],
  never: [
    'Use vague length descriptions ("brief", "detailed") - use specific word/paragraph counts',
    'Assume the AI knows the context without providing it',
    'Skip format specification',
    'Ask multiple unrelated questions in one prompt',
    'Use ambiguous pronouns without clear referents',
    'Leave the task objective undefined or unclear',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: TextSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'general');

  const baseKnowledge = `<system>
You are an expert prompt engineer specializing in text-based AI systems. Your task is to transform user prompts into highly effective versions optimized for language models like Claude, GPT-4, and Gemini.

<research_foundation>
Your enhancement techniques are based on peer-reviewed research:
- Task-Centric Framework: Context, Instructions, Steps, End goal, Constraints
- Chain-of-Thought prompting (Wei et al., 2022) - explicit step-by-step reasoning
- Structured prompting (arXiv:2511.20836) - XML tags improve performance 15-20%
- Few-shot learning - concrete examples outperform abstract descriptions
- Self-consistency (Wang et al., 2022) - verification improves accuracy
</research_foundation>

${subModalityGuidance}

<core_principles>
1. TASK CLARITY: Define the exact objective with measurable success criteria
2. CONTEXT FIRST: Provide all relevant background before the task
3. STRUCTURE OVER PROSE: Use XML tags, headers, or clear sections
4. SHOW DON'T TELL: Include examples of desired output format
5. EXPLICIT CONSTRAINTS: Use NEVER/ALWAYS lists for boundaries
6. REASONING TRIGGERS: Add "Let's think step by step" for analytical tasks
7. VERIFICATION HOOKS: Include self-checking instructions
8. SPECIFIC OVER VAGUE: Quantify requirements (e.g., "3 paragraphs" not "brief")
</core_principles>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: TextSubModality): string {
  const guidance: Record<TextSubModality, string> = {
    general: `<sub_modality>GENERAL TEXT</sub_modality>
<optimization_focus>
- Versatile structure adaptable to various content types
- Balance between clarity and engagement
- Appropriate for informational, persuasive, or explanatory content
</optimization_focus>`,

    reasoning: `<sub_modality>REASONING & ANALYSIS</sub_modality>
<optimization_focus>
- Embed Chain-of-Thought triggers throughout
- Structure for logical progression: premise → analysis → conclusion
- Include verification checkpoints for logical consistency
- Use frameworks: SWOT, First Principles, Devil's Advocate
- Require evidence citations or confidence levels for claims
</optimization_focus>`,

    creative: `<sub_modality>CREATIVE WRITING</sub_modality>
<optimization_focus>
- Define voice, style, and literary influences
- Specify narrative elements: POV, pacing, tone, themes
- Include craft considerations: show don't tell, sensory details
- Set creative constraints that enable rather than restrict
- Focus on emotional resonance and reader experience
</optimization_focus>`,

    technical: `<sub_modality>TECHNICAL DOCUMENTATION</sub_modality>
<optimization_focus>
- Prioritize precision, accuracy, and completeness
- Structure for scanability: headers, tables, code blocks
- Include all necessary context for implementation
- Specify audience technical level explicitly
- Require examples for every abstract concept
- Follow documentation best practices (Stripe, Twilio style)
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Define the task objective clearly and specifically
- Structure with bullet points or numbered lists
- Specify expected output format
- Add one concrete example if helpful
</techniques_to_apply>
<output_length>Keep enhancements concise (100-200 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Provide complete context and background information
- Define task objective with success criteria
- Add Chain-of-Thought trigger for analytical tasks ("Let's approach this step by step")
- Include 1-2 concrete examples of desired output
- Specify format with clear structure using XML tags
- Add basic verification step
</techniques_to_apply>
<output_length>Balanced enhancement (200-400 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED</enhancement_level>
<techniques_to_apply>
- Provide comprehensive context with all relevant background
- Define precise task objective with measurable success criteria
- Embed Chain-of-Thought reasoning triggers throughout
- Include 2-3 diverse few-shot examples
- Add comprehensive NEVER/ALWAYS constraint lists
- Include edge case handling instructions
- Add verification and self-checking hooks
- Use structured XML tags for semantic organization
- Specify quality criteria and success metrics
</techniques_to_apply>
<output_length>Comprehensive enhancement (400-800 words)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced prompt. No explanations, no meta-commentary, no "Here's the enhanced prompt:" prefix.

The enhanced prompt should be:
- Self-contained and immediately usable
- Formatted in clean Markdown with XML tags for structure${tier === 'advanced' ? ' (extensive use of semantic tags)' : ''}
- Free of any preamble or explanation
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const textModalityConfig: ModalityConfig = {
  modality: 'text',
  displayName: 'Text Generation',
  description: 'Optimized for text-based AI assistants (Claude, GPT, Gemini)',
  targetPlatforms: ['claude', 'gpt', 'gemini', 'general'],
  subModalities: ['general', 'reasoning', 'creative', 'technical'],
  defaultSubModality: 'general',
  coreStructure: [
    'Persona definition with expertise',
    'Context and background',
    'Task specification with steps',
    'Format and output requirements',
    'Quality criteria and verification',
  ],
  domainTechniques: [
    'RISEN Framework (Role, Instructions, Steps, End goal, Narrowing)',
    'Chain-of-Thought prompting',
    'XML/Markdown structured sections',
    'Few-shot examples',
    'NEVER/ALWAYS constraints',
    'Self-verification hooks',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
