//
//  BatchEnhanceView.swift
//  Prompt
//
//  Multi-prompt batch enhancement interface (Premium)
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct BatchEnhanceView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit
    @State private var viewModel = BatchViewModel()
    @State private var newPrompt = ""
    @State private var showPaywall = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }
    private var borderColor: Color { Color.adaptiveBorder }

    private var isPremium: Bool {
        storeKit.currentTier == .premium
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !isPremium {
                    premiumBanner
                }

                ScrollView {
                    VStack(spacing: 20) {
                        // Input section
                        inputSection

                        // Queue section
                        if !viewModel.prompts.isEmpty {
                            queueSection
                        }

                        // Results section
                        if !viewModel.results.isEmpty {
                            resultsSection
                        }
                    }
                    .padding()
                }
            }
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Batch Enhance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(textPrimary)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    if viewModel.isProcessing {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else if !viewModel.prompts.isEmpty {
                        Button("Enhance All") {
                            if isPremium {
                                Task {
                                    await viewModel.processAll(settings: settings)
                                }
                            } else {
                                showPaywall = true
                            }
                        }
                        .fontWeight(.semibold)
                        .foregroundStyle(buttonPrimary)
                    }
                }
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    // MARK: - Premium Banner

    private var premiumBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "crown.fill")
                .font(.system(size: 16))
                .foregroundStyle(.yellow)

            VStack(alignment: .leading, spacing: 2) {
                Text("Premium Feature")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)

                Text("Upgrade to process multiple prompts at once")
                    .font(.caption)
                    .foregroundStyle(textSecondary)
            }

            Spacer()

            Button("Upgrade") {
                showPaywall = true
            }
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.yellow.gradient)
            .clipShape(Capsule())
        }
        .padding()
        .background(Color.yellow.opacity(0.1))
    }

    // MARK: - Input Section

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add Prompts")
                .font(.headline)
                .foregroundStyle(textPrimary)

            HStack(spacing: 12) {
                TextField("Enter a prompt to add...", text: $newPrompt, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .background(bgSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(borderColor, lineWidth: 1)
                    )

                Button {
                    if !newPrompt.trimmingCharacters(in: .whitespaces).isEmpty {
                        viewModel.addPrompt(newPrompt)
                        newPrompt = ""
                    }
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(buttonPrimary)
                }
                .disabled(newPrompt.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.prompts.count >= 10)
            }

            Text("Add up to 10 prompts • \(viewModel.prompts.count)/10")
                .font(.caption)
                .foregroundStyle(textTertiary)
        }
    }

    // MARK: - Queue Section

    private var queueSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Queue")
                    .font(.headline)
                    .foregroundStyle(textPrimary)

                Spacer()

                Button("Clear All") {
                    viewModel.clearAll()
                }
                .font(.caption)
                .foregroundStyle(textSecondary)
            }

            ForEach(Array(viewModel.prompts.enumerated()), id: \.offset) { index, prompt in
                HStack(spacing: 12) {
                    Text("\(index + 1)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(buttonPrimary)
                        .clipShape(Circle())

                    Text(prompt)
                        .font(.subheadline)
                        .foregroundStyle(textPrimary)
                        .lineLimit(2)

                    Spacer()

                    Button {
                        viewModel.removePrompt(at: index)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(textTertiary)
                    }
                }
                .padding(12)
                .background(bgSecondary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // MARK: - Results Section

    private var resultsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Results")
                    .font(.headline)
                    .foregroundStyle(textPrimary)

                Spacer()

                if viewModel.successCount > 0 {
                    Text("\(viewModel.successCount)/\(viewModel.results.count) successful")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }

            ForEach(viewModel.results) { result in
                BatchResultCard(result: result)
            }
        }
    }
}

// MARK: - Batch Result Card

struct BatchResultCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let result: BatchResult
    @State private var isExpanded = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: result.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(result.success ? .green : .red)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Prompt \(result.index + 1)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(textPrimary)

                    Text(result.original)
                        .font(.caption)
                        .foregroundStyle(textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    withAnimation(.spring(response: 0.3)) {
                        isExpanded.toggle()
                    }
                } label: {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundStyle(textSecondary)
                }
            }

            if isExpanded && result.success {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Enhanced:")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(textSecondary)

                    Text(result.enhanced)
                        .font(.caption)
                        .foregroundStyle(textPrimary)
                        .textSelection(.enabled)

                    HStack {
                        Button {
                            UIPasteboard.general.string = result.enhanced
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(.top, 8)
            }

            if let error = result.error {
                Text("Error: \(error)")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Batch View Model

@Observable
@MainActor
final class BatchViewModel {
    var prompts: [String] = []
    var results: [BatchResult] = []
    var isProcessing = false
    var error: String?

    var successCount: Int {
        results.filter { $0.success }.count
    }

    func addPrompt(_ prompt: String) {
        guard prompts.count < 10 else { return }
        prompts.append(prompt)
    }

    func removePrompt(at index: Int) {
        guard index < prompts.count else { return }
        prompts.remove(at: index)
    }

    func clearAll() {
        prompts.removeAll()
        results.removeAll()
    }

    func processAll(settings: SettingsManager) async {
        guard !prompts.isEmpty else { return }
        guard await APIClient.shared.isAuthenticated else {
            error = "Please sign in"
            return
        }

        isProcessing = true
        results.removeAll()

        do {
            let request = BatchEnhanceRequest(
                prompts: prompts,
                model: settings.effectiveModel.rawValue,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                tone: settings.selectedTone.rawValue,
                length: settings.outputLength.rawValue
            )

            let response: BatchEnhanceResponse = try await APIClient.shared.request(
                "/prompts/enhance/batch",
                method: .post,
                body: request
            )

            results = response.results.map { BatchResult(from: $0) }
            prompts.removeAll()
        } catch {
            self.error = error.localizedDescription
        }

        isProcessing = false
    }
}

// MARK: - Models

struct BatchResult: Identifiable {
    let id = UUID()
    let index: Int
    let original: String
    let enhanced: String
    let success: Bool
    let error: String?

    init(from dto: BatchResultDTO) {
        self.index = dto.index
        self.original = dto.original
        self.enhanced = dto.enhanced
        self.success = dto.success
        self.error = dto.error
    }
}

struct BatchResultDTO: Decodable {
    let index: Int
    let original: String
    let enhanced: String
    let success: Bool
    let error: String?
}

struct BatchEnhanceRequest: Encodable {
    let prompts: [String]
    let model: String?
    let temperature: Double?
    let maxTokens: Int?
    let tone: String?
    let length: String?
}

struct BatchEnhanceResponse: Decodable {
    let results: [BatchResultDTO]
    let summary: Summary

    struct Summary: Decodable {
        let total: Int
        let success: Int
        let failed: Int
    }
}

#Preview {
    BatchEnhanceView()
        .environment(SettingsManager())
        .environment(StoreKitManager.shared)
}
