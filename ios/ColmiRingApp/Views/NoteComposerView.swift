import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/**
 Note composer sheet (Profile FAB): write how you feel, or attach a photo,
 * video, or voice/audio file. Media goes to the private bucket; the backend
 * transcribes speech (Whisper) and describes visuals (vision model / k3),
 * so the hourly tips and AI doctor see the content, not just a marker.
 */
struct NoteComposerView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var text = ""
    @State private var attachment: PickedMedia?
    @State private var isSaving = false
    @State private var showAudioPicker = false
    @State private var photoItem: PhotosPickerItem?
    @State private var error: String?

    private let client = InsightsClient.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                TextField("How do you feel? What did you eat?", text: $text, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(3...6)

                if let attachment {
                    HStack {
                        Image(systemName: attachment.icon)
                        Text(attachment.name)
                            .font(.caption)
                            .lineLimit(1)
                        Spacer()
                        Button {
                            self.attachment = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemBackground)))
                }

                HStack(spacing: 12) {
                    PhotosPicker(selection: $photoItem, matching: .any(of: [.images, .videos])) {
                        Label("Photo / Video", systemImage: "photo.on.rectangle")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        showAudioPicker = true
                    } label: {
                        Label("Audio", systemImage: "waveform")
                    }
                    .buttonStyle(.bordered)
                }

                if let error {
                    Text(error).font(.caption).foregroundColor(.red)
                }
                Spacer()
            }
            .padding()
            .navigationTitle("New note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isSaving ? "Saving…" : "Save") { save() }
                        .disabled(isSaving || (text.trimmingCharacters(in: .whitespaces).isEmpty && attachment == nil))
                }
            }
            .onChange(of: photoItem) { item in
                if let item { loadPicked(item) }
            }
            .fileImporter(
                isPresented: $showAudioPicker,
                allowedContentTypes: [.audio],
            ) { result in
                if case .success(let url) = result { loadAudio(url) }
            }
        }
    }

    private struct PickedMedia {
        let data: Data
        let name: String
        let mime: String
        let kind: String // "photo" | "video" | "audio"
        let ext: String

        var icon: String {
            switch kind {
            case "video": return "video.fill"
            case "audio": return "waveform"
            default: return "photo"
            }
        }
    }

    private func loadPicked(_ item: PhotosPickerItem) {
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else {
                error = "Could not read the file"
                return
            }
            let types = item.supportedContentTypes
            let isVideo = types.contains(where: { $0.conforms(to: .movie) })
            let ext = isVideo ? "mp4" : "jpg"
            attachment = PickedMedia(
                data: data,
                name: isVideo ? "video.\(ext)" : "photo.\(ext)",
                mime: isVideo ? "video/mp4" : "image/jpeg",
                kind: isVideo ? "video" : "photo",
                ext: ext,
            )
        }
    }

    private func loadAudio(_ url: URL) {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            error = "Could not read the audio file"
            return
        }
        attachment = PickedMedia(
            data: data,
            name: url.lastPathComponent,
            mime: "audio/\(url.pathExtension.isEmpty ? "m4a" : url.pathExtension)",
            kind: "audio",
            ext: url.pathExtension.isEmpty ? "m4a" : url.pathExtension,
        )
    }

    private func save() {
        isSaving = true
        error = nil
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            var mediaKey: String?
            var mediaType: String?
            if let attachment {
                mediaKey = await client.uploadNoteMedia(
                    attachment.data,
                    filename: "note.\(attachment.ext)",
                    mime: attachment.mime,
                )
                guard mediaKey != nil else {
                    error = "Media upload failed"
                    isSaving = false
                    return
                }
                mediaType = attachment.kind
            }
            let content = clean.isEmpty ? "(\(mediaType ?? "note"))" : clean
            let ok = await client.addNote(content, mediaKey: mediaKey, mediaType: mediaType)
            isSaving = false
            if ok { dismiss() } else { error = "Save failed — check the connection" }
        }
    }
}
