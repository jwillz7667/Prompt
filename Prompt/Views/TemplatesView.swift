//
//  TemplatesView.swift
//  Prompt
//
//  Displays and manages prompt templates
//  AAA WCAG Compliant Colors - Liquid Glass Design
//

import SwiftUI

struct TemplatesView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = TemplateViewModel.shared
    @State private var showCreateSheet = false
    @State private var selectedTemplate: Template?
    @State private var templateToDelete: Template?
    @State private var showDeleteConfirmation = false

    let onSelect: ((Template) -> Void)?

    init(onSelect: ((Template) -> Void)? = nil) {
        self.onSelect = onSelect
    }

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        NavigationStack {
            ZStack {
                // Liquid glass background
                LiquidGlassBackground()

                Group {
                    if viewModel.isLoading && viewModel.templates.isEmpty {
                        loadingView
                    } else if viewModel.templates.isEmpty {
                        emptyStateView
                    } else {
                        templatesScrollView
                    }
                }
            }
            .navigationTitle("Templates")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
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
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(accentColor)
                    }
                }
            }
            .searchable(text: $viewModel.searchQuery, prompt: "Search templates...")
            .task {
                await viewModel.fetchTemplates(refresh: true)
            }
            .refreshable {
                await viewModel.fetchTemplates(refresh: true)
            }
            .sheet(isPresented: $showCreateSheet) {
                CreateTemplateSheet()
            }
            .sheet(item: $selectedTemplate) { template in
                TemplateDetailView(template: template, onUse: { t in
                    selectedTemplate = nil
                    onSelect?(t)
                    dismiss()
                })
            }
            .alert("Delete Template", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let template = templateToDelete {
                        Task {
                            await viewModel.deleteTemplate(template)
                        }
                    }
                }
            } message: {
                Text("Are you sure you want to delete this template?")
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .tint(colorScheme == .light ? Color.brandPurple : accentColor)
                .scaleEffect(1.2)
            Text("Loading templates...")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "doc.text.fill")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(accentColor)
            }

            VStack(spacing: 8) {
                Text("No Templates")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text("Create templates to quickly start prompts")
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }

            Button {
                showCreateSheet = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Create Template")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(accentColor)
                .clipShape(Capsule())
            }
            .buttonStyle(BounceButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: - Templates Scroll View

    private var templatesScrollView: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Category filter chips
                if !viewModel.categories.isEmpty {
                    categoryChips
                }

                // Templates grid
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.filteredTemplates) { template in
                        TemplateCardView(template: template)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if onSelect != nil {
                                    Task {
                                        await viewModel.useTemplate(template)
                                    }
                                    onSelect?(template)
                                    dismiss()
                                } else {
                                    selectedTemplate = template
                                }
                            }
                            .contextMenu {
                                if !template.isBuiltIn {
                                    Button(role: .destructive) {
                                        templateToDelete = template
                                        showDeleteConfirmation = true
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }

                                Button {
                                    UIPasteboard.general.string = template.content
                                } label: {
                                    Label("Copy Content", systemImage: "doc.on.doc")
                                }
                            }
                    }

                    // Load more
                    if viewModel.hasMorePages {
                        HStack {
                            Spacer()
                            ProgressView()
                                .tint(textSecondary)
                            Spacer()
                        }
                        .padding(.vertical, 20)
                        .onAppear {
                            Task {
                                await viewModel.loadNextPage()
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Category Chips

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                CategoryChipView(
                    name: "All",
                    icon: "square.grid.2x2",
                    isSelected: viewModel.selectedCategory == nil,
                    action: {
                        withAnimation(.spring(response: 0.3)) {
                            viewModel.selectedCategory = nil
                        }
                    }
                )

                ForEach(viewModel.categories, id: \.self) { category in
                    CategoryChipView(
                        name: category,
                        icon: TemplateCategory(rawValue: category)?.icon ?? "folder",
                        isSelected: viewModel.selectedCategory == category,
                        action: {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.selectedCategory = category
                            }
                        }
                    )
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
    }
}

// MARK: - Template Card View

struct TemplateCardView: View {
    @Environment(\.colorScheme) private var colorScheme
    let template: Template

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header row
            HStack(spacing: 12) {
                // Icon
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 40, height: 40)

                    Image(systemName: template.icon ?? "doc.text")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(accentColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(template.name)
                        .font(.system(.headline, design: .rounded, weight: .semibold))
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)

                    Text(template.category)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textTertiary)
                }

                Spacer()

                if template.isBuiltIn {
                    Text("Built-in")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            LinearGradient(
                                colors: [Color.brandPurple, Color.brandCyan],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .clipShape(Capsule())
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(textTertiary)
            }

            // Description
            if let description = template.description {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .lineLimit(2)
            }

            // Content preview
            Text(template.content)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(textTertiary)
                .lineLimit(2)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(colorScheme == .dark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                )

            // Footer
            HStack {
                if template.usageCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .medium))
                        Text("\(template.usageCount) uses")
                            .font(.system(.caption2, design: .rounded, weight: .medium))
                    }
                    .foregroundStyle(textTertiary)
                }

                Spacer()

                Text(template.createdAt, format: .dateTime.month().day())
                    .font(.system(.caption2, design: .rounded, weight: .medium))
                    .foregroundStyle(textTertiary)
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16)
    }
}

