import Foundation
import Combine

/// Service for managing multi-platform sandbox testing
@MainActor
final class SandboxService: ObservableObject {
    static let shared = SandboxService()
    
    @Published private(set) var tests: [SandboxTest] = []
    @Published private(set) var availablePlatforms: [AvailablePlatform] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?
    @Published private(set) var currentTest: SandboxTest?
    
    private let apiClient = APIClient.shared

    private struct Envelope<T: Decodable>: Decodable {
        let success: Bool
        let data: T
    }
    
    private init() {
        Task {
            await loadAvailablePlatforms()
        }
    }
    
    // MARK: - Test Management
    
    /// Create a new sandbox test
    func createTest(
        testPrompt: String,
        platforms: [PlatformType],
        promptId: String? = nil,
        parameters: TestParameters? = nil,
        scheduledFor: Date? = nil
    ) async throws -> SandboxTest {
        let request = CreateSandboxTestRequest(
            promptId: promptId,
            testPrompt: testPrompt,
            platforms: platforms,
            parameters: parameters,
            scheduledFor: scheduledFor
        )
        
        let response: Envelope<SandboxTest> = try await apiClient.request(
            "/sandbox",
            method: .post,
            body: request,
            timeoutInterval: 60
        )
        let test = response.data
        
        // Add to local cache
        tests.insert(test, at: 0)
        currentTest = test
        
        // Poll for results if test is running
        if test.status == "pending" || test.status == "processing" {
            await pollTestResults(testId: test.id)
        }
        
        return test
    }
    
    /// Execute a scheduled test
    func executeTest(testId: String) async throws -> SandboxTest {
        let response: Envelope<SandboxTest> = try await apiClient.request(
            "/sandbox/\(testId)/execute",
            method: .post,
            timeoutInterval: 120
        )
        let test = response.data
        
        // Update local cache
        if let index = tests.firstIndex(where: { $0.id == testId }) {
            tests[index] = test
        }
        currentTest = test
        
        // Poll for results
        if test.status == "processing" {
            await pollTestResults(testId: test.id)
        }
        
        return test
    }
    
    /// Get a specific test with results
    func getTest(id: String) async throws -> SandboxTest {
        let response: Envelope<SandboxTest> = try await apiClient.request(
            "/sandbox/\(id)",
            method: .get
        )
        let test = response.data
        
        // Update local cache
        if let index = tests.firstIndex(where: { $0.id == id }) {
            tests[index] = test
        }
        currentTest = test
        
        return test
    }
    
    /// List all tests
    func listTests(limit: Int = 50) async throws -> [SandboxTest] {
        let response: Envelope<[SandboxTest]> = try await apiClient.request(
            "/sandbox?limit=\(limit)",
            method: .get
        )
        let fetchedTests = response.data
        
        self.tests = fetchedTests
        
        return fetchedTests
    }
    
    /// Delete a test
    func deleteTest(id: String) async throws {
        try await apiClient.requestVoid(
            "/sandbox/\(id)",
            method: .delete
        )
        
        // Update local cache
        tests.removeAll { $0.id == id }
        if currentTest?.id == id {
            currentTest = nil
        }
    }
    
    // MARK: - Comparison & Analytics
    
    /// Get comparison statistics for a test
    func compareTestResults(testId: String) async throws -> TestComparison {
        let response: Envelope<TestComparison> = try await apiClient.request(
            "/sandbox/\(testId)/compare",
            method: .get,
            timeoutInterval: 60
        )
        return response.data
    }
    
    // MARK: - Batch Testing
    
    /// Create multiple tests for different prompts
    func createBatchTests(
        prompts: [String],
        platforms: [PlatformType],
        parameters: TestParameters? = nil
    ) async throws -> [SandboxTest] {
        let request = BatchTestRequest(
            prompts: prompts,
            platforms: platforms,
            parameters: parameters
        )
        
        let response: Envelope<[SandboxTest]> = try await apiClient.request(
            "/sandbox/batch",
            method: .post,
            body: request,
            timeoutInterval: 90
        )
        let createdTests = response.data
        
        // Add to local cache
        tests.insert(contentsOf: createdTests, at: 0)
        
        return createdTests
    }
    
    // MARK: - Platform Management
    
    /// Get available platforms for testing
    func loadAvailablePlatforms() async {
        do {
            let response: Envelope<[AvailablePlatform]> = try await apiClient.request(
                "/sandbox/platforms/available",
                method: .get,
                timeoutInterval: 60
            )

            self.availablePlatforms = response.data
        } catch {
            print("Failed to load available platforms: \(error)")
        }
    }
    
    // MARK: - Helper Methods
    
    /// Poll for test results until completion
    private func pollTestResults(testId: String) async {
        var retryCount = 0
        let maxRetries = 30 // 30 seconds max
        
        while retryCount < maxRetries {
            do {
                let test = try await getTest(id: testId)
                
                if test.status == "completed" || test.status == "failed" {
                    break
                }
                
                // Wait 1 second before next poll
                try await Task.sleep(nanoseconds: 1_000_000_000)
                retryCount += 1
            } catch {
                print("Failed to poll test results: \(error)")
                break
            }
        }
    }
    
    /// Load tests if not already loaded
    func loadTestsIfNeeded() async {
        guard tests.isEmpty, !isLoading else { return }
        
        isLoading = true
        error = nil
        
        do {
            _ = try await listTests()
        } catch {
            self.error = error
            print("Failed to load tests: \(error)")
        }
        
        isLoading = false
    }
    
    /// Clear all cached tests
    func clearCache() {
        tests.removeAll()
        currentTest = nil
    }
    
    /// Find test by ID in local cache
    func findTest(by id: String) -> SandboxTest? {
        return tests.first { $0.id == id }
    }
    
    /// Get tests by status
    func filterTests(by status: String) -> [SandboxTest] {
        return tests.filter { $0.status == status }
    }
    
    /// Get tests for a specific platform
    func filterTests(by platform: PlatformType) -> [SandboxTest] {
        return tests.filter { $0.platforms.contains(platform) }
    }
    
    /// Calculate average latency across all completed tests
    func calculateAverageLatency() -> Double {
        let completedTests = tests.filter { $0.status == "completed" }
        guard !completedTests.isEmpty else { return 0 }
        
        var totalLatency = 0
        var count = 0
        
        for test in completedTests {
            if let results = test.results {
                for result in results {
                    if let latency = result.latencyMs {
                        totalLatency += latency
                        count += 1
                    }
                }
            }
        }
        
        return count > 0 ? Double(totalLatency) / Double(count) : 0
    }
    
    /// Get platform success rate
    func getPlatformSuccessRate(platform: PlatformType) -> Double {
        var successCount = 0
        var totalCount = 0
        
        for test in tests {
            if let results = test.results {
                for result in results where result.platform == platform {
                    totalCount += 1
                    if result.error == nil {
                        successCount += 1
                    }
                }
            }
        }
        
        return totalCount > 0 ? Double(successCount) / Double(totalCount) * 100 : 0
    }
}

// MARK: - Empty Response for DELETE operations
private struct EmptyResponse: Codable {}
