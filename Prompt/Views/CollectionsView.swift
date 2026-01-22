//
//  CollectionsView.swift
//  Prompt
//
//  Displays and manages prompt collections/folders
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct CollectionsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = CollectionViewModel.shared
    @State private var showCreateSheet = false
    @State private var selectedCollection: Collection?
    @State private var collectionToDelete: Collection?
    @State private var showDeleteConfirmation = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.collections.isEmpty {
                    loadingView
                } else if viewModel.collections.isEmpty {
                    emptyStateView
                } else {
                    collectionsGrid
                }
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Collections")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "folder.badge.plus")
                            .foregroundStyle(textPrimary)
                    }
                }
            }
            .task {
                await viewModel.fetchCollections()
            }
            .sheet(isPresented: $showCreateSheet) {
                CreateCollectionSheet()
            }
            .sheet(item: $selectedCollection) { collection in
                CollectionDetailView(collection: collection)
            }
            .alert("Delete Collection", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let collection = collectionToDelete {
                        Task {
                            await viewModel.deleteCollection(collection)
                        }
                    }
                }
            } message: {
                Text("Are you sure you want to delete this collection? Prompts will not be deleted.")
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(textPrimary)
            Text("Loading collections...")
                .font(.subheadline)
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgPrimary)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Collections", systemImage: "folder")
                .foregroundStyle(textPrimary)
        } description: {
            Text("Create collections to organize your prompts")
                .foregroundStyle(textSecondary)
        } actions: {
            Button("Create Collection") {
                showCreateSheet = true
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgPrimary)
    }

    // MARK: - Collections Grid

    private var collectionsGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 16)], spacing: 16) {
                ForEach(viewModel.collections) { collection in
                    CollectionCard(collection: collection)
                        .onTapGesture {
                            selectedCollection = collection
                        }
                        .contextMenu {
                            Button {
                                selectedCollection = collection
                            } label: {
                                Label("Open", systemImage: "folder")
                            }

                            Button(role: .destructive) {
                                collectionToDelete = collection
                                showDeleteConfirmation = true
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
            .padding()
        }
        .background(bgPrimary)
        .refreshable {
            await viewModel.fetchCollections()
        }
    }
}

// MARK: - Collection Card

struct CollectionCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let collection: Collection

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                ZStack {
                    Circle()
                        .fill(Color(hex: collection.color).opacity(0.2))
                        .frame(width: 44, height: 44)

                    Image(systemName: collection.icon)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(Color(hex: collection.color))
                }

                Spacer()

                Text("\(collection.promptCount)")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(hex: collection.color).opacity(0.1))
                    .clipShape(Capsule())
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(collection.name)
                    .font(.headline)
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)

                if let description = collection.description {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(textSecondary)
                        .lineLimit(2)
                }
            }
        }
        .padding()
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.08), radius: 8, y: 2)
    }
}

// MARK: - Collection Detail View

struct CollectionDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = CollectionViewModel.shared
    let collection: Collection
    @State private var prompts: [PromptRecord] = []
    @State private var isLoading = true

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack {
                        ProgressView()
                        Text("Loading...")
                            .font(.caption)
                            .foregroundStyle(textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if prompts.isEmpty {
                    ContentUnavailableView {
                        Label("Empty Collection", systemImage: "folder")
                            .foregroundStyle(textPrimary)
                    } description: {
                        Text("Add prompts to this collection from history")
                            .foregroundStyle(textSecondary)
                    }
                } else {
                    List(prompts) { prompt in
                        PromptRowView(prompt: prompt)
                            .listRowBackground(bgPrimary)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle(collection.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                }
            }
            .task {
                await loadCollectionPrompts()
            }
        }
    }

    private func loadCollectionPrompts() async {
        isLoading = true
        if let result = await viewModel.getCollectionWithPrompts(id: collection.id) {
            prompts = result
        }
        isLoading = false
    }
}

// MARK: - Create Collection Sheet

