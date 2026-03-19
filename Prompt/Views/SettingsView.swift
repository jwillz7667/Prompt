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
    @StateObject private var unreadManager = UnreadMessageManager.shared

    @State private var showSupport = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    // App version from bundle
    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    var body: some View {
        @Bindable var bindableSettings = settings

        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                VStack(spacing: 0) {
                    PromptPageHeader(
                        title: "Settings",
                        subtitle: "Tune how Promptomize looks and generates prompts",
                        onLeadingTap: {
                            settings.savePreferences()
                            dismiss()
                        }
                    )
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

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
                                    .foregroundStyle(accentColor)
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
                                .foregroundStyle(accentColor)
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
                                .tint(accentColor)
                        }

                        HStack {
                            Image(systemName: "number.square.fill")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)
                            Stepper("Max Tokens: \(settings.maxTokens)", value: $bindableSettings.maxTokens, in: 1024...65536, step: 1024)
                                .foregroundStyle(textPrimary)
                        }
                        
                        HStack {
                            Image(systemName: "character.cursor.ibeam")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)
                            Text("Target Length")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            if let targetLength = settings.targetCharacterLength {
                                Text("\(targetLength) chars")
                                    .font(.caption)
                                    .foregroundStyle(textSecondary)
                            }
                            TextField("Optional", value: $bindableSettings.targetCharacterLength, format: .number)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 100)
                                .multilineTextAlignment(.trailing)
                                .keyboardType(.numberPad)
                        }
                    } header: {
                        Text("Generation Settings")
                            .foregroundStyle(textSecondary)
                    } footer: {
                        Text("Higher temperature = more creative responses. Target length enforces specific character count in the enhanced prompt.")
                            .foregroundStyle(textSecondary)
                    }

                    // Custom Instructions Section
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: "text.bubble.fill")
                                    .foregroundStyle(accentColor)
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
                                    .foregroundStyle(accentColor)
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

                    // Support Section
                    Section {
                        Button {
                            showSupport = true
                            unreadManager.markAllAsRead()
                        } label: {
                            HStack {
                                ZStack(alignment: .topTrailing) {
                                    Image(systemName: "bubble.left.and.bubble.right.fill")
                                        .foregroundStyle(accentColor)
                                        .frame(width: 28)

                                    if unreadManager.hasUnreadMessages {
                                        Circle()
                                            .fill(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                                            .frame(width: 12, height: 12)
                                            .overlay(
                                                Text(unreadManager.unreadCount > 9 ? "9+" : "\(unreadManager.unreadCount)")
                                                    .font(.system(size: 8, weight: .bold))
                                                    .foregroundStyle(Color.white)
                                            )
                                            .offset(x: 6, y: -4)
                                    }
                                }
                                Text("Contact Support")
                                    .foregroundStyle(textPrimary)
                                Spacer()

                                if unreadManager.hasUnreadMessages {
                                    Text("New")
                                        .font(.caption2)
                                        .fontWeight(.semibold)
                                        .foregroundStyle(Color.white)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                                        .clipShape(Capsule())
                                }

                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(textSecondary)
                            }
                        }
                    } header: {
                        Text("Help")
                            .foregroundStyle(textSecondary)
                    } footer: {
                        Text("Chat with our AI assistant or create a support ticket.")
                            .foregroundStyle(textSecondary)
                    }

                    // About Section
                    Section {
                        HStack {
                            Image(systemName: "info.circle.fill")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)
                            Text("Version")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Text(appVersion)
                                .foregroundStyle(textSecondary)
                        }

                        HStack {
                            Image(systemName: "sparkles")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)
                            Text("Powered by")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Text("DeepSeek AI")
                                .foregroundStyle(textSecondary)
                        }
                    } header: {
                        Text("About")
                            .foregroundStyle(textSecondary)
                    }
                }
                    .scrollContentBackground(.hidden)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: settings.appearanceMode) { _, _ in
                // Save appearance immediately for instant feedback
                settings.savePreferences()
            }
            // Apply color scheme directly so this view updates immediately on toggle
            .preferredColorScheme(settings.appearanceMode.colorScheme)
            .sheet(isPresented: $showSupport) {
                SupportView()
            }
        }
    }
}

#Preview {
    SettingsView()
        .environment(SettingsManager())
}
