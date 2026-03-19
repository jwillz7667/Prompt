import Foundation
import Combine

/// Service for managing prompt enhancement workflows
@MainActor
final class WorkflowService: ObservableObject {
    static let shared = WorkflowService()

    @Published private(set) var workflows: [Workflow] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?

    private let apiClient = APIClient.shared

    private init() {}

    private struct Envelope<T: Decodable>: Decodable {
        let success: Bool
        let data: T
    }

    // MARK: - CRUD

    /// Create a new workflow
    func createWorkflow(request: CreateWorkflowRequest) async throws -> Workflow {
        let response: Envelope<Workflow> = try await apiClient.request(
            "/workflows",
            method: .post,
            body: request,
            timeoutInterval: 60
        )
        workflows.insert(response.data, at: 0)
        return response.data
    }

    /// List all workflows
    func listWorkflows(status: WorkflowStatus? = nil) async throws -> [Workflow] {
        var urlString = "/workflows"
        if let status = status {
            urlString += "?status=\(status.rawValue)"
        }

        let response: Envelope<[Workflow]> = try await apiClient.request(
            urlString,
            method: .get
        )
        self.workflows = response.data
        return response.data
    }

    /// Get a specific workflow
    func getWorkflow(id: String) async throws -> Workflow {
        let response: Envelope<Workflow> = try await apiClient.request(
            "/workflows/\(id)",
            method: .get
        )
        let workflow = response.data
        if let index = workflows.firstIndex(where: { $0.id == id }) {
            workflows[index] = workflow
        }
        return workflow
    }

    /// Update a workflow
    func updateWorkflow(id: String, name: String? = nil, description: String? = nil, steps: [CreateWorkflowRequest.WorkflowStepRequest]? = nil) async throws -> Workflow {
        struct UpdateRequest: Codable {
            let name: String?
            let description: String?
            let steps: [CreateWorkflowRequest.WorkflowStepRequest]?
        }

        let request = UpdateRequest(name: name, description: description, steps: steps)
        let response: Envelope<Workflow> = try await apiClient.request(
            "/workflows/\(id)",
            method: .put,
            body: request
        )
        let workflow = response.data
        if let index = workflows.firstIndex(where: { $0.id == id }) {
            workflows[index] = workflow
        }
        return workflow
    }

    /// Delete a workflow
    func deleteWorkflow(id: String) async throws {
        try await apiClient.requestVoid(
            "/workflows/\(id)",
            method: .delete
        )
        workflows.removeAll { $0.id == id }
    }

    // MARK: - Execution

    /// Execute a workflow
    func executeWorkflow(id: String, request: ExecuteWorkflowRequest) async throws -> WorkflowExecution {
        let response: Envelope<WorkflowExecution> = try await apiClient.request(
            "/workflows/\(id)/execute",
            method: .post,
            body: request,
            timeoutInterval: 120
        )
        return response.data
    }

    /// Get execution details
    func getExecution(executionId: String) async throws -> WorkflowExecution {
        let response: Envelope<WorkflowExecution> = try await apiClient.request(
            "/workflows/executions/\(executionId)",
            method: .get
        )
        return response.data
    }

    /// List executions for a workflow
    func listExecutions(workflowId: String) async throws -> [WorkflowExecution] {
        let response: Envelope<[WorkflowExecution]> = try await apiClient.request(
            "/workflows/\(workflowId)/executions",
            method: .get
        )
        return response.data
    }

    // MARK: - Clone, Export, Import

    /// Clone a workflow
    func cloneWorkflow(id: String, newName: String) async throws -> Workflow {
        struct CloneRequest: Codable {
            let newName: String
        }

        let response: Envelope<Workflow> = try await apiClient.request(
            "/workflows/\(id)/clone",
            method: .post,
            body: CloneRequest(newName: newName)
        )
        workflows.insert(response.data, at: 0)
        return response.data
    }

    /// Export workflow as JSON string
    func exportWorkflow(id: String) async throws -> String {
        let response: Envelope<CreateWorkflowRequest> = try await apiClient.request(
            "/workflows/\(id)/export",
            method: .get
        )
        let data = try JSONEncoder().encode(response.data)
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    /// Import workflow from JSON
    func importWorkflow(json: String) async throws -> Workflow {
        guard let data = json.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) != nil else {
            throw URLError(.badServerResponse)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let workflowRequest = try decoder.decode(CreateWorkflowRequest.self, from: data)

        let response: Envelope<Workflow> = try await apiClient.request(
            "/workflows/import",
            method: .post,
            body: workflowRequest,
            timeoutInterval: 60
        )
        workflows.insert(response.data, at: 0)
        return response.data
    }

    // MARK: - Helpers

    func loadWorkflowsIfNeeded() async {
        guard workflows.isEmpty, !isLoading else { return }
        isLoading = true
        error = nil
        do {
            _ = try await listWorkflows()
        } catch {
            self.error = error
            print("Failed to load workflows: \(error)")
        }
        isLoading = false
    }

    func clearCache() {
        workflows.removeAll()
    }
}
