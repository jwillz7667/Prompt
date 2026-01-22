//
//  TemplatesView.swift
//  Prompt
//
//  Displays and manages prompt templates
//  AAA WCAG Compliant Colors
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

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.templates.isEmpty {
                    loadingView
                } else if viewModel.templates.isEmpty {
                    emptyStateView
                } else {
                    templatesList
                }
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Templates")
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
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(textPrimary)
                    }
                }
            }
            .searchable(text: $viewModel.searchQuery, prompt: "Search templates...")
            .task {
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
        VStack(spacing: 16) {
            ProgressView()
                .tint(textPrimary)
            Text("Loading templates...")
                .font(.subheadline)
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgPrimary)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Templates", systemImage: "doc.text")
                .foregroundStyle(textPrimary)
        } description: {
            Text("Create templates to quickly start prompts")
                .foregroundStyle(textSecondary)
        } actions: {
            Button("Create Template") {
                showCreateSheet = true
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgPrimary)
    }

    // MARK: - Templates List

    private var templatesList: some View {
        List {
            // Category filter chips
            if !viewModel.categories.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        CategoryChip(
                            name: "All",
                            isSelected: viewModel.selectedCategory == nil,
                            action: {
                                viewModel.selectedCategory = nil
                            }
                        )

                        ForEach(viewModel.categories, id: \.self) { category in
                            CategoryChip(
                                name: category,
                                isSelected: viewModel.selectedCategory == category,
                                action: {
                                    viewModel.selectedCategory = category
                                }
                            )
                        }
                    }
                    .padding(.horizontal, 4)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
            }

            ForEach(viewModel.filteredTemplates) { template in
                TemplateRowView(template: template)
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
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if !template.isBuiltIn {
                            Button(role: .destructive) {
                                templateToDelete = template
                                showDeleteConfirmation = true
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                    .listRowBackground(bgPrimary)
            }

            // Load more
            if viewModel.hasMorePages {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(textPrimary)
                    Spacer()
                }
                .listRowSeparator(.hidden)
                .listRowBackground(bgPrimary)
                .onAppear {
                    Task {
                        await viewModel.loadNextPage()
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(bgPrimary)
        .refreshable {
            await viewModel.fetchTemplates(refresh: true)
        }
    }
}

// MARK: - Template Row View

struct TemplateRowView: View {
    @Environment(\.colorScheme) private var colorScheme
    let template: Template

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: template.icon ?? "doc.text")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(textSecondary)

                Text(template.name)
                    .font(.headline)
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)

                Spacer()

                if template.isBuiltIn {
                    Text("Built-in")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.blue)
                        .clipShape(Capsule())
                }
            }

            if let description = template.description {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .lineLimit(2)
            }

            HStack {
                Label(template.category, systemImage: "folder")
                    .font(.caption)
                    .foregroundStyle(textTertiary)

                Spacer()

                if template.usageCount > 0 {
                    Label("\(template.usageCount) uses", systemImage: "arrow.clockwise")
                        .font(.caption)
                        .foregroundStyle(textTertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Category Chip

struct CategoryChip: View {
    @Environment(\.colorScheme) private var colorScheme
    let name: String
    let isSelected: Bool
    let action: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        Button(action: action) {
            Text(name)
                .font(.system(.caption, weight: .semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? buttonPrimary : bgTertiary)
                .foregroundStyle(isSelected ? (colorScheme == .dark ? .black : .white) : textSecondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Template Detail View

struct TemplateDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let template: Template
    let onUse: (Template) -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    HStack(spacing: 12) {
                        Image(systemName: template.icon ?? "doc.text")
                            .font(.system(size: 24, weight: .medium))
                            .foregroundStyle(textSecondary)
                            .frame(width: 44, height: 44)
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        VStack(alignment: .leading, spacing: 4) {
                            Text(template.name)
                                .font(.title3)
                                .fontWeight(.semibold)
                                .foregroundStyle(textPrimary)

                            Text(template.category)
                                .font(.subheadline)
                                .foregroundStyle(textSecondary)
                        }

                        Spacer()
                    }

                    if let description = template.description {
                        Text(description)
                            .font(.body)
                            .foregroundStyle(textSecondary)
                    }

                    // Content preview
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Template Content")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(textPrimary)

                        Text(template.content)
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(textPrimary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .textSelection(.enabled)
                    }

                    // Use button
                    Button {
                        onUse(template)
                    } label: {
                        Text("Use This Template")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(buttonPrimary)
                            .foregroundStyle(colorScheme == .dark ? .black : .white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
                .padding()
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Template")
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

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }
    private var borderColor: Color { Color.adaptiveBorder }

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !content.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Template Name", text: $name)
                        .foregroundStyle(textPrimary)

                    Picker("Category", selection: $category) {
                        ForEach(TemplateCategory.allCases) { cat in
                            Text(cat.rawValue).tag(cat.rawValue)
                        }
                    }
                } header: {
                    Text("Details")
                }

                Section {
                    TextEditor(text: $content)
                        .frame(minHeight: 150)
                        .foregroundStyle(textPrimary)
                } header: {
                    Text("Template Content")
                } footer: {
                    Text("This text will be used as the starting point for prompts")
                }

                Section {
                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                        .foregroundStyle(textPrimary)
                } header: {
                    Text("Description")
                }
            }
            .scrollContentBackground(.hidden)
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("New Template")
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
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                    .disabled(!canCreate || isCreating)
                }
            }
        }
    }
}

#Preview {
    TemplatesView()
}