// MARK: - Category Chip View

struct CategoryChipView: View {
    @Environment(\.colorScheme) private var colorScheme
    let name: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(name)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                if isSelected {
                    Capsule()
                        .fill(accentColor)
                } else {
                    Capsule()
                        .fill(.ultraThinMaterial)
                        .overlay {
                            Capsule()
                                .stroke(colorScheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.05), lineWidth: 1)
                        }
                }
            }
            .foregroundStyle(isSelected ? .white : textSecondary)
        }
        .buttonStyle(BounceButtonStyle())
    }
}

// MARK: - Template Detail View

struct TemplateDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let template: Template
    let onUse: (Template) -> Void
    @State private var showCopiedToast = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        NavigationStack {
            ZStack {
                // Liquid glass background
                LiquidGlassBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        // Header card
                        VStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(accentColor.opacity(0.15))
                                    .frame(width: 60, height: 60)

                                Image(systemName: template.icon ?? "doc.text")
                                    .font(.system(size: 28, weight: .medium))
                                    .foregroundStyle(accentColor)
                            }

                            VStack(spacing: 6) {
                                Text(template.name)
                                    .font(.system(.title2, design: .rounded, weight: .bold))
                                    .foregroundStyle(textPrimary)
                                    .multilineTextAlignment(.center)

                                HStack(spacing: 8) {
                                    Text(template.category)
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                        .foregroundStyle(textSecondary)

                                    if template.isBuiltIn {
                                        Text("•")
                                            .foregroundStyle(textTertiary)
                                        Text("Built-in")
                                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                                            .foregroundStyle(accentColor)
                                    }
                                }
                            }

                            if let description = template.description {
                                Text(description)
                                    .font(.subheadline)
                                    .foregroundStyle(textSecondary)
                                    .multilineTextAlignment(.center)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(24)
                        .liquidGlass(cornerRadius: 20, borderGlow: true)

                        // Content section
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Label("Template Content", systemImage: "doc.text.fill")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textPrimary)

                                Spacer()

                                Button {
                                    UIPasteboard.general.string = template.content
                                    showCopiedToast = true
                                    Task {
                                        try? await Task.sleep(for: .seconds(2))
                                        showCopiedToast = false
                                    }
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "doc.on.doc")
                                            .font(.system(size: 12, weight: .medium))
                                        Text("Copy")
                                            .font(.system(.caption, design: .rounded, weight: .semibold))
                                    }
                                    .foregroundStyle(accentColor)
                                }
                                .buttonStyle(BounceButtonStyle())
                            }

                            Text(template.content)
                                .font(.system(.body, design: .monospaced))
                                .foregroundStyle(textPrimary)
                                .textSelection(.enabled)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(.ultraThinMaterial)
                                        .overlay {
                                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                                .stroke(accentColor.opacity(0.2), lineWidth: 1)
                                        }
                                }
                        }

                        // Use button
                        Button {
                            onUse(template)
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 16, weight: .semibold))
                                Text("Use This Template")
                                    .font(.system(.body, design: .rounded, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .foregroundStyle(.white)
                            .background(accentColor)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .shadow(color: accentColor.opacity(0.4), radius: 12, y: 6)
                        }
                        .buttonStyle(ElasticButtonStyle())

                        // Stats
                        if template.usageCount > 0 {
                            HStack {
                                Spacer()
                                HStack(spacing: 4) {
                                    Image(systemName: "arrow.clockwise")
                                        .font(.system(size: 12, weight: .medium))
                                    Text("Used \(template.usageCount) times")
                                        .font(.system(.caption, design: .rounded, weight: .medium))
                                }
                                .foregroundStyle(textTertiary)
                                Spacer()
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                }
            }
            .overlay(alignment: .bottom) {
                if showCopiedToast {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Copied!")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(textPrimary)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.15), radius: 10, y: 5)
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3), value: showCopiedToast)
        }
    }
}

