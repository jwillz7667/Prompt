import SwiftUI
import UIKit

struct ContextsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var service = ContextService.shared

    @State private var searchText = ""
    @State private var semanticSearchMode = false
    @State private var selectedTag: String?
    @State private var showCreateSheet = false
    @State private var selectedContext: ProjectContext?
    @State private var showMergeSheet = false
    @State private var mergeSelection: Set<String> = []
    @State private var showDeleteConfirmation = false
    @State private var contextToDelete: ProjectContext?
    @State private var searchResults: [SimilarContext] = []

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    private var allTags: [String] {
        let tags = service.contexts.flatMap { $0.tags }
        return Array(Set(tags)).sorted()
    }

    private var filteredContexts: [ProjectContext] {
        var results = service.contexts

        if let tag = selectedTag {
            results = results.filter { $0.tags.contains(tag) }
        }

        if !searchText.isEmpty && !semanticSearchMode {
            results = results.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                ($0.description?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }

        return results
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                Group {
                    if service.isLoading && service.contexts.isEmpty {
                        loadingView
                    } else if service.contexts.isEmpty {
                        emptyStateView
                    } else {
                        contextsList
                    }
                }
            }
            .navigationTitle("Contexts")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 8) {
                        if filteredContexts.count > 1 {
                            Button {
                                showMergeSheet = true
                            } label: {
                                Image(systemName: "arrow.triangle.merge")
                                    .foregroundStyle(accentColor)
                            }
                        }
                        Button {
                            showCreateSheet = true
                        } label: {
                            Image(systemName: "plus")
                                .foregroundStyle(accentColor)
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search contexts...")
            .onChange(of: searchText) { _, newValue in
                if semanticSearchMode && !newValue.isEmpty {
                    Task { await performSemanticSearch(query: newValue) }
                }
            }
            .task { await service.loadContextsIfNeeded() }
            .sheet(isPresented: $showCreateSheet) {
                CreateContextSheet(service: service)
            }
            .sheet(item: $selectedContext) { context in
                ContextDetailSheet(context: context, service: service)
            }
            .sheet(isPresented: $showMergeSheet) {
                MergeContextSheet(
                    contexts: filteredContexts,
                    service: service,
                    selection: $mergeSelection
                )
            }
            .alert("Delete Context", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    if let context = contextToDelete {
                        Task { try? await service.deleteContext(id: context.id) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This context will be permanently deleted.")
            }
        }
    }

    // MARK: - Content Views

    private var contextsList: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Search mode toggle
                HStack {
                    Toggle(isOn: $semanticSearchMode) {
                        Label("Semantic Search", systemImage: "brain")
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(textSecondary)
                    }
                    .toggleStyle(.switch)
                    .tint(accentColor)
                }
                .padding(.horizontal, 20)

                // Tag filters
                if !allTags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            tagChip(name: "All", isSelected: selectedTag == nil) {
                                triggerHaptic()
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    selectedTag = nil
                                }
                            }
                            ForEach(allTags, id: \.self) { tag in
                                tagChip(name: tag, isSelected: selectedTag == tag) {
                                    triggerHaptic()
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                        selectedTag = selectedTag == tag ? nil : tag
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }

                // Semantic search results
                if semanticSearchMode && !searchResults.isEmpty {
                    LazyVStack(spacing: 12) {
                        ForEach(searchResults, id: \.context.id) { result in
                            contextCard(result.context, similarity: result.similarity)
                        }
                    }
                    .padding(.horizontal, 20)
                } else {
                    // Normal list
                    LazyVStack(spacing: 12) {
                        ForEach(filteredContexts) { context in
                            contextCard(context)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 100)
        }
    }

    private func contextCard(_ context: ProjectContext, similarity: Double? = nil) -> some View {
        Button {
            triggerHaptic()
            selectedContext = context
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(accentColor)

                    Text(context.name)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)

                    Spacer()

                    if let similarity = similarity {
                        Text("\(Int(similarity * 100))%")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(accentColor)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(accentColor.opacity(0.15))
                            .overlay(Capsule().stroke(accentColor.opacity(0.3), lineWidth: 0.5))
                            .clipShape(Capsule())
                    }
                }

                if let description = context.description, !description.isEmpty {
                    Text(description)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(textSecondary)
                        .lineLimit(2)
                }

                HStack(spacing: 6) {
                    ForEach(context.tags.prefix(3), id: \.self) { tag in
                        Text(tag)
                            .font(.system(.caption2, design: .rounded, weight: .medium))
                            .foregroundStyle(textTertiary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .liquidGlass(cornerRadius: 8)
                    }

                    if context.tags.count > 3 {
                        Text("+\(context.tags.count - 3)")
                            .font(.system(.caption2, design: .rounded, weight: .medium))
                            .foregroundStyle(textTertiary)
                    }

                    Spacer()

                    Text("\(context.contextData.count) keys")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
            }
            .padding(16)
            .liquidGlass(cornerRadius: 16)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                selectedContext = context
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive) {
                contextToDelete = context
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func tagChip(name: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(name)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .liquidGlassChip(isSelected: isSelected, accentColor: accentColor)
        }
        .buttonStyle(.plain)
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(accentColor)
            Text("Loading contexts...")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "folder.badge.gearshape")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(accentColor.opacity(0.6))

            Text("No Contexts")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Create contexts to store reusable data for your prompts.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)

            Button {
                showCreateSheet = true
            } label: {
                Label("Create Context", systemImage: "plus")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .buttonStyle(GlassPrimaryButtonStyle())
        }
        .padding(40)
    }

    // MARK: - Semantic Search

    private func performSemanticSearch(query: String) async {
        do {
            searchResults = try await service.searchSimilarContexts(query: query)
        } catch {
            print("Semantic search failed: \(error)")
        }
    }
}

