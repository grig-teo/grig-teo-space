import SwiftUI

/**
 Renders a markdown string using Apple's built-in Foundation parser
 (`AttributedString(markdown:)`). Supports **bold**, *italics*, `code`,
 ~~strikethrough~~, [links](url), and preserves line breaks — the formatting
 GLM uses in its medical answers.

 No third-party dependency; works on iOS 15+ (we target 16+).
 */
struct MarkdownText: View {
    let text: String
    var font: Font = .body

    var body: some View {
        if let attributed = try? AttributedString(
            markdown: text,
            options: AttributedString.MarkdownParsingOptions(
                interpretedSyntax: .inlineOnlyPreservingWhitespace
            )
        ) {
            Text(attributed)
                .font(font)
        } else {
            // Fall back to plain text if parsing fails (shouldn't happen,
            // but never show a blank bubble).
            Text(text)
                .font(font)
        }
    }
}
