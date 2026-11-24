//
//  ReportMessageSheet.swift
//  Prompt
//
//  Lets the user flag an assistant reply for review (App Store guidelines
//  1.2 and 4.7 require a reporting mechanism for generated content).
//

import SwiftUI

struct ReportMessageSheet: View {
    let message: ChatTranscriptMessage
    let onSubmit: (ChatReportReason, String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var reason: ChatReportReason?
    @State private var details = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var didSubmit = false

    private var canSubmit: Bool {
        reason != nil && !isSubmitting && ChatLimits.length(of: details) <= ChatLimits.maxReportDetailsLength
    }

    var body: some View {
        NavigationStack {
            Group {
                if didSubmit {
                    confirmation
                } else {
                    form
                }
            }
            .scrollContentBackground(.hidden)
            .background { LiquidGlassBackground() }
            .navigationTitle(didSubmit ? "" : String(localized: "Report Response"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(didSubmit ? String(localized: "Done") : String(localized: "Cancel")) { dismiss() }
                }
                if !didSubmit {
                    ToolbarItem(placement: .confirmationAction) {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Button("Submit") { submit() }
                                .disabled(!canSubmit)
                                .accessibilityIdentifier("chat.report.submit")
                        }
                    }
                }
            }
        }
        .interactiveDismissDisabled(isSubmitting)
    }

    private var form: some View {
        Form {
            Section {
                Text(message.content)
                    .font(.footnote)
                    .foregroundStyle(Color.adaptiveTextSecondary)
                    .lineLimit(4)
            } header: {
                Text("Response")
            }

            Section {
                ForEach(ChatReportReason.allCases) { option in
                    Button {
                        reason = option
                    } label: {
                        HStack {
                            Label(option.title, systemImage: option.systemImage)
                                .foregroundStyle(Color.adaptiveTextPrimary)
                            Spacer()
                            if reason == option {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Color.adaptiveButtonPrimary)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(reason == option ? .isSelected : [])
                }
            } header: {
                Text("What's wrong with this response?")
            }

            Section {
                TextField("Add details (optional)", text: $details, axis: .vertical)
                    .lineLimit(3...8)
                    .onChange(of: details) { _, newValue in
                        if ChatLimits.length(of: newValue) > ChatLimits.maxReportDetailsLength {
                            details = ChatLimits.truncated(newValue, toLength: ChatLimits.maxReportDetailsLength)
                        }
                    }
            } footer: {
                Text("Reports are reviewed by our team to improve the assistant. \(ChatLimits.length(of: details))/\(ChatLimits.maxReportDetailsLength)")
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
    }

    private var confirmation: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.adaptiveButtonPrimary)
                .accessibilityHidden(true)
            Text("Thanks for letting us know")
                .font(.system(.title3, design: .rounded, weight: .bold))
                .foregroundStyle(Color.adaptiveTextPrimary)
            Text("We'll review this response. Your feedback helps keep the assistant safe and accurate.")
                .font(.subheadline)
                .foregroundStyle(Color.adaptiveTextSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }

    private func submit() {
        guard let reason, canSubmit else { return }
        isSubmitting = true
        errorMessage = nil
        Task {
            do {
                try await onSubmit(reason, details)
                isSubmitting = false
                withAnimation(.spring(response: 0.35)) { didSubmit = true }
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } catch {
                isSubmitting = false
                errorMessage = ChatViewModel.userMessage(for: error)
            }
        }
    }
}
