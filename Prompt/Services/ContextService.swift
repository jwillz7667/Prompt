import Foundation
import Combine

/// Service for managing project contexts with embedding support
@MainActor
final class ContextService: ObservableObject {
    static let shared = ContextService()
    
    @Published private(set) var contexts: [ProjectContext] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?
    
    private let apiClient = APIClient.shared
    
    private init() {}
    
    // MARK: - Context Management
    
    /// Create a new context
    func createContext(
        name: String,
        description: String?,
        contextData: [String: Any],
        tags: [String] = [],
        isGlobal: Bool = false
    ) async throws -> ProjectContext {
        let request = CreateContextRequest(
            name: name,
            description: description,
            contextData: contextData,
            tags: tags.isEmpty ? nil : tags,
            isGlobal: isGlobal
        )
        
        let context: ProjectContext = try await apiClient.request(
            "/contexts",
            method: .post,
            body: request
        )
        
        // Update local cache
        contexts.append(context)
        
        return context
    }
    
    /// Update an existing context
    func updateContext(
        id: String,
        name: String? = nil,
        description: String? = nil,
        contextData: [String: Any]? = nil,
        tags: [String]? = nil,
        isGlobal: Bool? = nil
    ) async throws -> ProjectContext {
        let request = UpdateContextRequest(
            name: name,
            description: description,
            contextData: contextData,
            tags: tags,
            isGlobal: isGlobal
        )
        
        let context: ProjectContext = try await apiClient.request(
            "/contexts/\(id)",
            method: .put,
            body: request
        )
        
        // Update local cache
        if let index = contexts.firstIndex(where: { $0.id == id }) {
            contexts[index] = context
        }
        
        return context
    }
    
    /// Delete a context
    func deleteContext(id: String) async throws {
        try await apiClient.requestVoid(
            "/contexts/\(id)",
            method: .delete
        )
        
        // Update local cache
        contexts.removeAll { $0.id == id }
    }
    
    /// Get a specific context
    func getContext(id: String) async throws -> ProjectContext {
        let context: ProjectContext = try await apiClient.request(
            "/contexts/\(id)",
            method: .get
        )
        
        return context
    }
    
    /// List all contexts
    func listContexts(includeGlobal: Bool = true) async throws -> [ProjectContext] {
        let queryItems = includeGlobal ? [] : [URLQueryItem(name: "includeGlobal", value: "false")]
        
        // Build URL with query parameters
        var urlString = "/contexts"
        if !includeGlobal {
            urlString += "?includeGlobal=false"
        }
        
        let fetchedContexts: [ProjectContext] = try await apiClient.request(
            urlString,
            method: .get
        )
        
        // Update local cache
        self.contexts = fetchedContexts
        
        return fetchedContexts
    }
    
    // MARK: - Semantic Search
    
    /// Search for similar contexts using semantic search
    func searchSimilarContexts(
        query: String,
        limit: Int = 10,
        minSimilarity: Double = 0.7,
        tags: [String]? = nil,
        includeGlobal: Bool = true
    ) async throws -> [SimilarContext] {
        let request = SearchContextRequest(
            query: query,
            limit: limit,
            minSimilarity: minSimilarity,
            tags: tags,
            includeGlobal: includeGlobal
        )
        
        let results: [SimilarContext] = try await apiClient.request(
            "/contexts/search",
            method: .post,
            body: request
        )
        
        return results
    }
    
    // MARK: - Context Usage
    
    /// Attach a context to a prompt
    func attachContextToPrompt(contextId: String, promptId: String) async throws {
        struct AttachRequest: Codable {
            let promptId: String
        }
        
        let request = AttachRequest(promptId: promptId)
        
        try await apiClient.requestVoid(
            "/contexts/\(contextId)/attach",
            method: .post,
            body: request
        )
    }
    
    /// Get contexts used with a specific prompt
    func getPromptContexts(promptId: String) async throws -> [ProjectContext] {
        let contexts: [ProjectContext] = try await apiClient.request(
            "/contexts/prompt/\(promptId)",
            method: .get
        )
        
        return contexts
    }
    
    /// Merge multiple contexts into a new one
    func mergeContexts(contextIds: [String], newName: String) async throws -> ProjectContext {
        let request = MergeContextsRequest(
            contextIds: contextIds,
            newName: newName
        )
        
        let context: ProjectContext = try await apiClient.request(
            "/contexts/merge",
            method: .post,
            body: request
        )
        
        // Add to local cache
        contexts.append(context)
        
        return context
    }
    
    // MARK: - Helper Methods
    
    /// Load contexts if not already loaded
    func loadContextsIfNeeded() async {
        guard contexts.isEmpty, !isLoading else { return }
        
        isLoading = true
        error = nil
        
        do {
            _ = try await listContexts()
        } catch {
            self.error = error
            print("Failed to load contexts: \(error)")
        }
        
        isLoading = false
    }
    
    /// Clear all cached contexts
    func clearCache() {
        contexts.removeAll()
    }
    
    /// Find context by ID in local cache
    func findContext(by id: String) -> ProjectContext? {
        return contexts.first { $0.id == id }
    }
    
    /// Filter contexts by tags
    func filterContexts(by tags: [String]) -> [ProjectContext] {
        guard !tags.isEmpty else { return contexts }
        
        return contexts.filter { context in
            !Set(context.tags).intersection(Set(tags)).isEmpty
        }
    }
}

// MARK: - Empty Response for DELETE operations
private struct EmptyResponse: Codable {}