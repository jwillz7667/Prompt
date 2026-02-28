import Foundation

// MARK: - Workflow Models

enum WorkflowStatus: String, Codable, CaseIterable {
    case draft = "DRAFT"
    case active = "ACTIVE"
    case paused = "PAUSED"
    case completed = "COMPLETED"
    case archived = "ARCHIVED"
    
    var displayName: String {
        switch self {
        case .draft: return "Draft"
        case .active: return "Active"
        case .paused: return "Paused"
        case .completed: return "Completed"
        case .archived: return "Archived"
        }
    }
    
    var icon: String {
        switch self {
        case .draft: return "doc.text"
        case .active: return "play.circle.fill"
        case .paused: return "pause.circle.fill"
        case .completed: return "checkmark.circle.fill"
        case .archived: return "archivebox.fill"
        }
    }
}

struct Workflow: Codable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let description: String?
    let status: WorkflowStatus
    let metadata: [String: Any]?
    let createdAt: Date
    let updatedAt: Date
    let steps: [WorkflowStep]
    let executions: [WorkflowExecution]?
    let _count: WorkflowCount?
    
    struct WorkflowCount: Codable {
        let executions: Int?
    }
    
    enum CodingKeys: String, CodingKey {
        case id, userId, name, description, status, metadata, createdAt, updatedAt, steps, executions
        case _count
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        status = try container.decode(WorkflowStatus.self, forKey: .status)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        steps = try container.decode([WorkflowStep].self, forKey: .steps)
        executions = try container.decodeIfPresent([WorkflowExecution].self, forKey: .executions)
        _count = try container.decodeIfPresent(WorkflowCount.self, forKey: ._count)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(status, forKey: .status)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encode(steps, forKey: .steps)
        try container.encodeIfPresent(executions, forKey: .executions)
        try container.encodeIfPresent(_count, forKey: ._count)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

struct WorkflowStep: Codable, Identifiable {
    let id: String
    let workflowId: String
    let stepOrder: Int
    let name: String
    let promptTemplate: String
    let contextRequired: [String]
    let outputFormat: String?
    let validationRules: [ValidationRule]?
    let metadata: [String: Any]?
    let createdAt: Date
    let updatedAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id, workflowId, stepOrder, name, promptTemplate, contextRequired, outputFormat, validationRules, metadata, createdAt, updatedAt
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        workflowId = try container.decode(String.self, forKey: .workflowId)
        stepOrder = try container.decode(Int.self, forKey: .stepOrder)
        name = try container.decode(String.self, forKey: .name)
        promptTemplate = try container.decode(String.self, forKey: .promptTemplate)
        contextRequired = try container.decode([String].self, forKey: .contextRequired)
        outputFormat = try container.decodeIfPresent(String.self, forKey: .outputFormat)
        validationRules = try container.decodeIfPresent([ValidationRule].self, forKey: .validationRules)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(workflowId, forKey: .workflowId)
        try container.encode(stepOrder, forKey: .stepOrder)
        try container.encode(name, forKey: .name)
        try container.encode(promptTemplate, forKey: .promptTemplate)
        try container.encode(contextRequired, forKey: .contextRequired)
        try container.encodeIfPresent(outputFormat, forKey: .outputFormat)
        try container.encodeIfPresent(validationRules, forKey: .validationRules)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

struct ValidationRule: Codable {
    let type: ValidationRuleType
    let value: Any?
    let message: String?
    
    enum ValidationRuleType: String, Codable {
        case required
        case minLength
        case maxLength
        case regex
        case json
        case number
    }
    
    enum CodingKeys: String, CodingKey {
        case type, value, message
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(ValidationRuleType.self, forKey: .type)
        message = try container.decodeIfPresent(String.self, forKey: .message)
        
        if let valueJSON = try? container.decode(AnyDecodable.self, forKey: .value) {
            value = valueJSON.value
        } else {
            value = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(message, forKey: .message)
        
        if let value = value {
            try container.encode(AnyEncodable(value), forKey: .value)
        }
    }
}

struct WorkflowExecution: Codable, Identifiable {
    let id: String
    let workflowId: String
    let userId: String
    let status: String
    let currentStep: Int
    let stepResults: [StepExecutionResult]?
    let error: String?
    let startedAt: Date
    let completedAt: Date?
    let metadata: [String: Any]?
    let workflow: Workflow?
    
    enum CodingKeys: String, CodingKey {
        case id, workflowId, userId, status, currentStep, stepResults, error, startedAt, completedAt, metadata, workflow
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        workflowId = try container.decode(String.self, forKey: .workflowId)
        userId = try container.decode(String.self, forKey: .userId)
        status = try container.decode(String.self, forKey: .status)
        currentStep = try container.decode(Int.self, forKey: .currentStep)
        stepResults = try container.decodeIfPresent([StepExecutionResult].self, forKey: .stepResults)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
        workflow = try container.decodeIfPresent(Workflow.self, forKey: .workflow)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(workflowId, forKey: .workflowId)
        try container.encode(userId, forKey: .userId)
        try container.encode(status, forKey: .status)
        try container.encode(currentStep, forKey: .currentStep)
        try container.encodeIfPresent(stepResults, forKey: .stepResults)
        try container.encodeIfPresent(error, forKey: .error)
        try container.encode(startedAt, forKey: .startedAt)
        try container.encodeIfPresent(completedAt, forKey: .completedAt)
        try container.encodeIfPresent(workflow, forKey: .workflow)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

struct StepExecutionResult: Codable {
    let stepOrder: Int
    let stepName: String
    let input: String
    let output: String
    let success: Bool
    let error: String?
    let startedAt: Date
    let completedAt: Date
    let duration: Int
    let tokens: Int?
    let metadata: [String: Any]?
    
    enum CodingKeys: String, CodingKey {
        case stepOrder, stepName, input, output, success, error, startedAt, completedAt, duration, tokens, metadata
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        stepOrder = try container.decode(Int.self, forKey: .stepOrder)
        stepName = try container.decode(String.self, forKey: .stepName)
        input = try container.decode(String.self, forKey: .input)
        output = try container.decode(String.self, forKey: .output)
        success = try container.decode(Bool.self, forKey: .success)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        completedAt = try container.decode(Date.self, forKey: .completedAt)
        duration = try container.decode(Int.self, forKey: .duration)
        tokens = try container.decodeIfPresent(Int.self, forKey: .tokens)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(stepOrder, forKey: .stepOrder)
        try container.encode(stepName, forKey: .stepName)
        try container.encode(input, forKey: .input)
        try container.encode(output, forKey: .output)
        try container.encode(success, forKey: .success)
        try container.encodeIfPresent(error, forKey: .error)
        try container.encode(startedAt, forKey: .startedAt)
        try container.encode(completedAt, forKey: .completedAt)
        try container.encode(duration, forKey: .duration)
        try container.encodeIfPresent(tokens, forKey: .tokens)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

// MARK: - Request Models

struct CreateWorkflowRequest: Codable {
    let name: String
    let description: String?
    let steps: [WorkflowStepRequest]
    let metadata: [String: Any]?
    
    init(name: String, description: String?, steps: [WorkflowStepRequest], metadata: [String: Any]? = nil) {
        self.name = name
        self.description = description
        self.steps = steps
        self.metadata = metadata
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        steps = try container.decode([WorkflowStepRequest].self, forKey: .steps)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    struct WorkflowStepRequest: Codable {
        let name: String
        let promptTemplate: String
        let contextRequired: [String]?
        let outputFormat: String?
        let validationRules: [ValidationRule]?
        let metadata: [String: Any]?
        
        enum CodingKeys: String, CodingKey {
            case name, promptTemplate, contextRequired, outputFormat, validationRules, metadata
        }
        
        init(name: String, promptTemplate: String, contextRequired: [String]? = nil, outputFormat: String? = nil, validationRules: [ValidationRule]? = nil, metadata: [String: Any]? = nil) {
            self.name = name
            self.promptTemplate = promptTemplate
            self.contextRequired = contextRequired
            self.outputFormat = outputFormat
            self.validationRules = validationRules
            self.metadata = metadata
        }
        
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            name = try container.decode(String.self, forKey: .name)
            promptTemplate = try container.decode(String.self, forKey: .promptTemplate)
            contextRequired = try container.decodeIfPresent([String].self, forKey: .contextRequired)
            outputFormat = try container.decodeIfPresent(String.self, forKey: .outputFormat)
            validationRules = try container.decodeIfPresent([ValidationRule].self, forKey: .validationRules)
            
            if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
                metadata = metadataJSON.mapValues { $0.value }
            } else {
                metadata = nil
            }
        }
        
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(name, forKey: .name)
            try container.encode(promptTemplate, forKey: .promptTemplate)
            try container.encodeIfPresent(contextRequired, forKey: .contextRequired)
            try container.encodeIfPresent(outputFormat, forKey: .outputFormat)
            try container.encodeIfPresent(validationRules, forKey: .validationRules)
            
            if let metadata = metadata {
                let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
                try container.encode(encodableMetadata, forKey: .metadata)
            }
        }
    }
    
    enum CodingKeys: String, CodingKey {
        case name, description, steps, metadata
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(steps, forKey: .steps)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

struct ExecuteWorkflowRequest: Codable {
    let initialContext: [String: Any]?
    let parallelSteps: Bool?
    let continueOnError: Bool?
    let maxRetries: Int?
    
    enum CodingKeys: String, CodingKey {
        case initialContext, parallelSteps, continueOnError, maxRetries
    }
    
    init(initialContext: [String: Any]? = nil, parallelSteps: Bool? = nil, continueOnError: Bool? = nil, maxRetries: Int? = nil) {
        self.initialContext = initialContext
        self.parallelSteps = parallelSteps
        self.continueOnError = continueOnError
        self.maxRetries = maxRetries
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        parallelSteps = try container.decodeIfPresent(Bool.self, forKey: .parallelSteps)
        continueOnError = try container.decodeIfPresent(Bool.self, forKey: .continueOnError)
        maxRetries = try container.decodeIfPresent(Int.self, forKey: .maxRetries)
        
        if let contextJSON = try? container.decode([String: AnyDecodable].self, forKey: .initialContext) {
            initialContext = contextJSON.mapValues { $0.value }
        } else {
            initialContext = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(parallelSteps, forKey: .parallelSteps)
        try container.encodeIfPresent(continueOnError, forKey: .continueOnError)
        try container.encodeIfPresent(maxRetries, forKey: .maxRetries)
        
        if let initialContext = initialContext {
            let encodableContext = initialContext.mapValues { AnyEncodable($0) }
            try container.encode(encodableContext, forKey: .initialContext)
        }
    }
}

// MARK: - Workflow Templates

struct WorkflowTemplate: Codable, Identifiable {
    let id: String
    let name: String
    let description: String
    let steps: [WorkflowTemplateStep]
    
    struct WorkflowTemplateStep: Codable {
        let name: String
        let promptTemplate: String
        let outputFormat: String?
    }
}