// MARK: - Create Template Sheet

struct CreateTemplateSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = TemplateViewModel.shared
    @State private var name = ""
    @State private var content = ""
    @State private var description = ""
    @State private var category = "General"
    @State private var isCreating = false
    @FocusState private var focusedField: Field?

    enum Field {
        case name, content, description
    }

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !content.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Liquid glass background
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 24) {
                        // Name field
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Template Name", systemImage: "textformat")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                .foregroundStyle(textPrimary)

                            TextField("Enter template name", text: $name)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .padding(16)
                                .background {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(.ultraThinMaterial)
                                }
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(focusedField == .name ? accentColor.opacity(0.5) : Color.clear, lineWidth: 2)
                                }
                                .focused($focusedField, equals: .name)
                        }

                        // Category picker
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Category", systemImage: "folder")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                .foregroundStyle(textPrimary)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(TemplateCategory.allCases) { cat in
                                        CategoryChipView(
                                            name: cat.rawValue,
                                            icon: cat.icon,
                                            isSelected: category == cat.rawValue,
                                            action: {
                                                withAnimation(.spring(response: 0.3)) {
                                                    category = cat.rawValue
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        }

                        // Content field
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Label("Template Content", systemImage: "doc.text")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textPrimary)

                                Spacer()

                                if !content.isEmpty {
                                    Text("\(content.count) chars")
                                        .font(.system(.caption, design: .rounded, weight: .medium))
                                        .foregroundStyle(textTertiary)
                                }
                            }

                            TextEditor(text: $content)
                                .font(.system(.body, design: .monospaced))
                                .foregroundStyle(textPrimary)
                                .frame(minHeight: 150, maxHeight: 250)
                                .scrollContentBackground(.hidden)
                                .padding(12)
                                .background {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(.ultraThinMaterial)
                                }
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(focusedField == .content ? accentColor.opacity(0.5) : Color.clear, lineWidth: 2)
                                }
                                .focused($focusedField, equals: .content)

                            Text("This text will be used as the starting point for prompts")
                                .font(.caption)
                                .foregroundStyle(textTertiary)
                        }

                        // Description field
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Description (Optional)", systemImage: "text.alignleft")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                .foregroundStyle(textPrimary)

                            TextField("Add a description", text: $description, axis: .vertical)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .lineLimit(2...4)
                                .padding(16)
                                .background {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(.ultraThinMaterial)
                                }
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(focusedField == .description ? accentColor.opacity(0.5) : Color.clear, lineWidth: 2)
                                }
                                .focused($focusedField, equals: .description)
                        }

                        // Create button
                        Button {
                            Task {
                                isCreating = true
                                focusedField = nil
                                _ = await viewModel.createTemplate(
                                    name: name,
                                    content: content,
                                    description: description.isEmpty ? nil : description,
                                    category: category,
                                    icon: TemplateCategory(rawValue: category)?.icon
                                )
                                isCreating = false
                                dismiss()
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if isCreating {
                                    ProgressView()
                                        .tint(.white)
                                        .scaleEffect(0.9)
                                } else {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 16, weight: .semibold))
                                }
                                Text(isCreating ? "Creating..." : "Create Template")
                                    .font(.system(.body, design: .rounded, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .foregroundStyle(.white)
                            .background(canCreate ? accentColor : Color.gray.opacity(0.5))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .shadow(color: canCreate ? accentColor.opacity(0.4) : Color.clear, radius: 12, y: 6)
                        }
                        .buttonStyle(ElasticButtonStyle())
                        .disabled(!canCreate || isCreating)
                        .animation(.spring(response: 0.3), value: canCreate)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("New Template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(textPrimary)
                }
            }
        }
    }
}

// MARK: - Legacy Category Chip (for backwards compatibility)

struct CategoryChip: View {
    @Environment(\.colorScheme) private var colorScheme
    let name: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        CategoryChipView(
            name: name,
            icon: "folder",
            isSelected: isSelected,
            action: action
        )
    }
}

#Preview {
    TemplatesView()
}
