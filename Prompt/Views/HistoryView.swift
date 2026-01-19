//
//  HistoryView.swift
//  Prompt
//
//  Displays prompt history with search, filtering, and management
//

import SwiftUI

struct HistoryView: View {
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedPrompt: PromptRecord?
    @State private var showDeleteConfirmation = false
    @State private var promptToDelete: PromptRecord?

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
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Toggle("Favorites Only", isOn: Bindable(historyManager).showFavoritesOnly)
                    } label: {
                        Image(systemName: historyManager.showFavoritesOnly ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
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
            Text("Loading history...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Prompts Yet", systemImage: "doc.text")
        } description: {
            Text("Your enhanced prompts will appear here")
        }
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
            }

            // Load more
            if historyManager.hasMorePages {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
                .onAppear {
                    Task {
                        await historyManager.loadNextPage()
                    }
                }
            }
        }
        .listStyle(.plain)
        .refreshable {
            await historyManager.fetchPrompts(refresh: true)
        }
    }
}

// MARK: - Prompt Row View

struct PromptRowView: View {
    let prompt: PromptRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(prompt.title ?? prompt.originalPrompt.prefix(50) + "...")
                    .font(.headline)
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
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack {
                Label("\(prompt.totalTokens) tokens", systemImage: "number")
                    .font(.caption)
                    .foregroundStyle(.tertiary)

                Spacer()

                Text(prompt.createdAt, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Prompt Detail View

struct PromptDetailView: View {
    let prompt: PromptRecord
    @Environment(\.dismiss) private var dismiss
    @State private var showCopiedToast = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Original prompt
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Original Prompt", systemImage: "text.cursor")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text(prompt.originalPrompt)
                            .font(.body)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(uiColor: .systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    // Enhanced prompt
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Label("Enhanced Prompt", systemImage: "sparkles")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            Spacer()

                            Button {
                                UIPasteboard.general.string = prompt.enhancedPrompt
                                showCopiedToast = true
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc")
                                    .font(.caption)
                            }
                        }

                        Text(prompt.enhancedPrompt)
                            .font(.system(.body, design: .monospaced))
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(uiColor: .systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .textSelection(.enabled)
                    }

                    // Metadata
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Details", systemImage: "info.circle")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                            GridRow {
                                Text("Model")
                                    .foregroundStyle(.secondary)
                                Text(prompt.model)
                            }
                            GridRow {
                                Text("Tokens")
                                    .foregroundStyle(.secondary)
                                Text("\(prompt.totalTokens)")
                            }
                            GridRow {
                                Text("Created")
                                    .foregroundStyle(.secondary)
                                Text(prompt.createdAt, format: .dateTime)
                            }
                        }
                        .font(.subheadline)
                    }
                }
                .padding()
            }
            .navigationTitle("Prompt Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if showCopiedToast {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Copied!")
                    }
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
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
