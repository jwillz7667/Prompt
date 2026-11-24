//
//  MarkdownText.swift
//  Prompt
//
//  Dependency-free Markdown rendering for assistant replies. A small
//  line-based block parser handles structure (headings, lists, quotes, code,
//  rules, tables); Foundation's inline Markdown handles emphasis, code spans
//  and links. Partial input from a live stream (e.g. an unclosed code fence)
//  always renders as the closest complete structure instead of failing.
//

import SwiftUI
import UIKit

// MARK: - Block Model

nonisolated indirect enum MarkdownBlock: Hashable, Sendable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case list(MarkdownList)
    case blockQuote([MarkdownBlock])
    case code(language: String?, code: String, isClosed: Bool)
    case table(MarkdownTable)
    case rule
}

nonisolated struct MarkdownList: Hashable, Sendable {
    struct Item: Hashable, Sendable {
        /// Nesting depth, 0 for top-level items.
        let depth: Int
        /// "•" for bullets, "3." for ordered items, a box for task items.
        let marker: String
        let text: String
    }

    let items: [Item]
}

nonisolated struct MarkdownTable: Hashable, Sendable {
    enum Alignment: Hashable, Sendable {
        case leading, center, trailing
    }

    let header: [String]
    let alignments: [Alignment]
    let rows: [[String]]

    var columnCount: Int { header.count }
}

// MARK: - Parser

