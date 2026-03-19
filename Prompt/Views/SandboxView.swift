import SwiftUI
import UIKit

struct SandboxView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var service = SandboxService.shared

    @State private var showCreateSheet = false
    @State private var selectedTest: SandboxTest?
    @State private var showDeleteConfirmation = false
    @State private var testToDelete: SandboxTest?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }
    private var visibleTests: [SandboxTest] {
        service.tests.filter { test in
            test.platforms.contains { platform in
                AppStoreComplianceManager.shared.isPlatformAvailable(platform)
            }
        }
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                Group {
                    if service.isLoading && visibleTests.isEmpty {
                        loadingView
                    } else if visibleTests.isEmpty {
                        emptyStateView
                    } else {
                        testsList
                    }
                }
            }
            .navigationTitle("Sandbox")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(accentColor)
                    }
                }
            }
            .task { await service.loadTestsIfNeeded() }
            .sheet(isPresented: $showCreateSheet) {
                CreateTestSheet(service: service)
            }
            .sheet(item: $selectedTest) { test in
                TestDetailSheet(test: test, service: service)
            }
            .alert("Delete Test", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    if let test = testToDelete {
                        Task { try? await service.deleteTest(id: test.id) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This test and its results will be permanently deleted.")
            }
        }
    }

    // MARK: - Tests List

    private var testsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(visibleTests) { test in
                    testCard(test)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 100)
        }
        .refreshable {
            _ = try? await service.listTests()
        }
    }

    private func testCard(_ test: SandboxTest) -> some View {
        let visiblePlatforms = test.platforms.filter { platform in
            AppStoreComplianceManager.shared.isPlatformAvailable(platform)
        }
        let visibleResults = (test.results ?? []).filter { AppStoreComplianceManager.shared.isPlatformAvailable($0.platform) }

        return Button {
            triggerHaptic()
            selectedTest = test
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(test.testPrompt)
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(textPrimary)
                        .lineLimit(2)

                    Spacer()

                    statusBadge(test.status)
                }

                HStack(spacing: 8) {
                    // Platform icons
                    HStack(spacing: -4) {
                        ForEach(visiblePlatforms.prefix(4)) { platform in
                            Image(systemName: platform.icon)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 22, height: 22)
                                .background(Color(hex: platform.color))
                                .clipShape(Circle())
                        }
                        if visiblePlatforms.count > 4 {
                            Text("+\(visiblePlatforms.count - 4)")
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                                .foregroundStyle(textTertiary)
                                .frame(width: 22, height: 22)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                    }

                    Spacer()

                    if !visibleResults.isEmpty {
                        Text("\(visibleResults.count) results")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(textTertiary)
                    }

                    Text(test.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
            }
            .padding(16)
            .liquidGlass(cornerRadius: 16)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) {
                testToDelete = test
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func statusBadge(_ status: String) -> some View {
        let (color, icon): (Color, String) = {
            switch status {
            case "completed": return (.green, "checkmark.circle.fill")
            case "processing": return (.orange, "arrow.circlepath")
            case "pending": return (.blue, "clock")
            case "failed": return (.red, "xmark.circle.fill")
            default: return (textTertiary, "questionmark.circle")
            }
        }()

        return HStack(spacing: 4) {
            if status == "processing" {
                ProgressView()
                    .scaleEffect(0.6)
                    .tint(color)
            } else {
                Image(systemName: icon)
                    .font(.system(size: 10))
            }
            Text(status.capitalized)
                .font(.system(.caption2, design: .rounded, weight: .semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .overlay(Capsule().stroke(color.opacity(0.3), lineWidth: 0.5))
        .clipShape(Capsule())
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().tint(accentColor)
            Text("Loading tests...")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "flask")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(accentColor.opacity(0.6))

            Text("No Sandbox Tests")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Test your prompts across multiple platforms to compare results.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)

            Button {
                showCreateSheet = true
            } label: {
                Label("Create Test", systemImage: "plus")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .buttonStyle(GlassPrimaryButtonStyle())
        }
        .padding(40)
    }
}

// MARK: - Create Test Sheet

private struct CreateTestSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let service: SandboxService

    @State private var promptText = ""
    @State private var selectedPlatforms: Set<PlatformType> = []
    @State private var temperature: Double = 0.7
    @State private var maxTokens: Double = 2048
    @State private var isRunning = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }
    private var supportedPlatforms: [PlatformType] {
        service.availablePlatforms
            .map(\.platform)
            .filter { AppStoreComplianceManager.shared.isPlatformAvailable($0) }
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 20) {
                        // Prompt input
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Test Prompt")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)

                            TextEditor(text: $promptText)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .scrollContentBackground(.hidden)
                                .frame(minHeight: 100, maxHeight: 200)
                                .padding(14)
                                .liquidGlassInput(cornerRadius: 12)
                        }

                        // Platform selection
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Platforms")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)

                            LazyVGrid(columns: [
                                GridItem(.flexible()),
                                GridItem(.flexible()),
                                GridItem(.flexible())
                            ], spacing: 8) {
                                ForEach(supportedPlatforms) { platform in
                                    platformChip(platform)
                                }
                            }

                            if supportedPlatforms.isEmpty {
                                Text("No supported sandbox platforms are currently available for this account.")
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textTertiary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        // Parameters
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Parameters")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)

                            VStack(spacing: 4) {
                                HStack {
                                    Text("Temperature")
                                        .font(.system(.subheadline, design: .rounded))
                                        .foregroundStyle(textPrimary)
                                    Spacer()
                                    Text(String(format: "%.1f", temperature))
                                        .font(.system(.subheadline, design: .monospaced, weight: .medium))
                                        .foregroundStyle(accentColor)
                                }
                                Slider(value: $temperature, in: 0...2, step: 0.1)
                                    .tint(accentColor)
                            }
                            .padding(14)
                            .liquidGlass(cornerRadius: 12)

                            VStack(spacing: 4) {
                                HStack {
                                    Text("Max Tokens")
                                        .font(.system(.subheadline, design: .rounded))
                                        .foregroundStyle(textPrimary)
                                    Spacer()
                                    Text("\(Int(maxTokens))")
                                        .font(.system(.subheadline, design: .monospaced, weight: .medium))
                                        .foregroundStyle(accentColor)
                                }
                                Slider(value: $maxTokens, in: 256...16384, step: 256)
                                    .tint(accentColor)
                            }
                            .padding(14)
                            .liquidGlass(cornerRadius: 12)
                        }

                        // Run button
                        Button {
                            Task { await runTest() }
                        } label: {
                            if isRunning {
                                HStack {
                                    ProgressView().tint(.white)
                                    Text("Running Test...")
                                }
                            } else {
                                Label("Run Test", systemImage: "play.fill")
                                    .font(.system(.body, design: .rounded, weight: .semibold))
                            }
                        }
                        .buttonStyle(GlassPrimaryButtonStyle())
                        .disabled(promptText.isEmpty || selectedPlatforms.isEmpty || isRunning)
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("New Test")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(textSecondary)
                }
            }
            .task { await service.loadAvailablePlatforms() }
            .onChange(of: supportedPlatforms) { _, updatedPlatforms in
                let supportedSet = Set(updatedPlatforms)
                selectedPlatforms = selectedPlatforms.intersection(supportedSet)
            }
        }
    }

    private func platformChip(_ platform: PlatformType) -> some View {
        let isSelected = selectedPlatforms.contains(platform)
        return Button {
            triggerHaptic()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                if isSelected {
                    selectedPlatforms.remove(platform)
                } else {
                    selectedPlatforms.insert(platform)
                }
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: platform.icon)
                    .font(.system(size: 14, weight: .semibold))
                Text(platform.displayName)
                    .font(.system(.caption2, design: .rounded, weight: .medium))
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .liquidGlassChip(isSelected: isSelected, accentColor: Color(hex: platform.color))
        }
        .buttonStyle(.plain)
    }

    private func runTest() async {
        isRunning = true
        let params = TestParameters(
            temperature: temperature,
            maxTokens: Int(maxTokens),
            topP: nil,
            frequencyPenalty: nil,
            presencePenalty: nil,
            systemPrompt: nil
        )

        do {
            _ = try await service.createTest(
                testPrompt: promptText,
                platforms: Array(selectedPlatforms),
                parameters: params
            )
            dismiss()
        } catch {
            print("Failed to create test: \(error)")
        }
        isRunning = false
    }
}

