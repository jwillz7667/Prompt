//
//  AppSurfacePicker.swift
//  Prompt
//
//  Top-level switch between the prompt optimizer and the assistant chat.
//  Lives in the header row of both surfaces so it is visible on iPhone and
//  iPad without opening any menu.
//

import SwiftUI

enum AppSurface: String, CaseIterable, Identifiable, Sendable {
    case optimize
    case chat

    var id: String { rawValue }

    var title: String {
        switch self {
        case .optimize: return String(localized: "Optimize")
        case .chat: return String(localized: "Chat")
        }
    }

    var systemImage: String {
        switch self {
        case .optimize: return "wand.and.stars"
        case .chat: return "bubble.left.and.text.bubble.right"
        }
    }

    var keyboardShortcut: KeyEquivalent {
        switch self {
        case .optimize: return "1"
        case .chat: return "2"
        }
    }
}

struct AppSurfacePicker: View {
    @Binding var selection: AppSurface

    @Environment(\.colorScheme) private var colorScheme
    @Namespace private var highlight

    var body: some View {
        HStack(spacing: 2) {
            ForEach(AppSurface.allCases) { surface in
                segment(surface)
            }
        }
        .padding(3)
        .background {
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(colorScheme == .dark ? Color.white.opacity(0.08) : Color.white.opacity(0.7))
            }
        }
        .overlay {
            Capsule().stroke(
                colorScheme == .dark ? Color.white.opacity(0.18) : Color.white.opacity(0.95),
                lineWidth: 1
            )
        }
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.35 : 0.1), radius: 8, y: 3)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text("Mode"))
    }

    private func segment(_ surface: AppSurface) -> some View {
        let isSelected = selection == surface
        return Button {
            guard selection != surface else { return }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                selection = surface
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: surface.systemImage)
                    .font(.system(size: 12, weight: .semibold))
                    .accessibilityHidden(true)
                Text(surface.title)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isSelected ? Color.adaptiveTextOnAccent : Color.adaptiveTextSecondary)
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background {
                if isSelected {
                    Capsule()
                        .fill(Color.adaptiveButtonPrimary)
                        .matchedGeometryEffect(id: "selection", in: highlight)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(surface.keyboardShortcut, modifiers: .command)
        .accessibilityLabel(Text(surface.title))
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
        .accessibilityIdentifier("surface.\(surface.rawValue)")
    }
}
