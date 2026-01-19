//
//  ContentView.swift
//  Prompt
//
//  Created by Justin Williams on 1/18/26.
//

import SwiftUI

struct ContentView: View {
    @Environment(SettingsManager.self) private var settings
    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager
    @State private var viewModel = PromptViewModel()
    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showProfile = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    headerCard
                    inputSection
                    enhanceButton

                    if viewModel.hasEnhancedPrompt {
                        outputSection
                    }

                    Spacer(minLength: 100)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
            }
            .background(backgroundGradient)
            .navigationTitle("Prompt Enhancer")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        Button {
                            showHistory = true
                        } label: {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 17, weight: .medium))
                        }

                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 17, weight: .medium))
                        }
                    }
                }

                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 12) {
                        Button {
                            showProfile = true
                        } label: {
                            if let avatarUrl = authManager.currentUser?.avatarUrl,
                               let url = URL(string: avatarUrl) {
                                AsyncImage(url: url) { image in
                                    image
                                        .resizable()
                                        .scaledToFill()
                                } placeholder: {
                                    profilePlaceholder
                                }
                                .frame(width: 32, height: 32)
                                .clipShape(Circle())
                            } else {
                                profilePlaceholder
                            }
                        }

                        if viewModel.hasEnhancedPrompt {
                            Button {
                                withAnimation(.spring(response: 0.3)) {
                                    viewModel.clearAll()
                                }
                            } label: {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.system(size: 15, weight: .medium))
                            }
                        }
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .sheet(isPresented: $showHistory) {
                HistoryView()
            }
            .sheet(isPresented: $showProfile) {
                ProfileView()
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "An unknown error occurred")
            }
            .overlay(alignment: .bottom) {
                if viewModel.showCopiedToast {
                    toastView
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    private var profilePlaceholder: some View {
        Circle()
            .fill(Color(uiColor: .systemGray4))
            .frame(width: 32, height: 32)
            .overlay {
                Image(systemName: "person.fill")
                    .font(.caption)
                    .foregroundStyle(.white)
            }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(uiColor: .systemBackground),
                Color(uiColor: .systemGray6).opacity(0.5)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Header Card

    private var headerCard: some View {
        VStack(spacing: 12) {
            Image(systemName: "wand.and.stars")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.blue, .purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text("Transform Your Prompts")
                .font(.system(.title3, design: .rounded, weight: .semibold))

            Text("Enter any prompt and get an optimized version using advanced prompt engineering techniques")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    // MARK: - Input Section

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Your Prompt", systemImage: "text.cursor")
                .font(.system(.subheadline, weight: .medium))
                .foregroundStyle(.secondary)

            ZStack(alignment: .topLeading) {
                TextEditor(text: $viewModel.userPrompt)
                    .font(.system(.body, design: .default))
                    .frame(minHeight: 150, maxHeight: 250)
                    .padding(16)
                    .scrollContentBackground(.hidden)
                    .background(Color(uiColor: .systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color(uiColor: .separator), lineWidth: 0.5)
                    )

                if viewModel.userPrompt.isEmpty {
                    Text("Describe what you want to achieve...")
                        .font(.body)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 24)
                        .allowsHitTesting(false)
                }
            }

            HStack {
                Text("\(viewModel.characterCount) characters")
                    .font(.caption)
                    .foregroundStyle(.tertiary)

                Spacer()

                if !viewModel.userPrompt.isEmpty {
                    Button {
                        viewModel.userPrompt = ""
                    } label: {
                        Text("Clear")
                            .font(.caption)
                            .foregroundStyle(.blue)
                    }
                }
            }
        }
    }

    // MARK: - Enhance Button

    private var enhanceButton: some View {
        Button {
            Task {
                let startTime = Date()
                await viewModel.enhancePrompt(settings: settings)

                // Save to history if successful
                if viewModel.hasEnhancedPrompt {
                    let processingMs = Int(Date().timeIntervalSince(startTime) * 1000)
                    _ = await historyManager.savePrompt(
                        original: viewModel.userPrompt,
                        enhanced: viewModel.enhancedPrompt,
                        model: settings.selectedModel.rawValue,
                        temperature: settings.temperature,
                        maxTokens: settings.maxTokens,
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: viewModel.tokensUsed,
                        processingMs: processingMs
                    )
                }
            }
        } label: {
            HStack(spacing: 12) {
                if viewModel.isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 18, weight: .semibold))
                }

                Text(viewModel.isLoading ? "Enhancing..." : "Enhance Prompt")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                LinearGradient(
                    colors: viewModel.canEnhance
                        ? [.blue, .purple]
                        : [.gray.opacity(0.5), .gray.opacity(0.3)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: viewModel.canEnhance ? .blue.opacity(0.3) : .clear, radius: 8, y: 4)
        }
        .disabled(!viewModel.canEnhance)
        .animation(.easeInOut(duration: 0.2), value: viewModel.canEnhance)
    }

    // MARK: - Output Section

    private var outputSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Enhanced Prompt", systemImage: "doc.text.fill")
                    .font(.system(.subheadline, weight: .medium))
                    .foregroundStyle(.secondary)

                Spacer()

                if viewModel.tokensUsed > 0 {
                    Text("\(viewModel.tokensUsed) tokens")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(uiColor: .systemGray5))
                        .clipShape(Capsule())
                }
            }

            ScrollView {
                Text(viewModel.enhancedPrompt)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 200, maxHeight: 400)
            .padding(16)
            .background(Color(uiColor: .systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [.blue.opacity(0.5), .purple.opacity(0.5)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1.5
                    )
            )

            // Action Buttons
            HStack(spacing: 12) {
                Button {
                    viewModel.copyToClipboard()
                } label: {
                    Label("Copy", systemImage: "doc.on.doc.fill")
                        .font(.system(.subheadline, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(uiColor: .systemGray5))
                        .foregroundStyle(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                ShareLink(item: viewModel.enhancedPrompt) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.system(.subheadline, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(uiColor: .systemGray5))
                        .foregroundStyle(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: viewModel.hasEnhancedPrompt)
    }

    // MARK: - Toast View

    private var toastView: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text("Copied to clipboard")
                .font(.subheadline)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.1), radius: 10, y: 5)
        .padding(.bottom, 30)
    }
}

#Preview {
    ContentView()
        .environment(SettingsManager())
        .environment(AuthManager.shared)
        .environment(PromptHistoryManager.shared)
}