// MARK: - Create Context Sheet

private struct CreateContextSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let service: ContextService

    @State private var name = ""
    @State private var description = ""
    @State private var tags = ""
    @State private var isGlobal = false
    @State private var dataKeys: [String] = [""]
    @State private var dataValues: [String] = [""]
    @State private var isSaving = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 20) {
                        // Name
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Name")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                            TextField("Context name", text: $name)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .padding(14)
                                .liquidGlassInput(cornerRadius: 12)
                        }

                        // Description
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Description")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                            TextField("Optional description", text: $description)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .padding(14)
                                .liquidGlassInput(cornerRadius: 12)
                        }

                        // Tags
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Tags (comma separated)")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                            TextField("tag1, tag2, tag3", text: $tags)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .padding(14)
                                .liquidGlassInput(cornerRadius: 12)
                        }

                        // Global toggle
                        Toggle(isOn: $isGlobal) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Global Context")
                                    .font(.system(.body, design: .rounded, weight: .medium))
                                    .foregroundStyle(textPrimary)
                                Text("Available across all prompts")
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            }
                        }
                        .tint(accentColor)
                        .padding(14)
                        .liquidGlass(cornerRadius: 12)

                        // Key-Value Data
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("Context Data")
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textSecondary)
                                Spacer()
                                Button {
                                    dataKeys.append("")
                                    dataValues.append("")
                                } label: {
                                    Image(systemName: "plus.circle.fill")
                                        .foregroundStyle(accentColor)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Circle())
                                }
                            }

                            ForEach(0..<dataKeys.count, id: \.self) { index in
                                HStack(spacing: 8) {
                                    TextField("Key", text: $dataKeys[index])
                                        .font(.system(.subheadline, design: .monospaced))
                                        .padding(10)
                                        .liquidGlassInput(cornerRadius: 8)
                                        .frame(maxWidth: .infinity)

                                    TextField("Value", text: $dataValues[index])
                                        .font(.system(.subheadline, design: .monospaced))
                                        .padding(10)
                                        .liquidGlassInput(cornerRadius: 8)
                                        .frame(maxWidth: .infinity)

                                    if dataKeys.count > 1 {
                                        Button {
                                            dataKeys.remove(at: index)
                                            dataValues.remove(at: index)
                                        } label: {
                                            Image(systemName: "minus.circle.fill")
                                                .foregroundStyle(.red.opacity(0.7))
                                                .frame(width: 44, height: 44)
                                                .contentShape(Circle())
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("New Context")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(textSecondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView().tint(accentColor)
                        } else {
                            Text("Save")
                                .fontWeight(.semibold)
                                .foregroundStyle(name.isEmpty ? textSecondary : accentColor)
                        }
                    }
                    .disabled(name.isEmpty || isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        var contextData: [String: Any] = [:]
        for (index, key) in dataKeys.enumerated() where !key.isEmpty {
            contextData[key] = dataValues[index]
        }
        let tagList = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }

        do {
            _ = try await service.createContext(
                name: name,
                description: description.isEmpty ? nil : description,
                contextData: contextData,
                tags: tagList,
                isGlobal: isGlobal
            )
            dismiss()
        } catch {
            print("Failed to create context: \(error)")
        }
        isSaving = false
    }
}

// MARK: - Context Detail Sheet

private struct ContextDetailSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let context: ProjectContext
    let service: ContextService

    @State private var isEditing = false
    @State private var editName: String = ""
    @State private var editDescription: String = ""
    @State private var isSaving = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Header
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                                    .foregroundStyle(accentColor)
                                if isEditing {
                                    TextField("Name", text: $editName)
                                        .font(.system(.title3, design: .rounded, weight: .bold))
                                        .foregroundStyle(textPrimary)
                                } else {
                                    Text(context.name)
                                        .font(.system(.title3, design: .rounded, weight: .bold))
                                        .foregroundStyle(textPrimary)
                                }
                            }

                            if isEditing {
                                TextField("Description", text: $editDescription)
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            } else if let desc = context.description, !desc.isEmpty {
                                Text(desc)
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            }

                            // Tags
                            if !context.tags.isEmpty {
                                FlowLayout(spacing: 6) {
                                    ForEach(context.tags, id: \.self) { tag in
                                        Text(tag)
                                            .font(.system(.caption, design: .rounded, weight: .medium))
                                            .foregroundStyle(accentColor)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(accentColor.opacity(0.12))
                                            .overlay(Capsule().stroke(accentColor.opacity(0.3), lineWidth: 0.5))
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }
                        .padding(20)
                        .liquidGlass(cornerRadius: 20, borderGlow: true)

                        // Context Data
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Data")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)

                            ForEach(Array(context.contextData.keys.sorted()), id: \.self) { key in
                                HStack(alignment: .top) {
                                    Text(key)
                                        .font(.system(.caption, design: .monospaced, weight: .semibold))
                                        .foregroundStyle(accentColor)
                                        .frame(width: 100, alignment: .leading)

                                    Text(String(describing: context.contextData[key] ?? ""))
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundStyle(textPrimary)
                                        .textSelection(.enabled)
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .liquidGlass(cornerRadius: 8)
                            }

                            if context.contextData.isEmpty {
                                Text("No data entries")
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textTertiary)
                                    .frame(maxWidth: .infinity)
                                    .padding(20)
                            }
                        }

                        // Info
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Info")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)

                            infoRow(label: "Created", value: context.createdAt.formatted(date: .abbreviated, time: .shortened))
                            infoRow(label: "Updated", value: context.updatedAt.formatted(date: .abbreviated, time: .shortened))
                            infoRow(label: "Type", value: context.isGlobal ? "Global" : "Personal")
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Context Detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if isEditing {
                            Task { await saveEdits() }
                        } else {
                            editName = context.name
                            editDescription = context.description ?? ""
                            isEditing = true
                        }
                    } label: {
                        if isSaving {
                            ProgressView().tint(accentColor)
                        } else {
                            Text(isEditing ? "Save" : "Edit")
                                .foregroundStyle(accentColor)
                        }
                    }
                }
            }
            .onAppear {
                editName = context.name
                editDescription = context.description ?? ""
            }
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(textTertiary)
            Spacer()
            Text(value)
                .font(.system(.caption, design: .rounded, weight: .medium))
                .foregroundStyle(textSecondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .liquidGlass(cornerRadius: 8)
    }

    private func saveEdits() async {
        isSaving = true
        do {
            _ = try await service.updateContext(
                id: context.id,
                name: editName.isEmpty ? nil : editName,
                description: editDescription.isEmpty ? nil : editDescription
            )
            isEditing = false
        } catch {
            print("Failed to update context: \(error)")
        }
        isSaving = false
    }
}

