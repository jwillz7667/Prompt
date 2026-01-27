//
//  SettingsView.swift
//  Prompt
//
//  Settings screen for model and generation configuration
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(SettingsManager.self) private var settings
    @Environment(\.dismiss) private var dismiss

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    // App version from bundle
    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    var body: some View {
        @Bindable var bindableSettings = settings

        NavigationStack {
            Form {
                // Appearance Section
                Section {
                    Picker(selection: $bindableSettings.appearanceMode) {
                        ForEach(AppearanceMode.allCases) { mode in
                            HStack {
                                Image(systemName: mode.icon)
                                Text(mode.displayName)
                            }
                            .tag(mode)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "paintbrush.fill")
                                .foregroundStyle(textPrimary)
                                .frame(width: 28)
                            Text("Appearance")
                                .foregroundStyle(textPrimary)
                        }
                    }
                    .pickerStyle(.menu)
                } header: {
                    Text("Appearance")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Choose your preferred color scheme. System follows your device settings.")
                        .foregroundStyle(textSecondary)
                }

                // Generation Settings Section
                Section {
                    HStack {
                        Image(systemName: "thermometer.medium")
                            .foregroundStyle(textPrimary)
                            .frame(width: 28)
                        VStack(alignment: .leading) {
                            Text("Temperature")
                                .foregroundStyle(textPrimary)
                            Text(String(format: "%.1f", settings.temperature))
                                .font(.caption)
                                .foregroundStyle(textSecondary)
                        }
                        Spacer()
                        Slider(value: $bindableSettings.temperature, in: 0...1.5, step: 0.1)
                            .frame(width: 150)
                            .tint(textPrimary)
                    }

                    HStack {
                        Image(systemName: "number.square.fill")
                            .foregroundStyle(textPrimary)
                            .frame(width: 28)
                        Stepper("Max Tokens: \(settings.maxTokens)", value: $bindableSettings.maxTokens, in: 1024...65536, step: 1024)
                            .foregroundStyle(textPrimary)
                    }
                } header: {
                    Text("Generation Settings")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Higher temperature = more creative responses.")
                        .foregroundStyle(textSecondary)
                }

                // Custom Instructions Section
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "text.bubble.fill")
                                .foregroundStyle(textPrimary)
                                .frame(width: 28)
                            Text("Custom Instructions")
                                .foregroundStyle(textPrimary)
                        }

                        TextEditor(text: $bindableSettings.customInstructions)
                            .frame(minHeight: 100)
                            .font(.body)
                            .foregroundStyle(textPrimary)
                            .scrollContentBackground(.hidden)
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                } header: {
                    Text("Personalization")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Add custom instructions that will be included with every prompt enhancement. E.g., \"Always include code examples\" or \"Keep responses concise\".")
                        .foregroundStyle(textSecondary)
                }

                // Analytics Section (Premium)
                Section {
                    NavigationLink {
                        AnalyticsView()
                    } label: {
                        HStack {
                            Image(systemName: "chart.bar.fill")
                                .foregroundStyle(textPrimary)
                                .frame(width: 28)
                            Text("Analytics")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(textSecondary)
                        }
                    }
                } header: {
                    Text("Insights")
                        .foregroundStyle(textSecondary)
                }

                // About Section
                Section {
                    HStack {
                        Image(systemName: "info.circle.fill")
                            .foregroundStyle(textPrimary)
                            .frame(width: 28)
                        Text("Version")
                            .foregroundStyle(textPrimary)
                        Spacer()
                        Text(appVersion)
                            .foregroundStyle(textSecondary)
                    }

                    HStack {
                        Image(systemName: "sparkles")
                            .foregroundStyle(textPrimary)
                            .frame(width: 28)
                        Text("Powered by")
                            .foregroundStyle(textPrimary)
                        Spacer()
                        Text("Advanced AI")
                            .foregroundStyle(textSecondary)
                    }
                } header: {
                    Text("About")
                        .foregroundStyle(textSecondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        settings.savePreferences()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                }
            }
            .onChange(of: settings.appearanceMode) { _, _ in
                // Save appearance immediately for instant feedback
                settings.savePreferences()
            }
        }
    }
}

#Preview {
    SettingsView()
        .environment(SettingsManager())
}
