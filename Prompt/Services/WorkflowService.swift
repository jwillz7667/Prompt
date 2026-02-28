import Foundation
import Combine

/// Service for managing prompt enhancement workflows
@MainActor
final class WorkflowService: ObservableObject {
    static let shared = WorkflowService()

    @Published private(set) var workflows: [Workflow] = []
    @Published private(set) var templates: [WorkflowTemplate] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - CRUD

    /// Create a new workflow
    func createWorkflow(request: CreateWorkflowRequest) async throws -> Workflow {
        let workflow: Workflow = try await apiClient.request(
            "/workflows",
            method: .post,
            body: request
        )
        workflows.insert(workflow, at: 0)
        return workflow
    }

    /// List all workflows
    func listWorkflows(status: WorkflowStatus? = nil) async throws -> [Workflow] {
        var urlString = "/workflows"
        if let status = status {
            urlString += "?status=\(status.rawValue)"
        }

        let fetched: [Workflow] = try await apiClient.request(
            urlString,
            method: .get
        )
        self.workflows = fetched
        return fetched
    }

    /// Get a specific workflow
    func getWorkflow(id: String) async throws -> Workflow {
        let workflow: Workflow = try await apiClient.request(
            "/workflows/\(id)",
            method: .get
        )
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
        let workflow: Workflow = try await apiClient.request(
            "/workflows/\(id)",
            method: .put,
            body: request
        )
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
        let execution: WorkflowExecution = try await apiClient.request(
            "/workflows/\(id)/execute",
            method: .post,
            body: request
        )
        return execution
    }

    /// Get execution details
    func getExecution(executionId: String) async throws -> WorkflowExecution {
        let execution: WorkflowExecution = try await apiClient.request(
            "/workflows/executions/\(executionId)",
            method: .get
        )
        return execution
    }

    /// List executions for a workflow
    func listExecutions(workflowId: String) async throws -> [WorkflowExecution] {
        let executions: [WorkflowExecution] = try await apiClient.request(
            "/workflows/\(workflowId)/executions",
            method: .get
        )
        return executions
    }

    // MARK: - Clone, Export, Import

    /// Clone a workflow
    func cloneWorkflow(id: String) async throws -> Workflow {
        let workflow: Workflow = try await apiClient.request(
            "/workflows/\(id)/clone",
            method: .post
        )
        workflows.insert(workflow, at: 0)
        return workflow
    }

    /// Export workflow as JSON string
    func exportWorkflow(id: String) async throws -> String {
        struct ExportResponse: Codable {
            let workflow: Workflow
        }
        let response: ExportResponse = try await apiClient.request(
            "/workflows/\(id)/export",
            method: .get
        )
        let data = try JSONEncoder().encode(response.workflow)
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    /// Import workflow from JSON
    func importWorkflow(json: String) async throws -> Workflow {
        guard let data = json.data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw URLError(.badServerResponse)
        }

        struct ImportRequest: Codable {
            let workflow: CreateWorkflowRequest
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let workflowRequest = try decoder.decode(CreateWorkflowRequest.self, from: data)
        let request = ImportRequest(workflow: workflowRequest)

        let workflow: Workflow = try await apiClient.request(
            "/workflows/import",
            method: .post,
            body: request
        )
        workflows.insert(workflow, at: 0)
        return workflow
    }

    // MARK: - Templates

    /// Load predefined workflow templates
    func loadTemplates() async throws -> [WorkflowTemplate] {
        let response: [WorkflowTemplate] = try await apiClient.request(
            "/workflows/templates/available",
            method: .get
        )
        self.templates = response
        return response
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
