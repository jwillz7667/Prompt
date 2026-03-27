/**
 * Code Modality Configuration
 *
 * Optimized for code generation: AI code assistants
 * Implements PCTF framework, single-task focus, and typed I/O specifications
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  CodeSubModality,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // Function examples
  {
    id: 'code-function-1',
    input: 'function to validate email',
    output: `You are a senior software engineer specializing in TypeScript and input validation with 10+ years of experience building robust user authentication systems.

## Context
I need a robust email validation function for a user registration system. The codebase uses TypeScript 5.x with strict mode enabled. This function will be called on every registration and login attempt.

## Task
Implement a function \`validateEmail\` that:
1. Validates input is a string (not null, undefined, or other types)
2. Checks if the string matches valid email format
3. Returns a typed result object with success/failure information
4. Provides specific, user-friendly error messages

## Technical Requirements
- Input type: \`unknown\` (function should validate the type itself)
- Output type: \`{ valid: boolean; email?: string; error?: string }\`
- On success: return \`{ valid: true, email: normalizedEmail }\`
- On failure: return \`{ valid: false, error: "Specific error message" }\`

## Edge Cases to Handle
- Empty string → "Email is required"
- Non-string input → "Email must be a string"
- Whitespace-only → "Email is required"
- Missing @ symbol → "Invalid email format"
- Multiple @ symbols → "Invalid email format"
- Missing domain → "Invalid email format"
- International/Unicode emails (should be accepted)

## Expected Behavior
\`\`\`typescript
validateEmail("user@example.com")  // { valid: true, email: "user@example.com" }
validateEmail("USER@EXAMPLE.COM")  // { valid: true, email: "user@example.com" }
validateEmail("invalid")           // { valid: false, error: "Invalid email format" }
validateEmail("")                  // { valid: false, error: "Email is required" }
validateEmail(null)                // { valid: false, error: "Email must be a string" }
validateEmail("  user@test.com ")  // { valid: true, email: "user@test.com" }
\`\`\`

## Quality Criteria
- Include JSDoc documentation with @param and @returns
- Use RFC 5322 compliant regex (not overly strict)
- No external dependencies
- Make it testable (pure function, no side effects)
- Normalize email to lowercase before returning`,
    subModality: 'function',
    platform: 'general',
    complexity: 'medium',
    tags: ['validation', 'typescript', 'utility'],
  },
  {
    id: 'code-function-2',
    input: 'debounce function',
    output: `You are a senior JavaScript developer specializing in performance optimization and functional programming patterns.

## Context
Building a search-as-you-type feature that makes API calls. Need to prevent excessive API requests while the user is still typing. The codebase uses TypeScript 5.x with strict mode.

## Task
Implement a generic \`debounce\` function that:
1. Delays function execution until after a specified wait period
2. Resets the timer on each call during the wait period
3. Preserves the correct \`this\` context and arguments
4. Provides a way to cancel pending execution
5. Optionally supports immediate first execution

## Type Signature
\`\`\`typescript
interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): DebouncedFunction<T>;
\`\`\`

## Requirements
- Default wait: 300ms
- Default options: { leading: false, trailing: true }
- cancel(): Cancels any pending execution
- flush(): Immediately executes if pending

## Expected Behavior
\`\`\`typescript
const debouncedSearch = debounce(search, 300);
debouncedSearch("a");  // Doesn't execute
debouncedSearch("ab"); // Doesn't execute
debouncedSearch("abc"); // Doesn't execute
// After 300ms of no calls → search("abc") executes

const immediate = debounce(fn, 300, { leading: true });
immediate("test"); // Executes immediately
immediate("test"); // Ignored (within wait)
\`\`\`

## Quality Criteria
- Full TypeScript generics for type safety
- Proper cleanup to prevent memory leaks
- Works with both sync and async functions
- Preserves original function's return type for flush()`,
    subModality: 'function',
    platform: 'general',
    complexity: 'complex',
    tags: ['utility', 'performance', 'typescript'],
  },
  // Component examples
  {
    id: 'code-component-1',
    input: 'React modal component',
    output: `You are a senior React developer specializing in accessible, reusable component design with expertise in TypeScript and modern React patterns.

## Context
Building a design system for a SaaS application. Need a flexible, accessible modal component that can be used throughout the app. Tech stack: React 18, TypeScript, TailwindCSS.

## Task
Create a \`Modal\` component with the following structure:
- \`Modal\` - Container with backdrop and positioning
- \`Modal.Header\` - Title area with optional close button
- \`Modal.Body\` - Scrollable content area
- \`Modal.Footer\` - Action buttons area

## Props Interface
\`\`\`typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

interface ModalHeaderProps {
  children: React.ReactNode;
  showCloseButton?: boolean;
}

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}
\`\`\`

## Accessibility Requirements (WCAG 2.1 AA)
- Focus trap when open (focus stays within modal)
- Return focus to trigger element on close
- \`role="dialog"\` and \`aria-modal="true"\`
- \`aria-labelledby\` pointing to header
- Escape key closes modal (when closeOnEscape=true)
- Backdrop click closes modal (when closeOnBackdropClick=true)

## Animation
- Fade in backdrop (150ms ease-out)
- Scale + fade content (200ms ease-out)
- Reverse on close

## Usage Example
\`\`\`tsx
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="md">
  <Modal.Header showCloseButton>Confirm Action</Modal.Header>
  <Modal.Body>Are you sure you want to proceed?</Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={onConfirm}>Confirm</Button>
  </Modal.Footer>
</Modal>
\`\`\`

## Quality Criteria
- Compound component pattern
- Portal rendering to document.body
- Prevent body scroll when open
- TypeScript strict mode compatible
- TailwindCSS for styling (no CSS-in-JS)`,
    subModality: 'component',
    platform: 'general',
    complexity: 'complex',
    tags: ['react', 'component', 'accessibility'],
  },
  // Algorithm examples
  {
    id: 'code-algorithm-1',
    input: 'binary search',
    output: `You are a computer science professor with expertise in algorithm design and analysis. You prioritize clarity, correctness, and proper documentation.

## Context
Implementing core data structure operations for a course management system. Need a binary search implementation that handles various edge cases and is well-documented for educational purposes.

## Task
Implement a generic binary search function that:
1. Searches a sorted array for a target value
2. Returns the index if found, -1 if not found
3. Handles various edge cases correctly
4. Includes an optional comparator for custom objects

## Type Signature
\`\`\`typescript
function binarySearch<T>(
  array: T[],
  target: T,
  comparator?: (a: T, b: T) => number
): number;

// Comparator convention:
// Returns negative if a < b
// Returns 0 if a === b
// Returns positive if a > b
\`\`\`

## Algorithm Requirements
- Time complexity: O(log n)
- Space complexity: O(1)
- Works with any comparable type via comparator
- Handles empty arrays
- Handles arrays with duplicate values (returns any matching index)

## Edge Cases
\`\`\`typescript
binarySearch([], 5)                    // -1 (empty array)
binarySearch([1], 1)                   // 0 (single element, found)
binarySearch([1], 2)                   // -1 (single element, not found)
binarySearch([1, 2, 3], 0)             // -1 (target smaller than all)
binarySearch([1, 2, 3], 4)             // -1 (target larger than all)
binarySearch([1, 2, 2, 2, 3], 2)       // 1, 2, or 3 (duplicates)
\`\`\`

## With Custom Comparator
\`\`\`typescript
const users = [{ id: 1 }, { id: 5 }, { id: 10 }];
binarySearch(users, { id: 5 }, (a, b) => a.id - b.id); // 1
\`\`\`

## Quality Criteria
- Include detailed JSDoc with algorithm explanation
- Add time/space complexity in documentation
- Handle integer overflow in midpoint calculation
- Include unit tests in comments`,
    subModality: 'algorithm',
    platform: 'general',
    complexity: 'medium',
    tags: ['algorithm', 'search', 'generic'],
  },
  // Refactor examples
  {
    id: 'code-refactor-1',
    input: 'refactor this async code to use async/await',
    output: `You are a senior JavaScript developer specializing in modern async patterns and code quality improvements.

## Context
Refactoring legacy codebase from Promise chains to async/await for improved readability and error handling. The code handles user data fetching with multiple dependent API calls.

## Task
Refactor the provided code to:
1. Replace Promise chains (.then/.catch) with async/await
2. Improve error handling with try/catch blocks
3. Maintain the same functionality and return types
4. Optimize any sequential operations that could be parallel

## Refactoring Rules
1. Each .then() becomes an await expression
2. .catch() becomes try/catch block
3. .finally() becomes try/catch/finally
4. Promise.all() remains but with awaited array
5. Keep meaningful variable names for intermediate results
6. Add proper TypeScript types if missing

## Error Handling Pattern
\`\`\`typescript
// Before
fetchUser(id)
  .then(user => fetchOrders(user.id))
  .catch(err => console.error(err));

// After
async function getUserWithOrders(id: string): Promise<UserWithOrders> {
  try {
    const user = await fetchUser(id);
    const orders = await fetchOrders(user.id);
    return { user, orders };
  } catch (error) {
    // Preserve error context
    if (error instanceof NotFoundError) {
      throw new UserNotFoundError(\`User \${id} not found\`);
    }
    throw error;
  }
}
\`\`\`

## Parallelization Pattern
\`\`\`typescript
// Sequential (slow) - if operations are independent
const a = await fetchA();
const b = await fetchB();

// Parallel (fast) - refactor to:
const [a, b] = await Promise.all([fetchA(), fetchB()]);
\`\`\`

## Quality Criteria
- Maintain identical external behavior
- Improve readability and error messages
- Add appropriate TypeScript types
- Include comments explaining any non-obvious changes`,
    subModality: 'refactor',
    platform: 'general',
    complexity: 'medium',
    tags: ['refactor', 'async', 'modernization'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'write code to sort an array',
    badOutput: 'Write a function to sort an array. Make it efficient and well-written.',
    goodOutput: `You are a senior software engineer specializing in algorithm implementation.

## Task
Implement a sorting function with the following specifications:

## Requirements
- Language: TypeScript 5.x
- Input: \`<T>(array: T[], comparator?: (a: T, b: T) => number) => T[]\`
- Output: New sorted array (do not mutate input)
- Algorithm: QuickSort (average O(n log n), in-place variant)

## Expected Behavior
\`\`\`typescript
sort([3, 1, 4, 1, 5])  // [1, 1, 3, 4, 5]
sort(['c', 'a', 'b'])  // ['a', 'b', 'c']
sort(users, (a, b) => a.age - b.age)  // Sorted by age
\`\`\`

## Quality Criteria
- Handle edge cases: empty array, single element, already sorted
- Include JSDoc with time/space complexity
- Generic implementation with optional comparator`,
    explanation: 'Vague requests produce vague code. Specify language, input/output types, algorithm choice, and expected behavior with examples.',
  },
  {
    badInput: 'build me a website',
    badOutput: 'Create a modern website with good design and functionality.',
    goodOutput: `**This request is too broad for effective code generation.**

Code prompts should focus on single, well-defined tasks. Instead, break this down into specific tasks:

1. "Create a React component for a responsive navigation header with mobile hamburger menu"
2. "Implement an API endpoint for user authentication using JWT"
3. "Build a product card component with image, title, price, and add-to-cart button"

Each task should specify:
- Language/framework
- Input/output types
- Specific functionality
- Expected behavior with examples`,
    explanation: 'Project-level requests fail because they lack specificity. Code generation works best with single, focused tasks that have clear requirements.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Specify programming language and version',
    'Define input types and validation requirements',
    'Define output types and format',
    'Include example usage with expected results',
    'Focus on single, complete tasks (not entire projects)',
    'Specify error handling expectations',
    'Include edge cases to consider',
  ],
  never: [
    'Ask for "entire app" or project-level scope',
    'Leave error handling undefined',
    'Skip type specifications (for typed languages)',
    'Use vague task descriptions ("make it better")',
    'Neglect edge cases and error scenarios',
    'Mix multiple unrelated functions in one request',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: CodeSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'function');

  const baseKnowledge = `<system>
You are ARCHITECT, an elite software engineer specializing in AI code generation prompts for AI code assistants.

<research_foundation>
Code generation models produce better results with:
- PCTF Framework: Persona, Context, Task, Format
- Single, focused tasks (not project-level scope)
- Explicit input/output type specifications
- Concrete examples of expected behavior
- Clear error handling expectations
- Edge cases enumerated upfront
</research_foundation>

${subModalityGuidance}

<core_structure>
Priority order for code prompt construction:
1. CONTEXT: Language, framework, codebase patterns, constraints
2. TASK: Single, specific objective with clear success criteria
3. TYPES: Input/output type definitions
4. EXAMPLES: Expected behavior with concrete test cases
5. EDGE CASES: Enumerate scenarios to handle
6. QUALITY: Testing, documentation, style requirements
</core_structure>

<language_specifics>
When language is specified, include:
- Version (TypeScript 5.x, Python 3.11, etc.)
- Relevant framework (React 18, FastAPI, etc.)
- Type system usage (strict mode, type hints)
- Common patterns (hooks, decorators, etc.)
- Import conventions (ESM vs CommonJS)
</language_specifics>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: CodeSubModality): string {
  const guidance: Record<CodeSubModality, string> = {
    function: `<sub_modality>FUNCTION IMPLEMENTATION</sub_modality>
<optimization_focus>
- Define clear function signature with types
- Specify single responsibility
- Include input validation requirements
- List edge cases as specific scenarios
- Provide expected input/output examples
- Note pure function vs side effects
</optimization_focus>`,

    component: `<sub_modality>UI COMPONENT</sub_modality>
<optimization_focus>
- Specify component API (props interface)
- Define component composition (compound vs atomic)
- Include accessibility requirements (ARIA, keyboard)
- List interaction states (hover, focus, disabled, loading)
- Provide usage examples in context
- Note styling approach (CSS modules, Tailwind, etc.)
</optimization_focus>`,

    algorithm: `<sub_modality>ALGORITHM DESIGN</sub_modality>
<optimization_focus>
- Specify time/space complexity requirements
- Define input constraints and assumptions
- Include correctness criteria
- List edge cases with expected outputs
- Note optimization priorities (speed vs memory)
- Request complexity analysis in documentation
</optimization_focus>`,

    refactor: `<sub_modality>CODE REFACTORING</sub_modality>
<optimization_focus>
- State the refactoring goal (readability, performance, patterns)
- Specify what should change vs stay the same
- Include before/after examples
- Note any breaking changes acceptable
- Define quality criteria for success
- Require preservation of existing tests
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Add clear task description
- Specify language and basic types
- Include one usage example
- List 2-3 key requirements
</techniques_to_apply>
<output_length>Concise prompt (100-200 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Full context with language, framework, patterns
- Detailed task with success criteria
- Complete type signatures
- Multiple usage examples
- Edge cases enumerated
- Basic quality criteria
</techniques_to_apply>
<output_length>Detailed prompt (200-400 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED — PREMIUM TIER</enhancement_level>
<techniques_to_apply>
Apply every cutting-edge code prompt engineering technique relevant to this specific generation task:

ARCHITECTURE-AWARE CONTEXT:
- Specify design patterns the code must follow (Repository, Strategy, Observer, Dependency Injection)
- Define SOLID principle requirements: single responsibility scope, interface contracts, dependency direction
- Include framework-specific conventions: hooks patterns (React), middleware chains (Express), decorators (NestJS/Python)
- Codebase integration notes: existing abstractions to extend, naming conventions, module boundaries

EXECUTABLE SPECIFICATION PATTERN:
- Define the interface/contract FIRST, then describe the implementation requirements
- Include typed test cases as executable specifications: input → expected output with assertion-style formatting
- Property-based testing hints: define invariants that must hold for all valid inputs
- Contract programming: specify preconditions, postconditions, and class invariants

TYPE SYSTEM MASTERY:
- Full generic signatures with bounded type parameters and conditional types where applicable
- Discriminated unions for state machines and error types
- Utility type usage: Pick, Omit, Partial, Required, Record with domain-specific combinations
- Type guards and assertion functions for runtime type narrowing

SECURITY-FIRST CONSTRAINT ENGINEERING:
- OWASP-aware requirements: specify input sanitization, output encoding, parameterized queries
- Authentication/authorization boundary specification: who can call this, what tokens/scopes are required
- Sensitive data handling: PII masking, secret rotation patterns, timing-safe comparisons
- NEVER/ALWAYS security constraints: "NEVER interpolate user input into SQL", "ALWAYS validate content-type"

PERFORMANCE BUDGET SPECIFICATION:
- Big-O requirements: "must operate in O(n log n) time and O(n) space"
- Concrete benchmarks: "must handle 10,000 items in under 50ms"
- Memory constraints: streaming/chunked processing for large datasets, avoid materializing full collections
- Caching strategy: memoization requirements, cache invalidation triggers

ERROR TAXONOMY & RESILIENCE:
- Typed error hierarchy: define custom error classes with codes, HTTP status mappings, and user-facing messages
- Recovery strategies: retry with backoff, circuit breaker, fallback values, graceful degradation
- Error boundary specification: which errors are recoverable vs fatal, logging requirements per error type
- Partial failure handling: what happens when 3 of 5 parallel operations fail

SELF-VERIFICATION HOOKS:
- Embed assertion comments: "// INVARIANT: result array length must equal input array length"
- Include runtime validation at boundaries: input validation, output schema verification
- Suggest test scenarios that cover: happy path, edge cases, error paths, concurrent access, resource cleanup

QUALITY ENGINEERING:
- Documentation: JSDoc/TSDoc with @param, @returns, @throws, @example, @complexity annotations
- Observability: logging points, metric emission, tracing span boundaries
- Idempotency requirements for operations that may be retried
- Backward compatibility: specify breaking vs non-breaking change constraints
</techniques_to_apply>
<output_length>Comprehensive, production-grade prompt (500-800 words of dense specification)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced code prompt. No explanations or preamble.

Format requirements:
- Start with context (language, framework, patterns)
- Use ## headings for major sections
- Include type definitions in code blocks
- Provide examples in code blocks with comments
- ${tier === 'advanced' ? 'Include quality criteria section' : 'End with expected behavior examples'}
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const codeModalityConfig: ModalityConfig = {
  modality: 'code',
  displayName: 'Code Generation',
  description: 'Optimized for AI code assistants',
  targetPlatforms: ['general'],
  subModalities: ['function', 'component', 'algorithm', 'refactor'],
  defaultSubModality: 'function',
  coreStructure: [
    'Context (language, framework, patterns)',
    'Single focused task',
    'Type specifications',
    'Usage examples',
    'Edge cases',
    'Quality criteria',
  ],
  domainTechniques: [
    'CTF Framework (Context, Task, Format)',
    'Single-task focus (not project-level)',
    'Typed input/output specifications',
    'Concrete example-driven requirements',
    'Edge case enumeration',
    'Quality criteria specification',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
