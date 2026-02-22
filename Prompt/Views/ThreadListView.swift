//
//  ThreadListView.swift
//  Prompt
//
//  Thread history list - shows all conversation threads
//

import SwiftUI

struct ThreadListView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit

    @State private var viewModel = ThreadViewModel()
    @State private var newThreadViewModel = ThreadViewModel()
    @State private var selectedThreadId: String?
    @State private var showNewThread = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                if viewModel.isLoadingThreads && viewModel.threads.isEmpty {
                    ProgressView()
                        .tint(accentColor)
                } else if viewModel.threads.isEmpty {
                    emptyState
                } else {
                    threadList
                }
            }
            .navigationTitle("Threads")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(accentColor)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        triggerHaptic(.light)
                        showNewThread = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(accentColor)
                    }
                }
            }
            .navigationDestination(item: $selectedThreadId) { threadId in
                ThreadView(viewModel: viewModel, threadId: threadId)
            }
            .navigationDestination(isPresented: $showNewThread) {
                ThreadView(viewModel: newThreadViewModel)
            }
            .onChange(of: showNewThread) { _, isPresented in
                if isPresented {
                    newThreadViewModel = ThreadViewModel()
                }
            }
            .task {
                await viewModel.fetchThreads(refresh: true)
            }
            .refreshable {
                await viewModel.fetchThreads(refresh: true)
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "An unknown error occurred")
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 56, weight: .light))
                .foregroundStyle(textTertiary)

            VStack(spacing: 8) {
                Text("No Threads Yet")
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text("Start a conversation thread to iteratively\nrefine and enhance your prompts")
                    .font(.system(.subheadline))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }

            Button {
                triggerHaptic(.light)
                showNewThread = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                    Text("New Thread")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .foregroundStyle(.white)
                .background {
                    Capsule()
                        .fill(Color.adaptiveButtonPrimary)
                }
            }
        }
    }

    // MARK: - Thread List

    private var threadList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.threads) { thread in
                    threadRow(thread)
                        .onTapGesture {
                            triggerHaptic(.light)
                            selectedThreadId = thread.id
                        }
                }

                // Load more
                if viewModel.hasMorePages {
                    ProgressView()
                        .tint(accentColor)
                        .padding()
                        .task {
                            viewModel.currentPage += 1
                            await viewModel.fetchThreads()
                        }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    // MARK: - Thread Row

    private func threadRow(_ thread: ThreadRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                // Modality icon
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

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(textTertiary)
            }

            // Preview of last turn
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
        .contextMenu {
            Button(role: .destructive) {
                Task {
                    await viewModel.deleteThread(id: thread.id)
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Modality Helpers

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

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}