// MARK: - Merge Context Sheet

private struct MergeContextSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let contexts: [ProjectContext]
    let service: ContextService
    @Binding var selection: Set<String>

    @State private var newName = ""
    @State private var isMerging = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 20) {
                        TextField("Merged context name", text: $newName)
                            .font(.body)
                            .foregroundStyle(textPrimary)
                            .padding(14)
                            .liquidGlassInput(cornerRadius: 12)

                        Text("Select contexts to merge:")
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        ForEach(contexts) { context in
                            Button {
                                triggerHaptic()
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    if selection.contains(context.id) {
                                        selection.remove(context.id)
                                    } else {
                                        selection.insert(context.id)
                                    }
                                }
                            } label: {
                                HStack {
                                    Image(systemName: selection.contains(context.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selection.contains(context.id) ? accentColor : textTertiary)
                                    Text(context.name)
                                        .foregroundStyle(textPrimary)
                                    Spacer()
                                    Text("\(context.contextData.count) keys")
                                        .font(.caption)
                                        .foregroundStyle(textSecondary)
                                }
                                .padding(14)
                                .liquidGlass(cornerRadius: 12)
                            }
                            .buttonStyle(.plain)
                        }

                        Button {
                            Task { await merge() }
                        } label: {
                            if isMerging {
                                ProgressView().tint(.white)
                            } else {
                                Label("Merge \(selection.count) Contexts", systemImage: "arrow.triangle.merge")
                            }
                        }
                        .buttonStyle(GlassPrimaryButtonStyle())
                        .disabled(selection.count < 2 || newName.isEmpty || isMerging)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Merge Contexts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(textSecondary)
                }
            }
        }
    }

    private var textTertiary: Color { Color.adaptiveTextTertiary }

    private func merge() async {
        isMerging = true
        do {
            _ = try await service.mergeContexts(contextIds: Array(selection), newName: newName)
            dismiss()
        } catch {
            print("Failed to merge: \(error)")
        }
        isMerging = false
    }
}

// MARK: - Flow Layout Helper

private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalSize: CGSize = .zero

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            positions.append(CGPoint(x: currentX, y: currentY))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            totalSize.width = max(totalSize.width, currentX - spacing)
            totalSize.height = max(totalSize.height, currentY + lineHeight)
        }

        return (totalSize, positions)
    }
}
