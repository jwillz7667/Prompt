//
//  TemplateViewModel.swift
//  Prompt
//
//  Manages template data and operations
//

import Foundation
import SwiftUI

@Observable
@MainActor
final class TemplateViewModel {
    // MARK: - State

    var templates: [Template] = []
    var categories: [String] = []
    var selectedCategory: String? = nil
    var searchQuery: String = ""
    var isLoading = false
    var error: String?

    // Pagination
    var currentPage = 1
    var totalPages = 1
    var hasMorePages: Bool { currentPage < totalPages }

    // MARK: - Singleton

    static let shared = TemplateViewModel()
    private init() {}

    // MARK: - Computed Properties

    var filteredTemplates: [Template] {
        var result = templates

        if let category = selectedCategory {
            result = result.filter { $0.category == category }
        }

        if !searchQuery.isEmpty {
            let query = searchQuery.lowercased()
            result = result.filter {
                $0.name.lowercased().contains(query) ||
                $0.content.lowercased().contains(query) ||
                ($0.description?.lowercased().contains(query) ?? false)
            }
        }

        return result
    }

    var groupedTemplates: [(category: String, templates: [Template])] {
        let grouped = Dictionary(grouping: filteredTemplates) { $0.category }
        return grouped.map { (category: $0.key, templates: $0.value) }
            .sorted { $0.category < $1.category }
    }

    // MARK: - Fetch Templates

    func fetchTemplates(refresh: Bool = false) async {
        guard await APIClient.shared.isAuthenticated else { return }

        if refresh {
            currentPage = 1
        }

        isLoading = templates.isEmpty
        error = nil

        do {
            var endpoint = "/templates?page=\(currentPage)&limit=50"

            if let category = selectedCategory {
                endpoint += "&category=\(category.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
            }

            let response: TemplatesListResponse = try await APIClient.shared.request(endpoint)

            if refresh || currentPage == 1 {
                templates = response.templates.map { Template(from: $0) }
            } else {
                let newTemplates = response.templates.map { Template(from: $0) }
                templates.append(contentsOf: newTemplates)
            }

            categories = response.categories
            totalPages = response.pagination.totalPages
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadNextPage() async {
        guard hasMorePages && !isLoading else { return }
        currentPage += 1
        await fetchTemplates()
    }

    // MARK: - Create Template

    func createTemplate(
        name: String,
        content: String,
        description: String?,
        category: String,
        icon: String?
    ) async -> Template? {
        guard await APIClient.shared.isAuthenticated else { return nil }

        do {
            let request = CreateTemplateRequest(
                name: name,
                content: content,
                description: description,
                category: category,
                icon: icon
            )

            let response: TemplateResponse = try await APIClient.shared.request(
                "/templates",
                method: .post,
                body: request
            )

            let template = Template(from: response.template)
            templates.insert(template, at: 0)
            return template
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    // MARK: - Update Template

    func updateTemplate(
        id: String,
        name: String?,
        content: String?,
        description: String?,
        category: String?,
        icon: String?
    ) async -> Bool {
        guard await APIClient.shared.isAuthenticated else { return false }

        do {
            var body: [String: Any] = [:]
            if let name = name { body["name"] = name }
            if let content = content { body["content"] = content }
            if let description = description { body["description"] = description }
            if let category = category { body["category"] = category }
            if let icon = icon { body["icon"] = icon }

            let response: TemplateResponse = try await APIClient.shared.request(
                "/templates/\(id)",
                method: .patch,
                body: body as? Encodable
            )

            // Update local state
            if let index = templates.firstIndex(where: { $0.id == id }) {
                templates[index] = Template(from: response.template)
            }

            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Delete Template

    func deleteTemplate(_ template: Template) async {
        guard !template.isBuiltIn else {
            error = "Cannot delete built-in templates"
            return
        }

        guard let index = templates.firstIndex(where: { $0.id == template.id }) else { return }

        let removed = templates.remove(at: index)

        do {
            try await APIClient.shared.requestVoid("/templates/\(template.id)", method: .delete)
        } catch {
            // Revert on failure
            templates.insert(removed, at: index)
            self.error = error.localizedDescription
        }
    }

    // MARK: - Use Template

    func useTemplate(_ template: Template) async {
        do {
            try await APIClient.shared.requestVoid("/templates/\(template.id)/use", method: .post)

            // Server-side usage count is updated; local model is immutable
            // Future: Could refresh template to show updated count
        } catch {
            // Non-critical error, just log it
            print("Failed to record template usage: \(error)")
        }
    }

    // MARK: - Clear Data

    func clearLocalData() {
        templates = []
        categories = []
        currentPage = 1
        totalPages = 1
    }
}
