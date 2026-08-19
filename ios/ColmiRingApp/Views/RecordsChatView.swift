import SwiftUI

/**
 AI doctor chat: ask questions about your scanned health documents.
 Talks to /api/health-docs/chat (DeepSeek on the backend). The answers are
 grounded in the OCR text of your uploaded documents.
 */
struct RecordsChatView: View {
    @StateObject private var client = DocumentsClient.shared
    @Environment(\.dismiss) private var dismiss

    @State private var messages: [ChatMessage] = []
    @State private var input: String = ""
    @State private var isSending = false
    @State private var error: String?
    @State private var scrollProxy: ScrollViewProxy?
    @FocusState private var inputFocused: Bool

    private let sessionId = DocumentsClient.chatSessionId

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(messages) { msg in
                                ChatBubble(role: msg.role, text: msg.content)
                                    .id(msg.id)
                            }
                            if isSending {
                                HStack {
                                    ProgressView()
                                    Text("Analyzing your records…")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                                .padding()
                            }
                            if let error {
                                Text(error)
                                    .font(.caption)
                                    .foregroundColor(.red)
                                    .padding()
                            }
                        }
                        .padding()
                    }
                    // Tapping anywhere outside the input dismisses the keyboard.
                    .onTapGesture { inputFocused = false }
                    .scrollDismissesKeyboard(.interactively)
                    .onAppear { scrollProxy = proxy }
                    .onChange(of: messages.count) { _ in
                        // A fresh AI answer scrolls to its TOP so you read it
                        // from the start; your own message scrolls to bottom.
                        guard let last = messages.last else { return }
                        let isAnswer = last.role == "assistant"
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: isAnswer ? .top : .bottom)
                        }
                    }
                }

                Divider()
                inputBar
            }
            .navigationTitle("AI Doctor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await loadHistory() }
        .onDisappear { client.markChatRead() }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Ask about your health records…", text: $input, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
                .focused($inputFocused)
            Button {
                send()
            } label: {
                Image(systemName: "paperplane.fill")
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(input.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : Color.accentColor))
            }
            .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || isSending)
        }
        .padding()
        .background(Color(.systemBackground))
    }

    private func loadHistory() async {
        do {
            messages = try await client.history(sessionId: sessionId)
        } catch {
            // Silent — history just starts empty.
        }
        // Open at the first unread AI answer (its top); fully read chats
        // open at the bottom.
        let lastRead = client.chatLastReadAt
        let target = messages.first {
            $0.role == "assistant" && ($0.date ?? .distantPast) > lastRead
        } ?? messages.last
        if let target {
            try? await Task.sleep(nanoseconds: 100_000_000)
            scrollProxy?.scrollTo(target.id, anchor: target.role == "assistant" ? .top : .bottom)
        }
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, !isSending else { return }
        input = ""
        error = nil
        messages.append(ChatMessage(role: "user", content: text, createdAt: nil))
        isSending = true

        // Keep the request alive if the app is backgrounded mid-answer; the
        // backend also stores the answer, so a killed app still gets it via
        // history + the unread badge.
        let bgTask = UIApplication.shared.beginBackgroundTask()
        Task {
            do {
                let answer = try await client.chat(message: text, sessionId: sessionId)
                messages.append(ChatMessage(role: "assistant", content: answer, createdAt: nil))
            } catch {
                self.error = error.localizedDescription
            }
            isSending = false
            UIApplication.shared.endBackgroundTask(bgTask)
        }
    }
}

/** A left-aligned (assistant) or right-aligned (user) chat bubble. */
struct ChatBubble: View {
    let role: String
    let text: String

    private var isUser: Bool { role == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer() }
            // Assistant answers contain markdown (bold, bullets, line breaks)
            // from the AI doctor; user messages are plain text.
            Group {
                if isUser {
                    Text(text)
                } else {
                    MarkdownText(text: text)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isUser ? Color.accentColor : Color(.secondarySystemBackground))
            )
            .foregroundColor(isUser ? .white : .primary)
            if !isUser { Spacer() }
        }
    }
}
