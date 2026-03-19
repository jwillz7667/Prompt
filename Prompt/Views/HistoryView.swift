//
//  HistoryView.swift
//  Prompt
//
//  Displays prompt history with search, filtering, and management
//  AAA WCAG Compliant Colors
//

import SwiftUI
import UIKit

struct HistoryView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AppStoreComplianceManager.self) private var complianceManager
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedPrompt: PromptRecord?
    @State private var showDeleteConfirmation = false
    @State private var promptToDelete: PromptRecord?
    @State private var selectedTab: HistoryTab = .all

    /// Callback to re-run a prompt from history
    var onRerunPrompt: ((String) -> Void)?

    enum HistoryTab: String, CaseIterable {
        case all = "All"
        case starred = "★"
    }

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                // Consistent liquid glass background
                LiquidGlassBackground()

                VStack(spacing: 0) {
                    // Tab picker
                    Picker("Filter", selection: $selectedTab) {
                        ForEach(HistoryTab.allCases, id: \.self) { tab in
                            Text(tab.rawValue)
                                .tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 12)

                    Group {
                        if historyManager.isLoading && historyManager.prompts.isEmpty {
                            loadingView
                        } else if historyManager.prompts.isEmpty {
                            emptyStateView
                        } else {
                            promptsList
                        }
                    }
                }
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(accentColor)
                }
            }
            .searchable(text: $searchText, prompt: "Search prompts...")
            .onChange(of: searchText) { _, newValue in
                historyManager.searchQuery = newValue
                Task {
                    await historyManager.fetchPrompts(refresh: true)
                }
            }
            .onChange(of: selectedTab) { _, newTab in
                historyManager.showFavoritesOnly = (newTab == .starred)
                Task {
                    await historyManager.fetchPrompts(refresh: true)
                }
            }
            .task {
                // Sync tab state with manager state
                selectedTab = historyManager.showFavoritesOnly ? .starred : .all
                await historyManager.fetchPrompts(refresh: true)
            }
            .sheet(item: $selectedPrompt) { prompt in
                PromptDetailView(prompt: prompt) {
                    // Re-run this prompt
                    selectedPrompt = nil
                    dismiss()
                    onRerunPrompt?(prompt.originalPrompt)
                }
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
        VStack(spacing: 20) {
            ProgressView()
                .tint(accentColor)
                .scaleEffect(1.2)
            Text("Loading history...")
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

                Image(systemName: selectedTab == .starred ? "star.fill" : "doc.text.fill")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(accentColor)
            }

            VStack(spacing: 8) {
                Text(selectedTab == .starred ? "No Starred Prompts" : "No Prompts Yet")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text(selectedTab == .starred
                     ? "Tap the star on any prompt to add it here"
                     : "Your enhanced prompts will appear here")
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                                prompt.isFavorite ? "Unstar" : "Star",
                                systemImage: prompt.isFavorite ? "star.slash" : "star.fill"
                            )
                        }
                        .tint(accentColor)
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
    @Environment(PromptHistoryManager.self) private var historyManager
    let prompt: PromptRecord

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }

    var body: some View {
        HStack(spacing: 12) {
            // Star button
            Button {
                Task {
                    await historyManager.toggleFavorite(prompt)
                }
            } label: {
                Image(systemName: prompt.isFavorite ? "star.fill" : "star")
                    .font(.system(size: 20))
                    .foregroundStyle(prompt.isFavorite ? (colorScheme == .dark ? Color.brandCyan : Color.brandPurple) : textTertiary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 8) {
                Text(prompt.title ?? String(prompt.originalPrompt.prefix(50)) + "...")
                    .font(.headline)
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)

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
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Prompt Detail View

struct PromptDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AppStoreComplianceManager.self) private var complianceManager
    let prompt: PromptRecord
    var onRerun: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var showCopiedToast = false
    @State private var showExportSheet = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                // Liquid glass background
                LiquidGlassBackground()

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
                                    .foregroundStyle(Color.adaptiveTextOnAccent)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                            }
                            .buttonStyle(GlassCapsuleButtonStyle(tintColor: accentColor))
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

                    // AI Service buttons (glass style)
                    HStack(spacing: 8) {
                        // Try in Claude
                        Button {
                            openInClaude(prompt: prompt.enhancedPrompt)
                        } label: {
                            Label("Claude", systemImage: "bubble.left.and.text.bubble.right")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        }
                        .buttonStyle(LiquidGlassButtonStyle(
                            cornerRadius: 10,
                            tintColor: Color(red: 0.85, green: 0.47, blue: 0.34),
                            intensity: .standard
                        ))

                        if complianceManager.allowsChatGPTFeatures {
                            Button {
                                openInChatGPT(prompt: prompt.enhancedPrompt)
                            } label: {
                                Label("ChatGPT", systemImage: "bubble.left.and.bubble.right")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                            }
                            .buttonStyle(LiquidGlassButtonStyle(
                                cornerRadius: 10,
                                tintColor: Color(red: 0.0, green: 0.65, blue: 0.65),
                                intensity: .standard
                            ))
                        }
                    }

                    // Re-enhance button (primary action)
                    if onRerun != nil {
                        Button {
                            onRerun?()
                        } label: {
                            Label("Enhance Again", systemImage: "arrow.clockwise.circle.fill")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                        }
                        .buttonStyle(LiquidGlassButtonStyle(
                            cornerRadius: 10,
                            tintColor: accentColor,
                            intensity: .standard
                        ))
                    }

                    // Action buttons (glass style)
                    HStack(spacing: 12) {
                        Button {
                            ShareService.shared.presentShareSheet(items: [prompt.enhancedPrompt])
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .foregroundStyle(textPrimary)
                        }
                        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

                        Button {
                            showExportSheet = true
                        } label: {
                            Label("Export", systemImage: "arrow.down.doc")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .foregroundStyle(textPrimary)
                        }
                        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
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
            }
            .navigationTitle("Prompt Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(accentColor)
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
                            .foregroundStyle(colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4))
                        Text("Copied!")
                            .foregroundStyle(textPrimary)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                    .background {
                        ZStack {
                            Capsule()
                                .fill(colorScheme == .dark
                                    ? Color(red: 38/255, green: 38/255, blue: 40/255)
                                    : Color.white)

                            Capsule()
                                .fill(.ultraThinMaterial)

                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: colorScheme == .dark
                                            ? [Color.white.opacity(0.1), Color.clear]
                                            : [Color.white.opacity(0.8), Color.clear],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .opacity(0.5)
                        }
                    }
                    .clipShape(Capsule())
                    .overlay {
                        Capsule()
                            .stroke(
                                LinearGradient(
                                    colors: colorScheme == .dark
                                        ? [accentColor.opacity(0.4), accentColor.opacity(0.1)]
                                        : [Color.white.opacity(0.8), Color.brandPurple.opacity(0.2)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    }
                    .shadow(color: accentColor.opacity(0.2), radius: 10, y: 0)
                    .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.5 : 0.15), radius: 12, y: 5)
                    .padding(.bottom, 20)
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

    // MARK: - AI Service Links

    private func openInClaude(prompt: String) {
        guard !prompt.isEmpty,
              let encodedPrompt = prompt.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://claude.ai/new?q=\(encodedPrompt)") else {
            return
        }
        UIApplication.shared.open(url)
    }

    private func openInChatGPT(prompt: String) {
        guard complianceManager.allowsChatGPTFeatures,
              !prompt.isEmpty,
              let encodedPrompt = prompt.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://chatgpt.com/?q=\(encodedPrompt)") else {
            return
        }
        UIApplication.shared.open(url)
    }
}

#Preview {
    HistoryView()
        .environment(PromptHistoryManager.shared)
}
