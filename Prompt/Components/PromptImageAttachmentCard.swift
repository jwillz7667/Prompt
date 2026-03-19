//
//  PromptImageAttachmentCard.swift
//  Prompt
//
//  Reusable image attachment preview for composer, thread messages, and history.
//

import SwiftUI

struct PromptImageAttachmentCard: View {
    let attachment: PromptImageAttachment
    var height: CGFloat = 160
    var showsAnalysisBadge: Bool = false
    var onRemove: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    private var accentColor: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let uiImage = attachment.uiImage {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                } else {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.adaptiveBackgroundSecondary)
                        .overlay {
                            Image(systemName: "photo")
                                .font(.system(size: 28, weight: .medium))
                                .foregroundStyle(Color.adaptiveTextSecondary)
                        }
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                HStack(spacing: 8) {
                    Label("\(attachment.width)×\(attachment.height)", systemImage: "photo")
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(.white)

                    if showsAnalysisBadge && attachment.hasAnalysis {
                        Label("Analyzed", systemImage: "sparkles")
                            .font(.system(.caption2, design: .rounded, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(.black.opacity(colorScheme == .dark ? 0.45 : 0.6))
                .clipShape(Capsule())
                .padding(12)
            }

            if let onRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.adaptiveTextOnAccent)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(accentColor)
                        )
                }
                .buttonStyle(.plain)
                .padding(10)
            }
        }
    }
}
