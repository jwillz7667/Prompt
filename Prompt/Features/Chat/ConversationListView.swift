//
//  ConversationListView.swift
//  Prompt
//
//  Assistant conversations in the drawer: new chat, search within loaded
//  chats, rename, delete (with confirmation) and cursor paging on scroll.
//

import SwiftUI

struct ConversationListView: View {
    @Bindable var viewModel: ConversationListViewModel
    let selectedConversationId: String?
    let onSelect: (String) -> Void
    let onNewChat: () -> Void
    let onRenamed: (ChatConversation) -> Void
    let onDeleted: (String) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var searchText = ""
    @State private var renameTarget: ChatConversationSummary?
    @State private var renameText = ""
    @State private var deleteTarget: ChatConversationSummary?
    @State private var actionErrorMessage: String?

    private var filtered: [ChatConversationSummary] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).localizedLowercase
        guard !query.isEmpty else { return viewModel.conversations }
        return viewModel.conversations.filter { conversation in
            conversation.displayTitle.localizedLowercase.contains(query)
                || (conversation.lastMessagePreview?.localizedLowercase.contains(query) ?? false)
        }
    }

    private var fieldBackground: Color {
        Color.adaptiveBackgroundTertiary.opacity(colorScheme == .dark ? 1 : 0.6)
    }

    var body: some View {
        VStack(spacing: 0) {
            searchHeader
            listContent
        }
        .task {
            if viewModel.state == .idle { await viewModel.refresh() }
        }
        .alert("Rename chat", isPresented: isRenaming) {
            TextField("Name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Save") { commitRename() }
        }
        .confirmationDialog(
            "Delete this chat?",
            isPresented: isConfirmingDelete,
            titleVisibility: .visible,
            presenting: deleteTarget
        ) { conversation in
            Button("Delete Chat", role: .destructive) { delete(conversation) }
            Button("Cancel", role: .cancel) {}
        } message: { conversation in
            Text("\"\(conversation.displayTitle)\" and its messages will be permanently deleted.")
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(
                get: { actionErrorMessage != nil },
                set: { if !$0 { actionErrorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionErrorMessage ?? "")
        }
    }

    // MARK: - Header

    private var searchHeader: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.adaptiveTextTertiary)
                    .accessibilityHidden(true)
                TextField("Search chats", text: $searchText)
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(Color.adaptiveTextPrimary)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(fieldBackground)
            }

            Button(action: onNewChat) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.adaptiveTextPrimary)
                    .frame(width: 42, height: 42)
                    .background {
                        RoundedRectangle(cornerRadius: 10, style: .continuous).fill(fieldBackground)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("New chat"))
            .accessibilityIdentifier("chat.list.new")
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    // MARK: - List

    private var isInitialLoad: Bool {
        guard viewModel.conversations.isEmpty else { return false }
        return viewModel.state == .idle || viewModel.state == .loading
    }

    private var initialLoadFailure: String? {
        guard viewModel.conversations.isEmpty, case .failed(let message) = viewModel.state else { return nil }
        return message
    }

    @ViewBuilder
    private var listContent: some View {
        if isInitialLoad {
            centered {
                ProgressView().tint(Color.adaptiveButtonPrimary)
            }
        } else if let message = initialLoadFailure {
            centered {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(Color.adaptiveTextTertiary)
                        .accessibilityHidden(true)
                    Text("Couldn't load chats")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(Color.adaptiveTextPrimary)
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextSecondary)
                        .multilineTextAlignment(.center)
                    Button("Retry") {
                        Task { await viewModel.refresh() }
                    }
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                }
                .padding(.horizontal, 24)
            }
        } else if filtered.isEmpty {
            centered {
                VStack(spacing: 10) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(Color.adaptiveTextTertiary)
                        .accessibilityHidden(true)
                    Text(searchText.isEmpty ? "No chats yet" : "No results")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(Color.adaptiveTextSecondary)
                }
            }
        } else {
            list
        }
    }

    private var list: some View {
        List {
            ForEach(filtered) { conversation in
                row(conversation)
                    .listRowBackground(rowBackground(for: conversation))
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                    .task {
                        guard searchText.isEmpty else { return }
                        await viewModel.loadMoreIfNeeded(after: conversation)
                    }
            }

            if viewModel.hasMore && searchText.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await viewModel.refresh() }
    }

    private func row(_ conversation: ChatConversationSummary) -> some View {
        Button {
            onSelect(conversation.id)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(conversation.displayTitle)
                        .font(.system(.body, design: .rounded, weight: .medium))
                        .foregroundStyle(Color.adaptiveTextPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(conversation.updatedAt, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                        .font(.caption2)
                        .foregroundStyle(Color.adaptiveTextTertiary)
                        .lineLimit(1)
                }
                if let preview = conversation.lastMessagePreview, !preview.isEmpty {
                    Text(preview)
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextSecondary)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(conversation.id == selectedConversationId ? .isSelected : [])
        .accessibilityHint(Text("Opens this chat"))
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                deleteTarget = conversation
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                beginRename(conversation)
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            .tint(Color.brandPurple)
        }
        .contextMenu {
            Button {
                beginRename(conversation)
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button(role: .destructive) {
                deleteTarget = conversation
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func rowBackground(for conversation: ChatConversationSummary) -> some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(conversation.id == selectedConversationId ? fieldBackground : Color.clear)
            .padding(.horizontal, 8)
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack {
            Spacer()
            content()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Rename & Delete

    private var isRenaming: Binding<Bool> {
        Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })
    }

    private var isConfirmingDelete: Binding<Bool> {
        Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } })
    }

    private func beginRename(_ conversation: ChatConversationSummary) {
        renameText = conversation.title ?? ""
        renameTarget = conversation
    }

    private func commitRename() {
        guard let target = renameTarget else { return }
        let title = renameText
        renameTarget = nil
        Task {
            do {
                let updated = try await viewModel.rename(id: target.id, to: title)
                onRenamed(updated)
            } catch {
                actionErrorMessage = ChatViewModel.userMessage(for: error)
            }
        }
    }

    private func delete(_ conversation: ChatConversationSummary) {
        deleteTarget = nil
        Task {
            do {
                try await viewModel.delete(id: conversation.id)
                onDeleted(conversation.id)
            } catch {
                actionErrorMessage = ChatViewModel.userMessage(for: error)
            }
        }
    }
}
