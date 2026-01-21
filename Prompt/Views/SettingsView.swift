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

                // Model Section
                Section {
                    Picker(selection: $bindableSettings.selectedModel) {
                        ForEach(DeepseekModel.allCases) { model in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(model.displayName)
                                    .font(.body)
                                    .foregroundStyle(textPrimary)
                                Text(model.description)
                                    .font(.caption)
                                    .foregroundStyle(textSecondary)
                            }
                            .tag(model)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "cpu.fill")
                                .foregroundStyle(textPrimary)
                                .frame(width: 28)
                            Text("Model")
                                .foregroundStyle(textPrimary)
                        }
                    }
                } header: {
                    Text("Model")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Reasoner uses deep chain-of-thought for better prompt engineering")
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
                    Text("Reasoner supports up to 64K output tokens. Higher temperature = more creative.")
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
                        Text("1.0.0")
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
