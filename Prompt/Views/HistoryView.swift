//
//  HistoryView.swift
//  Prompt
//
//  Displays prompt history with search, filtering, and management
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct HistoryView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedPrompt: PromptRecord?
    @State private var showDeleteConfirmation = false
    @State private var promptToDelete: PromptRecord?

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        NavigationStack {
            Group {
                if historyManager.isLoading && historyManager.prompts.isEmpty {
                    loadingView
                } else if historyManager.prompts.isEmpty {
                    emptyStateView
                } else {
                    promptsList
                }
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("History")
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
                    Menu {
                        Toggle("Favorites Only", isOn: Bindable(historyManager).showFavoritesOnly)
                    } label: {
                        Image(systemName: historyManager.showFavoritesOnly ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                            .foregroundStyle(textPrimary)
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search prompts...")
            .onChange(of: searchText) { _, newValue in
                historyManager.searchQuery = newValue
                Task {
                    await historyManager.fetchPrompts(refresh: true)
                }
            }
            .onChange(of: historyManager.showFavoritesOnly) { _, _ in
                Task {
                    await historyManager.fetchPrompts(refresh: true)
                }
            }
            .task {
                await historyManager.fetchPrompts(refresh: true)
            }
            .sheet(item: $selectedPrompt) { prompt in
                PromptDetailView(prompt: prompt)
            }
            .alert("Delete Prompt", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let prompt = promptToDelete {
                        Task {
                            await historyManager.deletePrompt(prompt)
                        }
                    }
                }
            } message: {
                Text("Are you sure you want to delete this prompt? This action cannot be undone.")
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(textPrimary)
            Text("Loading history...")
                .font(.subheadline)
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgPrimary)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Prompts Yet", systemImage: "doc.text")
                .foregroundStyle(textPrimary)
        } description: {
            Text("Your enhanced prompts will appear here")
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgPrimary)
    }

    // MARK: - Prompts List

    private var promptsList: some View {
        List {
            ForEach(historyManager.prompts) { prompt in
                PromptRowView(prompt: prompt)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        selectedPrompt = prompt
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            promptToDelete = prompt
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            Task {
                                await historyManager.toggleFavorite(prompt)
                            }
                        } label: {
                            Label(
                                prompt.isFavorite ? "Unfavorite" : "Favorite",
                                systemImage: prompt.isFavorite ? "star.slash" : "star.fill"
                            )
                        }
                        .tint(.yellow)
                    }
                    .listRowBackground(bgSecondary)
            }

            // Load more
            if historyManager.hasMorePages {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(textPrimary)
                    Spacer()
                }
                .listRowSeparator(.hidden)
                .listRowBackground(bgSecondary)
                .onAppear {
                    Task {
                        await historyManager.loadNextPage()
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(bgPrimary)
        .refreshable {
            await historyManager.fetchPrompts(refresh: true)
        }
    }
}

// MARK: - Prompt Row View

struct PromptRowView: View {
    @Environment(\.colorScheme) private var colorScheme
    let prompt: PromptRecord

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(prompt.title ?? String(prompt.originalPrompt.prefix(50)) + "...")
                    .font(.headline)
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)

                Spacer()

                if prompt.isFavorite {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .font(.caption)
                }
            }

            Text(prompt.originalPrompt)
                .font(.subheadline)
                .foregroundStyle(textSecondary)
                .lineLimit(2)

            HStack {
                Label("\(prompt.totalTokens) tokens", systemImage: "number")
                    .font(.caption)
                    .foregroundStyle(textTertiary)

                Spacer()

                Text(prompt.createdAt, format: .dateTime.month().day().hour().minute())
                    .font(.caption)
                    .foregroundStyle(textTertiary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Prompt Detail View

struct PromptDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    let prompt: PromptRecord
    @Environment(\.dismiss) private var dismiss
    @State private var showCopiedToast = false
    @State private var showExportSheet = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Original prompt
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Original Prompt", systemImage: "text.cursor")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(textPrimary)

                        Text(prompt.originalPrompt)
                            .font(.body)
                            .foregroundStyle(textPrimary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    // Enhanced prompt
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Label("Enhanced Prompt", systemImage: "sparkles")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(textPrimary)

                            Spacer()

                            Button {
                                UIPasteboard.general.string = prompt.enhancedPrompt
                                showCopiedToast = true
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundStyle(textSecondary)
                            }
                        }

                        Text(prompt.enhancedPrompt)
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(textPrimary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .textSelection(.enabled)
                    }

                    // Action buttons
                    HStack(spacing: 12) {
                        Button {
                            ShareService.shared.presentShareSheet(items: [prompt.enhancedPrompt])
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(bgSecondary)
                                .foregroundStyle(textPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }

                        Button {
                            showExportSheet = true
                        } label: {
                            Label("Export", systemImage: "arrow.down.doc")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(bgSecondary)
                                .foregroundStyle(textPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }

                    // Metadata
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Details", systemImage: "info.circle")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(textPrimary)

                        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                            GridRow {
                                Text("Model")
                                    .foregroundStyle(textSecondary)
                                Text(prompt.model)
                                    .foregroundStyle(textPrimary)
                            }
                            GridRow {
                                Text("Tokens")
                                    .foregroundStyle(textSecondary)
                                Text("\(prompt.totalTokens)")
                                    .foregroundStyle(textPrimary)
                            }
                            GridRow {
                                Text("Created")
                                    .foregroundStyle(textSecondary)
                                Text(prompt.createdAt, format: .dateTime)
                                    .foregroundStyle(textPrimary)
                            }
                        }
                        .font(.subheadline)
                    }
                }
                .padding()
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Prompt Details")
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
            .sheet(isPresented: $showExportSheet) {
                ExportOptionsSheet(
                    originalPrompt: prompt.originalPrompt,
                    enhancedPrompt: prompt.enhancedPrompt
                ) { format in
                    if let url = ShareService.shared.sharePrompt(
                        original: prompt.originalPrompt,
                        enhanced: prompt.enhancedPrompt,
                        format: format
                    ) {
                        ShareService.shared.presentShareSheet(items: [url])
                    }
                }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
            .overlay(alignment: .bottom) {
                if showCopiedToast {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Copied!")
                            .foregroundStyle(textPrimary)
                    }
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.15), radius: 10, y: 5)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onAppear {
                        Task {
                            try? await Task.sleep(for: .seconds(2))
                            showCopiedToast = false
                        }
                    }
                }
            }
            .animation(.spring(), value: showCopiedToast)
        }
    }
}

#Preview {
    HistoryView()
        .environment(PromptHistoryManager.shared)
}
