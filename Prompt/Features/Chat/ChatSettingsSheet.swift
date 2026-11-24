//
//  ChatSettingsSheet.swift
//  Prompt
//
//  Per-conversation name and custom instructions (`systemPrompt`).
//

import SwiftUI

struct ChatSettingsSheet: View {
    let initialTitle: String
    let initialInstructions: String
    let onSave: (_ title: String, _ instructions: String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var instructions: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field {
        case title, instructions
    }

    init(
        initialTitle: String,
        initialInstructions: String,
        onSave: @escaping (_ title: String, _ instructions: String) async throws -> Void
    ) {
        self.initialTitle = initialTitle
        self.initialInstructions = initialInstructions
        self.onSave = onSave
        _title = State(initialValue: initialTitle)
        _instructions = State(initialValue: initialInstructions)
    }

    private var hasChanges: Bool {
        title != initialTitle || instructions != initialInstructions
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name this chat", text: $title)
                        .focused($focusedField, equals: .title)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .instructions }
                        .onChange(of: title) { _, newValue in
                            if newValue.count > ChatLimits.maxTitleLength {
                                title = String(newValue.prefix(ChatLimits.maxTitleLength))
                            }
                        }
                } header: {
                    Text("Name")
                }

                Section {
                    TextField(
                        "For example: Answer briefly, use metric units, and explain code step by step.",
                        text: $instructions,
                        axis: .vertical
                    )
                    .lineLimit(6...14)
                    .focused($focusedField, equals: .instructions)
                    .onChange(of: instructions) { _, newValue in
                        if newValue.count > ChatLimits.maxSystemPromptLength {
                            instructions = String(newValue.prefix(ChatLimits.maxSystemPromptLength))
                        }
                    }

                    if !instructions.isEmpty {
                        Button("Clear Instructions", role: .destructive) {
                            instructions = ""
                        }
                    }
                } header: {
                    Text("Custom instructions")
                } footer: {
                    Text("Promptomize Assistant follows these in every reply in this chat. \(instructions.count)/\(ChatLimits.maxSystemPromptLength)")
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background { LiquidGlassBackground() }
            .navigationTitle("Chat Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") { save() }
                            .disabled(!hasChanges)
                            .accessibilityIdentifier("chat.settings.save")
                    }
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        Task {
            do {
                try await onSave(title, instructions)
                isSaving = false
                dismiss()
            } catch {
                isSaving = false
                errorMessage = ChatViewModel.userMessage(for: error)
            }
        }
    }
}