nonisolated enum MarkdownParser {
    static func parse(_ source: String) -> [MarkdownBlock] {
        let lines = source
            .replacingOccurrences(of: "\r\n", with: "\n")
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
        var parser = LineParser(lines: lines)
        return parser.parseBlocks()
    }

    private struct LineParser {
        let lines: [String]
        var index = 0

        init(lines: [String]) {
            self.lines = lines
        }

        mutating func parseBlocks() -> [MarkdownBlock] {
            var blocks: [MarkdownBlock] = []
            while index < lines.count {
                let line = lines[index]
                let trimmed = line.trimmingCharacters(in: .whitespaces)

                if trimmed.isEmpty {
                    index += 1
                } else if let fence = Self.fenceOpening(trimmed) {
                    blocks.append(parseCode(fence: fence))
                } else if let heading = Self.heading(trimmed) {
                    blocks.append(heading)
                    index += 1
                } else if Self.isRule(trimmed) {
                    blocks.append(.rule)
                    index += 1
                } else if trimmed.hasPrefix(">") {
                    blocks.append(parseQuote())
                } else if Self.listItem(line) != nil {
                    blocks.append(.list(parseList()))
                } else if let table = parseTableIfPresent() {
                    blocks.append(.table(table))
                } else {
                    blocks.append(.paragraph(parseParagraph()))
                }
            }
            return blocks
        }

        // MARK: Code

        struct Fence {
            let marker: Character
            let length: Int
            let language: String?
        }

        static func fenceOpening(_ trimmed: String) -> Fence? {
            guard let first = trimmed.first, first == "`" || first == "~" else { return nil }
            let length = trimmed.prefix { $0 == first }.count
            guard length >= 3 else { return nil }
            let info = trimmed.dropFirst(length).trimmingCharacters(in: .whitespaces)
            // A backtick fence's info string may not contain backticks.
            if first == "`" && info.contains("`") { return nil }
            let language = info.split(separator: " ").first.map(String.init)
            return Fence(marker: first, length: length, language: language?.isEmpty == false ? language : nil)
        }

        mutating func parseCode(fence: Fence) -> MarkdownBlock {
            index += 1
            var body: [String] = []
            while index < lines.count {
                let trimmed = lines[index].trimmingCharacters(in: .whitespaces)
                let closingLength = trimmed.prefix { $0 == fence.marker }.count
                if closingLength >= fence.length && trimmed.count == closingLength {
                    index += 1
                    return .code(language: fence.language, code: body.joined(separator: "\n"), isClosed: true)
                }
                body.append(lines[index])
                index += 1
            }
            // Unclosed fence: still streaming (or malformed). Render what exists,
            // minus the empty line a stream leaves after its last newline.
            if body.last?.isEmpty == true { body.removeLast() }
            return .code(language: fence.language, code: body.joined(separator: "\n"), isClosed: false)
        }

        // MARK: Headings & Rules

        static func heading(_ trimmed: String) -> MarkdownBlock? {
            let hashes = trimmed.prefix { $0 == "#" }.count
            guard (1...6).contains(hashes) else { return nil }
            let rest = trimmed.dropFirst(hashes)
            guard rest.isEmpty || rest.first == " " else { return nil }
            var text = rest.trimmingCharacters(in: .whitespaces)
            // Optional closing hashes: "## Title ##"
            while text.hasSuffix("#") { text.removeLast() }
            return .heading(level: hashes, text: text.trimmingCharacters(in: .whitespaces))
        }

        static func isRule(_ trimmed: String) -> Bool {
            let compact = trimmed.replacingOccurrences(of: " ", with: "")
            guard compact.count >= 3, let first = compact.first, "-*_".contains(first) else { return false }
            return compact.allSatisfy { $0 == first }
        }

        // MARK: Quotes

        mutating func parseQuote() -> MarkdownBlock {
            var inner: [String] = []
            while index < lines.count {
                let trimmed = lines[index].trimmingCharacters(in: .whitespaces)
                guard trimmed.hasPrefix(">") else { break }
                var content = trimmed.dropFirst()
                if content.first == " " { content = content.dropFirst() }
                inner.append(String(content))
                index += 1
            }
            var nested = LineParser(lines: inner)
            return .blockQuote(nested.parseBlocks())
        }

        // MARK: Lists

        struct ListMatch {
            let indent: Int
            let marker: String
            let text: String
        }

        static func listItem(_ line: String) -> ListMatch? {
            let expanded = line.replacingOccurrences(of: "\t", with: "    ")
            let indent = expanded.prefix { $0 == " " }.count
            let body = expanded.dropFirst(indent)
            guard let first = body.first else { return nil }

            if "-*+".contains(first), body.dropFirst().first == " " {
                let text = String(body.dropFirst(2))
                if text.hasPrefix("[ ] ") {
                    return ListMatch(indent: indent, marker: "☐", text: String(text.dropFirst(4)))
                }
                if text.lowercased().hasPrefix("[x] ") {
                    return ListMatch(indent: indent, marker: "☑", text: String(text.dropFirst(4)))
                }
                return ListMatch(indent: indent, marker: "•", text: text)
            }

            let digits = body.prefix { $0.isASCII && $0.isNumber }
            guard !digits.isEmpty, digits.count <= 9 else { return nil }
            let afterDigits = body.dropFirst(digits.count)
            guard let delimiter = afterDigits.first, delimiter == "." || delimiter == ")",
                  afterDigits.dropFirst().first == " " else { return nil }
            return ListMatch(indent: indent, marker: "\(digits).", text: String(afterDigits.dropFirst(2)))
        }

        mutating func parseList() -> MarkdownList {
            var items: [MarkdownList.Item] = []
            var indentLevels: [Int] = []

            while index < lines.count {
                let line = lines[index]
                if let match = Self.listItem(line) {
                    while let last = indentLevels.last, match.indent < last { indentLevels.removeLast() }
                    if indentLevels.last != match.indent {
                        if let last = indentLevels.last, match.indent > last {
                            indentLevels.append(match.indent)
                        } else if indentLevels.isEmpty {
                            indentLevels.append(match.indent)
                        } else {
                            indentLevels[indentLevels.count - 1] = match.indent
                        }
                    }
                    items.append(.init(depth: max(0, indentLevels.count - 1), marker: match.marker, text: match.text))
                    index += 1
                    continue
                }

                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty {
                    // A blank line ends the list unless another item follows.
                    let next = index + 1
                    if next < lines.count, Self.listItem(lines[next]) != nil {
                        index += 1
                        continue
                    }
                    break
                }

                // Indented continuation of the previous item ("lazy" lines).
                let isIndented = line.first == " " || line.first == "\t"
                if isIndented, Self.fenceOpening(trimmed) == nil, let last = items.popLast() {
                    items.append(.init(depth: last.depth, marker: last.marker, text: last.text + "\n" + trimmed))
                    index += 1
                    continue
                }
                break
            }
            return MarkdownList(items: items)
        }

        // MARK: Tables

        mutating func parseTableIfPresent() -> MarkdownTable? {
            guard index + 1 < lines.count,
                  lines[index].contains("|"),
                  let alignments = Self.tableAlignments(lines[index + 1]) else { return nil }
            let header = Self.tableCells(lines[index])
            guard header.count == alignments.count, header.count >= 1 else { return nil }

            index += 2
            var rows: [[String]] = []
            while index < lines.count {
                let line = lines[index]
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard !trimmed.isEmpty, trimmed.contains("|") else { break }
                var cells = Self.tableCells(line)
                if cells.count < header.count {
                    cells += Array(repeating: "", count: header.count - cells.count)
                }
                rows.append(Array(cells.prefix(header.count)))
                index += 1
            }
            return MarkdownTable(header: header, alignments: alignments, rows: rows)
        }

        static func tableCells(_ line: String) -> [String] {
            var trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("|") { trimmed.removeFirst() }
            if trimmed.hasSuffix("|") && !trimmed.hasSuffix("\\|") { trimmed.removeLast() }

            var cells: [String] = []
            var current = ""
            var isEscaped = false
            var isInCodeSpan = false
            for character in trimmed {
                if isEscaped {
                    current.append(character)
                    isEscaped = false
                } else if character == "\\" {
                    isEscaped = true
                } else if character == "`" {
                    isInCodeSpan.toggle()
                    current.append(character)
                } else if character == "|" && !isInCodeSpan {
                    cells.append(current.trimmingCharacters(in: .whitespaces))
                    current = ""
                } else {
                    current.append(character)
                }
            }
            cells.append(current.trimmingCharacters(in: .whitespaces))
            return cells
        }

        static func tableAlignments(_ line: String) -> [MarkdownTable.Alignment]? {
            let cells = tableCells(line)
            guard !cells.isEmpty, line.contains("-") else { return nil }
            var alignments: [MarkdownTable.Alignment] = []
            for cell in cells {
                let compact = cell.replacingOccurrences(of: " ", with: "")
                guard !compact.isEmpty,
                      compact.allSatisfy({ $0 == "-" || $0 == ":" }),
                      compact.contains("-") else { return nil }
                let leading = compact.hasPrefix(":")
                let trailing = compact.hasSuffix(":")
                switch (leading, trailing) {
                case (true, true): alignments.append(.center)
                case (false, true): alignments.append(.trailing)
                default: alignments.append(.leading)
                }
            }
            return alignments
        }

        // MARK: Paragraphs

        mutating func parseParagraph() -> String {
            var paragraph: [String] = []
            while index < lines.count {
                let line = lines[index]
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty { break }
                if !paragraph.isEmpty {
                    let startsBlock = Self.fenceOpening(trimmed) != nil
                        || Self.heading(trimmed) != nil
                        || Self.isRule(trimmed)
                        || trimmed.hasPrefix(">")
                        || Self.listItem(line) != nil
                        || (trimmed.contains("|") && index + 1 < lines.count && Self.tableAlignments(lines[index + 1]) != nil)
                    if startsBlock { break }
                }
                paragraph.append(trimmed)
                index += 1
            }
            return paragraph.joined(separator: "\n")
        }
    }
}