struct CreateCollectionSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = CollectionViewModel.shared
    @State private var name = ""
    @State private var description = ""
    @State private var selectedColor = "#007AFF"
    @State private var selectedIcon = "folder.fill"
    @State private var isCreating = false

    private let colors = ["#007AFF", "#34C759", "#FF9500", "#FF3B30", "#AF52DE", "#5856D6", "#FF2D55", "#00C7BE"]
    private let icons = ["folder.fill", "star.fill", "bookmark.fill", "heart.fill", "tag.fill", "flag.fill", "bolt.fill", "lightbulb.fill"]

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Collection Name", text: $name)
                        .foregroundStyle(textPrimary)

                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                        .foregroundStyle(textPrimary)
                } header: {
                    Text("Details")
                }

                Section {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))], spacing: 12) {
                        ForEach(colors, id: \.self) { color in
                            Circle()
                                .fill(Color(hex: color))
                                .frame(width: 44, height: 44)
                                .overlay {
                                    if selectedColor == color {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 16, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                                .onTapGesture {
                                    selectedColor = color
                                }
                        }
                    }
                } header: {
                    Text("Color")
                }

                Section {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))], spacing: 12) {
                        ForEach(icons, id: \.self) { icon in
                            ZStack {
                                Circle()
                                    .fill(selectedIcon == icon ? Color(hex: selectedColor) : Color.gray.opacity(0.2))
                                    .frame(width: 44, height: 44)

                                Image(systemName: icon)
                                    .font(.system(size: 18))
                                    .foregroundStyle(selectedIcon == icon ? .white : textSecondary)
                            }
                            .onTapGesture {
                                selectedIcon = icon
                            }
                        }
                    }
                } header: {
                    Text("Icon")
                }
            }
            .scrollContentBackground(.hidden)
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("New Collection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(textPrimary)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            isCreating = true
                            _ = await viewModel.createCollection(
                                name: name,
                                description: description.isEmpty ? nil : description,
                                color: selectedColor,
                                icon: selectedIcon
                            )
                            isCreating = false
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                    .disabled(!canCreate || isCreating)
                }
            }
        }
    }
}

// MARK: - Collection Model

struct Collection: Identifiable, Codable, Sendable {
    let id: String
    let name: String
    let description: String?
    let color: String
    let icon: String
    let promptCount: Int
    let createdAt: Date

    init(from dto: CollectionDTO) {
        self.id = dto.id
        self.name = dto.name
        self.description = dto.description
        self.color = dto.color
        self.icon = dto.icon
        self.promptCount = dto.promptCount
        self.createdAt = ISO8601DateFormatter().date(from: dto.createdAt) ?? Date()
    }
}

struct CollectionDTO: Codable, Sendable {
    let id: String
    let name: String
    let description: String?
    let color: String
    let icon: String
    let promptCount: Int
    let createdAt: String
}

struct CollectionsListResponse: Decodable, Sendable {
    let collections: [CollectionDTO]
}

struct CollectionResponse: Decodable, Sendable {
    let collection: CollectionDTO
}

struct CollectionWithPromptsResponse: Decodable, Sendable {
    let collection: CollectionDTO
    let prompts: [PromptDTO]
}

struct CreateCollectionRequest: Encodable, Sendable {
    let name: String
    let description: String?
    let color: String
    let icon: String
}

// MARK: - Collection ViewModel

@Observable
@MainActor
final class CollectionViewModel {
    var collections: [Collection] = []
    var isLoading = false
    var error: String?

    static let shared = CollectionViewModel()
    private init() {}

    func fetchCollections() async {
        guard await APIClient.shared.isAuthenticated else { return }

        isLoading = collections.isEmpty
        error = nil

        do {
            let response: CollectionsListResponse = try await APIClient.shared.request("/collections")
            collections = response.collections.map { Collection(from: $0) }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func createCollection(
        name: String,
        description: String?,
        color: String,
        icon: String
    ) async -> Collection? {
        guard await APIClient.shared.isAuthenticated else { return nil }

        do {
            let request = CreateCollectionRequest(
                name: name,
                description: description,
                color: color,
                icon: icon
            )

            let response: CollectionResponse = try await APIClient.shared.request(
                "/collections",
                method: .post,
                body: request
            )

            let collection = Collection(from: response.collection)
            collections.insert(collection, at: 0)
            return collection
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func deleteCollection(_ collection: Collection) async {
        guard let index = collections.firstIndex(where: { $0.id == collection.id }) else { return }

        let removed = collections.remove(at: index)

        do {
            try await APIClient.shared.requestVoid("/collections/\(collection.id)", method: .delete)
        } catch {
            collections.insert(removed, at: index)
            self.error = error.localizedDescription
        }
    }

    func getCollectionWithPrompts(id: String) async -> [PromptRecord]? {
        guard await APIClient.shared.isAuthenticated else { return nil }

        do {
            let response: CollectionWithPromptsResponse = try await APIClient.shared.request("/collections/\(id)")
            return response.prompts.map { PromptRecord(from: $0) }
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }
}

// MARK: - Color Hex Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

#Preview {
    CollectionsView()
}
