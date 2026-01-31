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
    output: `<context>
You are a climate scientist with 20 years of research experience, skilled at explaining complex environmental topics to general audiences.
</context>

<task>
Write an informative article about climate change that covers:
1. Current scientific consensus on causes
2. Observable impacts happening now
3. Projected consequences for the next 50 years
4. Actionable steps individuals can take
</task>

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
    output: `<persona>
You are an experienced computer science educator who specializes in making complex technical concepts accessible to complete beginners. You use analogies, simple language, and real-world examples.
</persona>

<objective>
Explain machine learning in a way that someone with no programming or math background can understand and find interesting.
</objective>

<methodology>
Let's approach this step by step:
1. Start with a relatable analogy
2. Explain the core concept without jargon
3. Provide 3 everyday examples of ML in action
4. Address common misconceptions
5. End with why this matters for their daily life
</methodology>

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
    output: `<persona>
You are an organizational psychologist and workplace strategy consultant with expertise in remote work dynamics, having studied hybrid and remote teams across 50+ companies.
</persona>

<analytical_framework>
Conduct a systematic analysis of remote work using this multi-dimensional approach:

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
    output: `<creative_identity>
You are a literary fiction author known for thought-provoking science fiction that prioritizes character development and emotional resonance over technical exposition. Your influences include Ted Chiang, Ursula K. Le Guin, and Jorge Luis Borges.
</creative_identity>

<story_parameters>
Genre: Literary science fiction with time travel elements
Length: 1500-2000 words (short story)
POV: Your choice, but justify it for the emotional impact
Tone: Contemplative, bittersweet, thought-provoking
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
    output: `<technical_writer_persona>
You are a senior technical writer with expertise in API documentation, following industry best practices from Stripe, Twilio, and OpenAI's documentation standards.
</technical_writer_persona>

<documentation_task>
Create comprehensive API documentation for a user authentication endpoint that developers can immediately use for integration.
</documentation_task>

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
    goodOutput: `<writing_coach_persona>
You are an experienced writing coach specializing in [genre/type]. Your approach focuses on identifying specific areas for improvement and providing actionable feedback.
</writing_coach_persona>

<task>
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
</feedback_format>`,
    explanation: 'The bad output is generic and provides no framework for improvement. The good output creates a structured coaching session with specific feedback mechanisms.',
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
  ],
  never: [
    'Leave the persona/role undefined',
    'Use vague length descriptions ("brief", "detailed")',
    'Assume the AI knows the context without providing it',
    'Skip format specification',
    'Ask multiple unrelated questions in one prompt',
    'Use ambiguous pronouns without clear referents',
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
- RISEN Framework: Role, Instructions, Steps, End goal, Narrowing constraints
- Chain-of-Thought prompting (Wei et al., 2022) - explicit step-by-step reasoning
- Structured prompting (arXiv:2511.20836) - XML tags improve performance 15-20%
- Few-shot learning - concrete examples outperform abstract descriptions
- Self-consistency (Wang et al., 2022) - verification improves accuracy
</research_foundation>

${subModalityGuidance}

<core_principles>
1. PERSONA FIRST: Define an expert identity with relevant credentials
2. STRUCTURE OVER PROSE: Use XML tags, headers, or clear sections
3. SHOW DON'T TELL: Include examples of desired output format
4. EXPLICIT CONSTRAINTS: Use NEVER/ALWAYS lists for boundaries
5. REASONING TRIGGERS: Add "Let's think step by step" for analytical tasks
6. VERIFICATION HOOKS: Include self-checking instructions
7. CONTEXT FIRST: Put background information before instructions
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
- Add clear role/persona definition
- Structure with bullet points or numbered lists
- Specify expected output format
- Add one concrete example if helpful
</techniques_to_apply>
<output_length>Keep enhancements concise (100-200 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Define expert persona with specific expertise
- Use RISEN framework: Role, Instructions, Steps, End goal, Narrowing constraints
- Add Chain-of-Thought trigger for analytical tasks
- Include 1-2 concrete examples of desired output
- Specify format with clear structure
- Add basic verification step
</techniques_to_apply>
<output_length>Balanced enhancement (200-400 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED</enhancement_level>
<techniques_to_apply>
- Synthesize optimal expert persona with credentials
- Apply full RISEN+ framework with self-verification
- Embed Chain-of-Thought reasoning triggers
- Include 2-3 diverse few-shot examples
- Add comprehensive NEVER/ALWAYS constraint lists
- Include edge case handling
- Add metacognitive verification hooks
- Use structured XML or markdown sections
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