// MARK: - Inline Rendering

nonisolated enum MarkdownInline {
    /// Emphasis, code spans and links. Falls back to the literal text when
    /// the input is not valid Markdown (common mid-stream).
    static func attributed(_ text: String, codeBackground: Color) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: false,
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        guard var attributed = try? AttributedString(markdown: text, options: options) else {
            return AttributedString(text)
        }
        for run in attributed.runs {
            guard let intent = run.inlinePresentationIntent, intent.contains(.code) else { continue }
            attributed[run.range].swiftUI.font = Font.system(.callout, design: .monospaced)
            attributed[run.range].swiftUI.backgroundColor = codeBackground
        }
        return attributed
    }
}

// MARK: - Views

struct MarkdownText: View {
    let source: String

    var body: some View {
        let blocks = MarkdownParser.parse(source)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                MarkdownBlockView(block: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock

    @Environment(\.colorScheme) private var colorScheme

    private var codeSpanBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.1) : Color.brandPurple.opacity(0.08)
    }

    private var accent: Color {
        colorScheme == .dark ? Color.brandCyan : Color.brandPurple
    }

    var body: some View {
        switch block {
        case .heading(let level, let text):
            inline(text)
                .font(headingFont(level))
                .padding(.top, level <= 2 ? 4 : 0)
                .accessibilityAddTraits(.isHeader)

        case .paragraph(let text):
            inline(text)
                .font(.system(.body, design: .default))

        case .list(let list):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(list.items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.marker)
                            .font(.system(.body).monospacedDigit())
                            .foregroundStyle(item.marker == "•" ? accent : Color.adaptiveTextSecondary)
                            .frame(minWidth: 16, alignment: .trailing)
                            .accessibilityHidden(item.marker == "•")
                        inline(item.text)
                            .font(.body)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.leading, CGFloat(item.depth) * 18)
                }
            }

        case .blockQuote(let blocks):
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(accent.opacity(0.6))
                    .frame(width: 3)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(blocks.enumerated()), id: \.offset) { _, inner in
                        MarkdownBlockView(block: inner)
                    }
                }
                .foregroundStyle(Color.adaptiveTextSecondary)
            }
            .fixedSize(horizontal: false, vertical: true)

        case .code(let language, let code, _):
            MarkdownCodeBlock(language: language, code: code)

        case .table(let table):
            MarkdownTableView(table: table, codeBackground: codeSpanBackground)

        case .rule:
            LiquidGlassDivider()
                .padding(.vertical, 4)
                .accessibilityHidden(true)
        }
    }

    private func inline(_ text: String) -> Text {
        Text(MarkdownInline.attributed(text, codeBackground: codeSpanBackground))
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .system(.title2, design: .rounded, weight: .bold)
        case 2: return .system(.title3, design: .rounded, weight: .bold)
        case 3: return .system(.headline, design: .rounded, weight: .semibold)
        default: return .system(.subheadline, design: .rounded, weight: .semibold)
        }
    }
}

