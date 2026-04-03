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
    @Environment(AuthManager.self) private var authManager
    @Environment(GuestSessionManager.self) private var guestSession
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedPrompt: PromptRecord?
    @State private var selectedThreadId: String?
    @State private var showDeleteConfirmation = false
    @State private var promptToDelete: PromptRecord?
    @State private var showDeleteThreadConfirmation = false
    @State private var threadToDelete: ThreadRecord?
    @State private var selectedTab: HistoryTab = .chats
    @State private var threadViewModel = ThreadViewModel()

    /// Callback to re-run a prompt from history
    var onRerunPrompt: ((PromptRecord) -> Void)?

    enum HistoryTab: String, CaseIterable {
        case chats = "Chats"
        case starred = "Starred"
    }

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }
    private var filteredThreads: [ThreadRecord] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return threadViewModel.threads }
        let query = trimmed.localizedLowercase
        return threadViewModel.threads.filter { thread in
            thread.title.localizedLowercase.contains(query) ||
            (thread.lastPreview?.localizedLowercase.contains(query) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                VStack(spacing: 0) {
                    PromptPageHeader(
                        title: "History",
                        subtitle: "Chats and starred prompts in one shared archive",
                        onLeadingTap: { dismiss() }
                    )
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

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
                        if selectedTab == .chats {
                            if !authManager.isAuthenticated {
                                signInRequiredState
                            } else if threadViewModel.isLoadingThreads && threadViewModel.threads.isEmpty {
                                loadingView
                            } else if filteredThreads.isEmpty {
                                emptyStateView
                            } else {
                                threadList
                            }
                        } else if historyManager.isLoading && historyManager.prompts.isEmpty {
                            loadingView
                        } else if historyManager.prompts.isEmpty {
                            emptyStateView
                        } else {
                            promptsList
                        }
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $selectedThreadId) { threadId in
                ThreadView(viewModel: threadViewModel, threadId: threadId)
            }
            .searchable(
                text: $searchText,
                prompt: selectedTab == .chats ? "Search chats..." : "Search starred..."
            )
            .onChange(of: searchText) { _, newValue in
                guard selectedTab != .chats else { return }
                historyManager.searchQuery = newValue
                Task {
                    await historyManager.fetchPrompts(refresh: true)
                }
            }
            .onChange(of: selectedTab) { _, newTab in
                Task {
                    switch newTab {
                    case .chats:
                        if authManager.isAuthenticated {
                            await threadViewModel.fetchThreads(refresh: true)
                        }
                    case .starred:
                        historyManager.showFavoritesOnly = true
                        await historyManager.fetchPrompts(refresh: true)
                    }
                }
            }
            .task {
                historyManager.showFavoritesOnly = true
                await historyManager.fetchPrompts(refresh: true)
                if authManager.isAuthenticated {
                    await threadViewModel.fetchThreads(refresh: true)
                }
            }
            .sheet(item: $selectedPrompt) { prompt in
                PromptDetailView(prompt: prompt) {
                    // Re-run this prompt
                    selectedPrompt = nil
                    dismiss()
                    onRerunPrompt?(prompt)
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
            .alert("Delete Chat", isPresented: $showDeleteThreadConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let thread = threadToDelete {
                        Task {
                            await threadViewModel.deleteThread(id: thread.id)
                        }
                    }
                }
            } message: {
                Text("Are you sure you want to delete this chat thread? This action cannot be undone.")
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

                Image(systemName: emptyStateIcon)
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(accentColor)
            }

            VStack(spacing: 8) {
                Text(emptyStateTitle)
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text(emptyStateSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var signInRequiredState: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.14))
                    .frame(width: 96, height: 96)

                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.system(size: 40, weight: .regular))
                    .foregroundStyle(accentColor)
            }

            VStack(spacing: 8) {
                Text("Sign in to sync chats")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text("Guest prompt history stays on this device. Sign in to save chat threads, sync them, and unlock the 7-day Premium trial offer.")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
            }

            Button {
                guestSession.presentAuthenticationGate()
                dismiss()
            } label: {
                Label("Sign In with Apple", systemImage: "apple.logo")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(LiquidGlassButtonStyle(cornerRadius: 16, tintColor: accentColor, intensity: .prominent))
            .padding(.horizontal, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateIcon: String {
        switch selectedTab {
        case .chats:
            return "bubble.left.and.bubble.right"
        case .starred:
            return "star.fill"
        }
    }

    private var emptyStateTitle: String {
        switch selectedTab {
        case .chats:
            return "No Chats Yet"
        case .starred:
            return "No Starred Prompts"
        }
    }

    private var emptyStateSubtitle: String {
        switch selectedTab {
        case .chats:
            return "Your optimization threads will appear here once you start chatting"
        case .starred:
            return "Tap the star on any prompt to keep it in this saved list"
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
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
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
                    .contextMenu {
                        Button {
                            UIPasteboard.general.string = prompt.enhancedPrompt
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }

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

                        Divider()

                        Button(role: .destructive) {
                            promptToDelete = prompt
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
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

    // MARK: - Thread List

    private var threadList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(filteredThreads) { thread in
                    threadRow(thread)
                        .onTapGesture {
                            selectedThreadId = thread.id
                        }
                }

                if threadViewModel.hasMorePages && searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ProgressView()
                        .tint(accentColor)
                        .padding()
                        .task {
                            threadViewModel.currentPage += 1
                            await threadViewModel.fetchThreads()
                        }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .refreshable {
            await threadViewModel.fetchThreads(refresh: true)
        }
    }

    private func threadRow(_ thread: ThreadRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: modalityIcon(thread.modality))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(modalityColor(thread.modality))
                    .frame(width: 28, height: 28)
                    .background {
                        Circle()
                            .fill(modalityColor(thread.modality).opacity(0.15))
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(thread.title)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        Text("\(thread.turnCount) turn\(thread.turnCount == 1 ? "" : "s")")
                            .font(.system(.caption2, design: .rounded, weight: .medium))
                            .foregroundStyle(textSecondary)

                        Text("·")
                            .foregroundStyle(textTertiary)

                        Text(thread.updatedAt, style: .relative)
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(textTertiary)
                    }
                }

                Spacer()

                Button {
                    threadToDelete = thread
                    showDeleteThreadConfirmation = true
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(textTertiary)
                        .padding(8)
                }
                .buttonStyle(.plain)
            }

            if let preview = thread.lastPreview, !preview.isEmpty {
                Text(preview)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(textSecondary)
                    .lineLimit(2)
                    .padding(.leading, 36)
            }
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: colorScheme == .dark
                                    ? [Color.white.opacity(0.1), Color.white.opacity(0.03)]
                                    : [Color.white.opacity(0.8), Color.adaptiveButtonPrimary.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
        }
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.06), radius: 8, y: 4)
    }

    private func modalityIcon(_ modality: String) -> String {
        switch modality {
        case "image": return "photo"
        case "video": return "video"
        case "audio": return "music.note"
        case "code": return "chevron.left.forwardslash.chevron.right"
        case "3d": return "cube"
        default: return "text.alignleft"
        }
    }

    private func modalityColor(_ modality: String) -> Color {
        switch modality {
        case "image": return .pink
        case "video": return .red
        case "audio": return .teal
        case "code": return .green
        case "3d": return .blue
        default: return .purple
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
    private var fallbackTitle: String {
        if let title = prompt.title, !title.isEmpty {
            return title
        }

        let trimmed = prompt.originalPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return String(trimmed.prefix(50)) + (trimmed.count > 50 ? "..." : "")
        }

        return prompt.imageAttachment == nil ? "Prompt" : "Image to Video Prompt"
    }

    private var fallbackSubtitle: String {
        let trimmed = prompt.originalPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return trimmed
        }

        if let analysis = prompt.imageAttachment?.analysis, !analysis.isEmpty {
            return analysis
        }

        return "Image reference attached"
    }

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

            if let attachment = prompt.imageAttachment {
                PromptImageAttachmentCard(
                    attachment: attachment,
                    height: 84,
                    showsAnalysisBadge: false
                )
                .frame(width: 84, height: 84)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(fallbackTitle)
                    .font(.headline)
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)

                Text(fallbackSubtitle)
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
    @Environment(PromptHistoryManager.self) private var historyManager
    let prompt: PromptRecord
    var onRerun: (() -> Void)?
    var onDelete: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var showCopiedToast = false
    @State private var showExportSheet = false
    @State private var showDeleteConfirmation = false

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
                    if !prompt.originalPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
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
                    }

                    if let attachment = prompt.imageAttachment {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Source Image", systemImage: "photo")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(textPrimary)

                            PromptImageAttachmentCard(
                                attachment: attachment,
                                height: 220,
                                showsAnalysisBadge: attachment.hasAnalysis
                            )

                            if let analysis = attachment.analysis, !analysis.isEmpty {
                                Text(analysis)
                                    .font(.subheadline)
                                    .foregroundStyle(textSecondary)
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(bgSecondary)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
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

                    // Delete
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete Prompt", systemImage: "trash")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

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
                                Text("Modality")
                                    .foregroundStyle(textSecondary)
                                Text(prompt.modality.uppercased())
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
            .alert("Delete Prompt", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        await historyManager.deletePrompt(prompt)
                    }
                    onDelete?()
                    dismiss()
                }
            } message: {
                Text("Are you sure you want to delete this prompt? This action cannot be undone.")
            }
        }
    }

}

#Preview {
    HistoryView()
        .environment(PromptHistoryManager.shared)
}
