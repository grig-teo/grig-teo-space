import SwiftUI

/**
 Journal: all logged notes (text, photos, videos, voice) with what the
 * pipeline extracted from them — vision descriptions for photos, speech
 * transcripts and visual summaries for video. Photos render inline via
 * the device-key-guarded proxy.
 */
struct JournalView: View {
    @StateObject private var client = InsightsClient.shared

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if client.notes.isEmpty {
                    Text("No notes yet — log how you feel or what you eat from the Profile page or Telegram.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                ForEach(client.notes) { note in
                    NoteCard(note: note)
                }
            }
            .padding()
        }
        .navigationTitle("Journal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .task { await client.loadNotes() }
    }
}

private struct NoteCard: View {
    let note: InsightsClient.JournalNote

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(note.date?.formatted(.dateTime.day().month(.abbreviated).hour().minute()) ?? "")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                sourceBadge
            }
            Text(note.content)
                .font(.callout)
            if note.hasMedia {
                mediaBlock
            }
            if let extracted = note.mediaNote, !extracted.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Extracted")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(extracted)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .italic()
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(.tertiarySystemBackground)))
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    @ViewBuilder
    private var sourceBadge: some View {
        let label = note.mediaType ?? note.source
        Text(label)
            .font(.caption2)
            .foregroundColor(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color(.tertiarySystemBackground)))
    }

    @ViewBuilder
    private var mediaBlock: some View {
        switch note.mediaType {
        case "photo":
            NotePhoto(noteId: note.id)
        case "video":
            Label("Video attached", systemImage: "video.fill")
                .font(.caption)
                .foregroundColor(.secondary)
        case "audio":
            Label("Voice note", systemImage: "waveform")
                .font(.caption)
                .foregroundColor(.secondary)
        default:
            EmptyView()
        }
    }
}

/** A note's photo loaded through the guarded media proxy. */
private struct NotePhoto: View {
    let noteId: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .task {
            guard let data = await InsightsClient.shared.noteMediaData(noteId) else { return }
            image = UIImage(data: data)
        }
    }
}
