//
//  SettingsView.swift
//  Prompt
//
//  Settings screen for model and generation configuration
//

import SwiftUI

struct SettingsView: View {
    @Environment(SettingsManager.self) private var settings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var bindableSettings = settings

        NavigationStack {
            Form {
                // Model Section
                Section {
                    Picker(selection: $bindableSettings.selectedModel) {
                        ForEach(DeepseekModel.allCases) { model in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(model.displayName)
                                    .font(.body)
                                Text(model.description)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .tag(model)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "cpu.fill")
                                .foregroundStyle(.blue)
                                .frame(width: 28)
                            Text("Model")
                        }
                    }
                } header: {
                    Text("Model")
                } footer: {
                    Text("Reasoner uses deep chain-of-thought for better prompt engineering")
                }

                // Generation Settings Section
                Section {
                    HStack {
                        Image(systemName: "thermometer.medium")
                            .foregroundStyle(.red)
                            .frame(width: 28)
                        VStack(alignment: .leading) {
                            Text("Temperature")
                            Text(String(format: "%.1f", settings.temperature))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Slider(value: $bindableSettings.temperature, in: 0...1.5, step: 0.1)
                            .frame(width: 150)
                    }

                    HStack {
                        Image(systemName: "number.square.fill")
                            .foregroundStyle(.purple)
                            .frame(width: 28)
                        Stepper("Max Tokens: \(settings.maxTokens)", value: $bindableSettings.maxTokens, in: 1024...65536, step: 1024)
                    }
                } header: {
                    Text("Generation Settings")
                } footer: {
                    Text("Reasoner supports up to 64K output tokens. Higher temperature = more creative.")
                }

                // About Section
                Section {
                    HStack {
                        Image(systemName: "info.circle.fill")
                            .foregroundStyle(.blue)
                            .frame(width: 28)
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Image(systemName: "sparkles")
                            .foregroundStyle(.purple)
                            .frame(width: 28)
                        Text("Powered by")
                        Spacer()
                        Text("DeepSeek V3.2")
                            .foregroundStyle(.secondary)
                    }

                    Link(destination: URL(string: "https://platform.deepseek.com/docs")!) {
                        HStack {
                            Image(systemName: "book.fill")
                                .foregroundStyle(.green)
                                .frame(width: 28)
                            Text("DeepSeek Documentation")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("About")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        settings.savePreferences()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

#Preview {
    SettingsView()
        .environment(SettingsManager())
}
