import Foundation
import SwiftData

// MARK: - Project Context Models

struct ProjectContext: Codable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let description: String?
    let contextData: [String: Any]
    let tags: [String]
    let isGlobal: Bool
    let createdAt: Date
    let updatedAt: Date
    var usages: [ContextUsage]?
    
    enum CodingKeys: String, CodingKey {
        case id, userId, name, description, contextData, tags, isGlobal, createdAt, updatedAt, usages
    }
    
    // Custom encoding/decoding for contextData
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        tags = try container.decode([String].self, forKey: .tags)
        isGlobal = try container.decode(Bool.self, forKey: .isGlobal)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        usages = try container.decodeIfPresent([ContextUsage].self, forKey: .usages)
        
        // Decode contextData as generic JSON
        if let contextDataJSON = try? container.decode([String: AnyDecodable].self, forKey: .contextData) {
            contextData = contextDataJSON.mapValues { $0.value }
        } else {
            contextData = [:]
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(tags, forKey: .tags)
        try container.encode(isGlobal, forKey: .isGlobal)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(usages, forKey: .usages)
        
        // Encode contextData as AnyEncodable
        let encodableContext = contextData.mapValues { AnyEncodable($0) }
        try container.encode(encodableContext, forKey: .contextData)
    }
}

struct ContextUsage: Codable, Identifiable {
    let id: String
    let contextId: String
    let promptId: String
    let usedAt: Date
    let metadata: [String: Any]?
    
    enum CodingKeys: String, CodingKey {
        case id, contextId, promptId, usedAt, metadata
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        contextId = try container.decode(String.self, forKey: .contextId)
        promptId = try container.decode(String.self, forKey: .promptId)
        usedAt = try container.decode(Date.self, forKey: .usedAt)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(contextId, forKey: .contextId)
        try container.encode(promptId, forKey: .promptId)
        try container.encode(usedAt, forKey: .usedAt)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

struct SimilarContext: Codable {
    let context: ProjectContext
    let similarity: Double
}

// MARK: - Request/Response Models

struct CreateContextRequest: Codable {
    let name: String
    let description: String?
    let contextData: [String: Any]
    let tags: [String]?
    let isGlobal: Bool?
    
    enum CodingKeys: String, CodingKey {
        case name, description, contextData, tags, isGlobal
    }
    
    init(name: String, description: String?, contextData: [String: Any], tags: [String]? = nil, isGlobal: Bool? = nil) {
        self.name = name
        self.description = description
        self.contextData = contextData
        self.tags = tags
        self.isGlobal = isGlobal
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        tags = try container.decodeIfPresent([String].self, forKey: .tags)
        isGlobal = try container.decodeIfPresent(Bool.self, forKey: .isGlobal)
        
        if let contextDataJSON = try? container.decode([String: AnyDecodable].self, forKey: .contextData) {
            contextData = contextDataJSON.mapValues { $0.value }
        } else {
            contextData = [:]
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(tags, forKey: .tags)
        try container.encodeIfPresent(isGlobal, forKey: .isGlobal)
        
        let encodableContext = contextData.mapValues { AnyEncodable($0) }
        try container.encode(encodableContext, forKey: .contextData)
    }
}

struct UpdateContextRequest: Codable {
    let name: String?
    let description: String?
    let contextData: [String: Any]?
    let tags: [String]?
    let isGlobal: Bool?
    
    enum CodingKeys: String, CodingKey {
        case name, description, contextData, tags, isGlobal
    }
    
    init(name: String? = nil, description: String? = nil, contextData: [String: Any]? = nil, tags: [String]? = nil, isGlobal: Bool? = nil) {
        self.name = name
        self.description = description
        self.contextData = contextData
        self.tags = tags
        self.isGlobal = isGlobal
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        tags = try container.decodeIfPresent([String].self, forKey: .tags)
        isGlobal = try container.decodeIfPresent(Bool.self, forKey: .isGlobal)
        
        if let contextDataJSON = try? container.decode([String: AnyDecodable].self, forKey: .contextData) {
            contextData = contextDataJSON.mapValues { $0.value }
        } else {
            contextData = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(tags, forKey: .tags)
        try container.encodeIfPresent(isGlobal, forKey: .isGlobal)
        
        if let contextData = contextData {
            let encodableContext = contextData.mapValues { AnyEncodable($0) }
            try container.encode(encodableContext, forKey: .contextData)
        }
    }
}

struct SearchContextRequest: Codable {
    let query: String
    let limit: Int?
    let minSimilarity: Double?
    let tags: [String]?
    let includeGlobal: Bool?
}

struct MergeContextsRequest: Codable {
    let contextIds: [String]
    let newName: String
}

// MARK: - Helper Types for Any Encoding/Decoding

struct AnyDecodable: Decodable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyDecodable].self) {
            value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyDecodable].self) {
            value = dictionary.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }
}

struct AnyEncodable: Encodable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        if let bool = value as? Bool {
            try container.encode(bool)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let string = value as? String {
            try container.encode(string)
        } else if let array = value as? [Any] {
            try container.encode(array.map { AnyEncodable($0) })
        } else if let dictionary = value as? [String: Any] {
            try container.encode(dictionary.mapValues { AnyEncodable($0) })
        } else {
            try container.encodeNil()
        }
    }
}