// MARK: - Code Block

struct MarkdownCodeBlock: View {
    let language: String?
    let code: String

    @Environment(\.colorScheme) private var colorScheme
    @State private var didCopy = false

    private var surface: Color {
        colorScheme == .dark ? Color(red: 22/255, green: 22/255, blue: 26/255) : Color(red: 246/255, green: 245/255, blue: 252/255)
    }

    private var headerSurface: Color {
        colorScheme == .dark ? Color.white.opacity(0.06) : Color.brandPurple.opacity(0.06)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(language?.lowercased() ?? String(localized: "code"))
                    .font(.system(.caption, design: .monospaced, weight: .medium))
                    .foregroundStyle(Color.adaptiveTextSecondary)
                Spacer()
                Button(action: copy) {
                    Label(didCopy ? String(localized: "Copied") : String(localized: "Copy"),
                          systemImage: didCopy ? "checkmark" : "doc.on.doc")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(didCopy ? Color.adaptiveButtonPrimary : Color.adaptiveTextSecondary)
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(didCopy ? String(localized: "Code copied") : String(localized: "Copy code"))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(headerSurface)

            ScrollView(.horizontal, showsIndicators: false) {
                Text(code.isEmpty ? " " : code)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(Color.adaptiveTextPrimary)
                    .fixedSize(horizontal: true, vertical: true)
                    .padding(12)
            }
            .accessibilityLabel(code)
        }
        .background(surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.adaptiveBorder.opacity(0.5), lineWidth: 0.5)
        }
    }

    private func copy() {
        UIPasteboard.general.string = code
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.spring(response: 0.3)) { didCopy = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.easeOut(duration: 0.2)) { didCopy = false }
        }
    }
}

// MARK: - Table

private struct MarkdownTableView: View {
    let table: MarkdownTable
    let codeBackground: Color

    @Environment(\.colorScheme) private var colorScheme

    private var headerSurface: Color {
        colorScheme == .dark ? Color.white.opacity(0.08) : Color.brandPurple.opacity(0.07)
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(0..<table.columnCount, id: \.self) { column in
                        cell(table.header[column], column: column)
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .background(headerSurface)
                    }
                }
                ForEach(Array(table.rows.enumerated()), id: \.offset) { _, row in
                    Divider()
                    GridRow {
                        ForEach(0..<table.columnCount, id: \.self) { column in
                            cell(row[column], column: column)
                                .font(.subheadline)
                        }
                    }
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Color.adaptiveBorder.opacity(0.6), lineWidth: 0.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func cell(_ text: String, column: Int) -> some View {
        Text(MarkdownInline.attributed(text, codeBackground: codeBackground))
            .foregroundStyle(Color.adaptiveTextPrimary)
            .multilineTextAlignment(textAlignment(column))
            .frame(minWidth: 64, maxWidth: 280, alignment: frameAlignment(column))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .gridColumnAlignment(horizontalAlignment(column))
    }

    private func alignment(_ column: Int) -> MarkdownTable.Alignment {
        column < table.alignments.count ? table.alignments[column] : .leading
    }

    private func textAlignment(_ column: Int) -> TextAlignment {
        switch alignment(column) {
        case .leading: return .leading
        case .center: return .center
        case .trailing: return .trailing
        }
    }

    private func frameAlignment(_ column: Int) -> Alignment {
        switch alignment(column) {
        case .leading: return .leading
        case .center: return .center
        case .trailing: return .trailing
        }
    }

    private func horizontalAlignment(_ column: Int) -> HorizontalAlignment {
        switch alignment(column) {
        case .leading: return .leading
        case .center: return .center
        case .trailing: return .trailing
        }
    }
}
