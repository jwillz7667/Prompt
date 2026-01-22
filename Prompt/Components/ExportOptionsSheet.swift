//
//  ExportOptionsSheet.swift
//  Prompt
//
//  Sheet for selecting export format
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct ExportOptionsSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    let originalPrompt: String
    let enhancedPrompt: String
    let onExport: (ExportFormat) -> Void

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                // Preview
                VStack(alignment: .leading, spacing: 8) {
                    Text("Preview")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(textSecondary)

                    Text(enhancedPrompt)
                        .font(.caption)
                        .foregroundStyle(textPrimary)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(bgSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.horizontal)

                // Export Options
                VStack(spacing: 12) {
                    Text("Export As")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)

                    ForEach(ExportFormat.allCases) { format in
                        ExportOptionButton(format: format) {
                            onExport(format)
                            dismiss()
                        }
                    }
                }

                // Quick Actions
                VStack(spacing: 12) {
                    Text("Quick Actions")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)

                    HStack(spacing: 12) {
                        QuickActionButton(
                            title: "Copy",
                            icon: "doc.on.doc",
                            color: .blue
                        ) {
                            ShareService.shared.copyToClipboard(enhancedPrompt)
                            dismiss()
                        }

                        QuickActionButton(
                            title: "Share",
                            icon: "square.and.arrow.up",
                            color: .green
                        ) {
                            ShareService.shared.presentShareSheet(items: [enhancedPrompt])
                            dismiss()
                        }
                    }
                    .padding(.horizontal)
                }

                Spacer()
            }
            .padding(.top)
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Export Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(textPrimary)
                }
            }
        }
    }
}

// MARK: - Export Option Button

struct ExportOptionButton: View {
    @Environment(\.colorScheme) private var colorScheme
    let format: ExportFormat
    let action: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var borderColor: Color { Color.adaptiveBorder }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: format.icon)
                    .font(.system(size: 22))
                    .foregroundStyle(formatColor)
                    .frame(width: 44, height: 44)
                    .background(formatColor.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 2) {
                    Text(format.rawValue)
                        .font(.headline)
                        .foregroundStyle(textPrimary)

                    Text(formatDescription)
                        .font(.caption)
                        .foregroundStyle(textSecondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(textSecondary)
            }
            .padding()
            .background(bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(borderColor, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }

    private var formatColor: Color {
        switch format {
        case .text: return .blue
        case .markdown: return .purple
        case .pdf: return .red
        }
    }

    private var formatDescription: String {
        switch format {
        case .text: return "Plain text file"
        case .markdown: return "Formatted markdown"
        case .pdf: return "PDF document"
        }
    }
}

// MARK: - Quick Action Button

struct QuickActionButton: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void

    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundStyle(color)

                Text(title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(color)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(color.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    ExportOptionsSheet(
        originalPrompt: "Write a poem",
        enhancedPrompt: "You are a skilled poet. Write a poem about nature.",
        onExport: { _ in }
    )
}