// MARK: - Test Detail Sheet

private struct TestDetailSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let test: SandboxTest
    let service: SandboxService

    @State private var comparison: TestComparison?
    @State private var isLoadingComparison = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }
    private var visibleResults: [PlatformTestResult] {
        (test.results ?? []).filter { AppStoreComplianceManager.shared.isPlatformAvailable($0.platform) }
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        // Prompt
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Test Prompt")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                            Text(test.testPrompt)
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(textPrimary)
                                .textSelection(.enabled)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .liquidGlass(cornerRadius: 14)

                        // Comparison stats
                        if let comp = comparison {
                            comparisonStatsView(comp)
                                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                        }

                        // Results
                        if !visibleResults.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Results")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textSecondary)

                                ForEach(visibleResults) { result in
                                    resultCard(result)
                                }
                            }
                        } else if test.status == "processing" || test.status == "pending" {
                            VStack(spacing: 12) {
                                ProgressView()
                                    .tint(accentColor)
                                    .scaleEffect(1.2)
                                Text("Test is running...")
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            }
                            .padding(40)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Test Detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
            .task {
                if test.status == "completed" {
                    await loadComparison()
                }
            }
        }
    }

    private func resultCard(_ result: PlatformTestResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: result.platform.icon)
                    .foregroundStyle(Color(hex: result.platform.color))
                Text(result.platform.displayName)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)
                Spacer()

                if result.error != nil {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.red)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            if let response = result.response {
                Text(response)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textPrimary)
                    .lineLimit(5)
                    .textSelection(.enabled)
            }

            if let error = result.error {
                Text(error)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.red)
            }

            HStack(spacing: 16) {
                if let latency = result.latencyMs {
                    Label("\(latency)ms", systemImage: "clock")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
                if let tokens = result.tokenCount {
                    Label("\(tokens) tokens", systemImage: "number")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
                if let cost = result.cost {
                    Label("$\(cost, specifier: "%.4f")", systemImage: "dollarsign.circle")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
            }
        }
        .padding(14)
        .liquidGlass(cornerRadius: 14)
    }

    private func comparisonStatsView(_ comp: TestComparison) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Comparison")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                if let fastest = comp.statistics.fastestPlatform {
                    statCard(label: "Fastest", value: fastest, icon: "bolt.fill", color: .green)
                }
                if let cheapest = comp.statistics.cheapestPlatform {
                    statCard(label: "Cheapest", value: cheapest, icon: "dollarsign.circle", color: .blue)
                }
                statCard(label: "Avg Latency", value: "\(comp.statistics.averageLatency)ms", icon: "clock", color: .orange)
                statCard(label: "Success Rate", value: "\(Int(comp.statistics.successRate * 100))%", icon: "checkmark.circle", color: accentColor)
            }
        }
    }

    private func statCard(label: String, value: String, icon: String, color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(color)
            Text(value)
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .lineLimit(1)
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(textTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .liquidGlass(cornerRadius: 10)
    }

    private func loadComparison() async {
        isLoadingComparison = true
        do {
            let result = try await service.compareTestResults(testId: test.id)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                comparison = result
            }
        } catch {
            print("Failed to load comparison: \(error)")
        }
        isLoadingComparison = false
    }
}
