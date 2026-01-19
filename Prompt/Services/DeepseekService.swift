//
//  DeepseekService.swift
//  Prompt
//
//  Handles API communication with DeepSeek for prompt enhancement
//

import Foundation

actor DeepseekService {
    private let baseURL = "https://api.deepseek.com/v1/chat/completions"

    // MARK: - Request/Response Models

    struct ChatRequest: Encodable, Sendable {
        let model: String
        let messages: [Message]
        let temperature: Double
        let max_tokens: Int
        let stream: Bool

        struct Message: Encodable, Sendable {
            let role: String
            let content: String
        }
    }

    struct ChatResponse: Decodable, Sendable {
        let choices: [Choice]
        let usage: Usage?

        struct Choice: Decodable, Sendable {
            let message: MessageContent
            let finish_reason: String?
        }

        struct MessageContent: Decodable, Sendable {
            let role: String
            let content: String
        }

        struct Usage: Decodable, Sendable {
            let prompt_tokens: Int
            let completion_tokens: Int
            let total_tokens: Int
        }
    }

    struct APIError: Decodable, Sendable {
        let error: ErrorDetail
        struct ErrorDetail: Decodable, Sendable {
            let message: String
            let type: String?
            let code: String?
        }
    }

    // MARK: - Main Enhancement Function

    func enhancePrompt(
        userPrompt: String,
        apiKey: String,
        model: DeepseekModel,
        temperature: Double,
        maxTokens: Int
    ) async throws -> EnhancedPromptResult {
        let systemPrompt = buildMetaPrompt()
        let userMessage = buildUserMessage(userPrompt: userPrompt)

        let request = ChatRequest(
            model: model.rawValue,
            messages: [
                .init(role: "system", content: systemPrompt),
                .init(role: "user", content: userMessage)
            ],
            temperature: temperature,
            max_tokens: maxTokens,
            stream: false
        )

        var urlRequest = URLRequest(url: URL(string: baseURL)!)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = try JSONEncoder().encode(request)
        urlRequest.timeoutInterval = 120

        let (data, response) = try await URLSession.shared.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw EnhancerError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            if let apiError = try? JSONDecoder().decode(APIError.self, from: data) {
                throw EnhancerError.apiError(apiError.error.message)
            }
            throw EnhancerError.httpError(httpResponse.statusCode)
        }

        let chatResponse = try JSONDecoder().decode(ChatResponse.self, from: data)

        guard let content = chatResponse.choices.first?.message.content else {
            throw EnhancerError.emptyResponse
        }

        return EnhancedPromptResult(
            enhancedPrompt: content,
            tokensUsed: chatResponse.usage?.total_tokens ?? 0
        )
    }

    // MARK: - Meta-Prompt Engineering System

    private func buildMetaPrompt() -> String {
        """
        <|system|>
        You are PromptArchitect, an elite prompt engineering system designed to transform user intents into highly optimized, production-grade prompts that maximize AI model performance.

        ## CORE DIRECTIVE
        Transform the user's input into a comprehensive, enhanced prompt using cutting-edge prompt engineering techniques based on the latest research.

        ## PROMPT ENGINEERING TECHNIQUES TO APPLY

        ### 1. Structural Optimization (XML/Delimiter Architecture)
        - Use XML-style tags for clear section demarcation: <context>, <task>, <constraints>, <output_format>, <examples>
        - Implement hierarchical organization with numbered sections and subsections
        - Apply the RISEN framework: Role, Instructions, Steps, End goal, Narrowing constraints
        - Use delimiter tokens: ```xml```, ###, ===, ---, *** for clear boundaries

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
        - Apply attention focusing: **bold** for critical terms, `code` for technical items
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
        </|system|>
        """
    }

    private func buildUserMessage(userPrompt: String) -> String {
        """
        <<<USER_INPUT>>>
        \(userPrompt)
        <<<END_INPUT>>>

        <<<TASK>>>
        Transform the above user input into a comprehensive, enhanced prompt. Apply all relevant prompt engineering techniques from your training. The output should be a complete, production-ready prompt that the user can copy and use directly with any AI model.

        Structure your enhanced prompt with:
        1. Clear role/persona definition with expertise level
        2. Detailed context and background information
        3. Specific task instructions with step-by-step guidance
        4. Output format specifications with examples if helpful
        5. Quality constraints and verification checkpoints
        6. Relevant delimiters, structural markers, and attention signals

        Return ONLY the enhanced prompt, formatted in clean Markdown. Do not include any explanations or meta-commentary about the prompt itself.
        <<<END_TASK>>>
        """
    }
}

// MARK: - Result & Error Types

struct EnhancedPromptResult: Sendable {
    let enhancedPrompt: String
    let tokensUsed: Int
}

enum EnhancerError: LocalizedError, Sendable {
    case invalidResponse
    case httpError(Int)
    case apiError(String)
    case emptyResponse
    case noAPIKey

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .apiError(let message):
            return "API error: \(message)"
        case .emptyResponse:
            return "Empty response from API"
        case .noAPIKey:
            return "Please configure your DeepSeek API key in Settings"
        }
    }
}
