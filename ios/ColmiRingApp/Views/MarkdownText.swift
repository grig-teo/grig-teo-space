import SwiftUI

/**
 Renders a markdown string with block + inline support, tuned for the AI
 "AI doctor" answers (bullet lists, numbered lists, code blocks, **bold**,
 headings, paragraphs). Uses Apple's `AttributedString(markdown:)` for inline
 formatting within each block — no third-party dependency.

 The previous inline-only renderer left the model's bullet lists as literal
 `- text` lines; this one parses them into real bulleted VStacks.
 */
struct MarkdownText: View {
    let text: String
    var font: Font = .body

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Block model

    private enum Block: Equatable {
        case paragraph(String)
        case heading(level: Int, String)
        case bulletList([String])
        case orderedList([String])
        case codeBlock(String)
        case quote(String)
    }

    @ViewBuilder
    private func blockView(_ block: Block) -> some View {
        switch block {
        case .paragraph(let s):
            inlineText(s, font: font)
        case .heading(let level, let s):
            inlineText(s, font: headingFont(level))
                .fontWeight(.bold)
        case .bulletList(let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .font(font)
                        inlineText(item, font: font)
                    }
                }
            }
        case .orderedList(let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(idx + 1).")
                            .font(font)
                        inlineText(item, font: font)
                    }
                }
            }
        case .codeBlock(let code):
            Text(code)
                .font(.system(.footnote, design: .monospaced))
                .foregroundColor(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.tertiarySystemBackground))
                )
        case .quote(let s):
            HStack(alignment: .top, spacing: 8) {
                Rectangle()
                    .fill(Color.secondary)
                    .frame(width: 3)
                inlineText(s, font: font)
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Inline rendering

    /// Renders inline markdown (bold, italic, code, links) via Foundation's
    /// parser, preserving whitespace within the line.
    @ViewBuilder
    private func inlineText(_ s: String, font: Font) -> some View {
        let trimmed = s.trimmingCharacters(in: .whitespaces)
        if let attributed = try? AttributedString(
            markdown: trimmed,
            options: AttributedString.MarkdownParsingOptions(
                interpretedSyntax: .inlineOnlyPreservingWhitespace
            )
        ) {
            Text(attributed).font(font)
        } else {
            Text(trimmed).font(font)
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title3
        case 2: return .headline
        default: return .subheadline
        }
    }

    // MARK: - Block parser

    /**
     Splits raw markdown into blocks. Handles:
       - ATX headings (`#`, `##`, `###`)
       - fenced code blocks (``` ... ```)
       - bullet lists (lines starting with `-`, `*`, `+`)
       - ordered lists (lines starting with `1.`, `2.`, …)
       - blockquotes (`> ...`)
       - blank-line-separated paragraphs
     Consecutive list items of the same type are grouped into one block.
     */
    private var blocks: [Block] {
        var result: [Block] = []
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var i = 0

        var pendingBullets: [String] = []
        var pendingOrdered: [String] = []
        var pendingParagraph: [String] = []

        func flushAll() {
            flushParagraph()
            flushBullets()
            flushOrdered()
        }
        func flushParagraph() {
            guard !pendingParagraph.isEmpty else { return }
            result.append(.paragraph(pendingParagraph.joined(separator: " ")))
            pendingParagraph.removeAll()
        }
        func flushBullets() {
            guard !pendingBullets.isEmpty else { return }
            result.append(.bulletList(pendingBullets))
            pendingBullets.removeAll()
        }
        func flushOrdered() {
            guard !pendingOrdered.isEmpty else { return }
            result.append(.orderedList(pendingOrdered))
            pendingOrdered.removeAll()
        }

        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Fenced code block
            if trimmed.hasPrefix("```") {
                flushAll()
                var codeLines: [String] = []
                i += 1
                while i < lines.count {
                    let cl = lines[i]
                    if cl.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                        i += 1
                        break
                    }
                    codeLines.append(cl)
                    i += 1
                }
                result.append(.codeBlock(codeLines.joined(separator: "\n")))
                continue
            }

            // Heading
            if let level = headingLevel(trimmed) {
                flushAll()
                let content = trimmed.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)
                result.append(.heading(level: level, content))
                i += 1
                continue
            }

            // Blockquote
            if trimmed.hasPrefix(">") {
                flushAll()
                let content = trimmed.dropFirst().trimmingCharacters(in: .whitespaces)
                result.append(.quote(content))
                i += 1
                continue
            }

            // Bullet list item
            if isBulletItem(trimmed) {
                flushParagraph()
                flushOrdered()
                pendingBullets.append(stripBulletPrefix(trimmed))
                i += 1
                continue
            }

            // Ordered list item
            if let item = orderedItemText(trimmed) {
                flushParagraph()
                flushBullets()
                pendingOrdered.append(item)
                i += 1
                continue
            }

            // Blank line → block boundary
            if trimmed.isEmpty {
                flushAll()
                i += 1
                continue
            }

            // Otherwise: paragraph text. Flush other block types first.
            flushBullets()
            flushOrdered()
            pendingParagraph.append(trimmed)
            i += 1
        }
        flushAll()
        return result
    }

    private func headingLevel(_ line: String) -> Int? {
        var level = 0
        for ch in line {
            if ch == "#" { level += 1 }
            else { break }
        }
        // Require a space after the #'s (e.g. "## Heading"), 1–6 deep.
        guard level >= 1, level <= 6 else { return nil }
        let rest = line.dropFirst(level)
        return rest.first == " " || rest.first == "\t" ? level : nil
    }

    private func isBulletItem(_ line: String) -> Bool {
        guard let first = line.first else { return false }
        guard "-*+".contains(first) else { return false }
        let after = line.dropFirst().trimmingCharacters(in: .whitespaces)
        return !after.isEmpty
    }

    private func stripBulletPrefix(_ line: String) -> String {
        line.dropFirst().trimmingCharacters(in: .whitespaces)
    }

    /** Returns the item text if the line is an ordered-list item, else nil. */
    private func orderedItemText(_ line: String) -> String? {
        var idx = line.startIndex
        var sawDigit = false
        while idx < line.endIndex, line[idx].isNumber {
            sawDigit = true
            idx = line.index(after: idx)
        }
        guard sawDigit, idx < line.endIndex else { return nil }
        let marker = line[idx]
        guard marker == "." || marker == ")" else { return nil }
        idx = line.index(after: idx)
        guard idx < line.endIndex, line[idx] == " " || line[idx] == "\t" else { return nil }
        let content = line[line.index(after: idx)...].trimmingCharacters(in: .whitespaces)
        return content.isEmpty ? nil : content
    }
}
