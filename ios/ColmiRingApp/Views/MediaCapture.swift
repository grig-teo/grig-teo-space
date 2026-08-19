import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/**
 Camera capture for journal notes (photo or video) — a thin
 * UIImagePickerController wrapper since SwiftUI has no camera view.
 */
struct CameraPicker: UIViewControllerRepresentable {
    /// Picked photo data / video file URL; nil on cancel.
    let onResult: (Data?, URL?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
        picker.videoQuality = .typeMedium
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onResult: onResult)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onResult: (Data?, URL?) -> Void

        init(onResult: @escaping (Data?, URL?) -> Void) {
            self.onResult = onResult
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any],
        ) {
            if let url = info[.mediaURL] as? URL {
                onResult(nil, url)
            } else if let image = info[.originalImage] as? UIImage {
                onResult(image.jpegData(compressionQuality: 0.85), nil)
            } else {
                onResult(nil, nil)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onResult(nil, nil)
        }
    }
}

/**
 Minimal m4a voice recorder for journal notes. Requests microphone
 * permission on first use.
 */
@MainActor
final class AudioRecorder: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var seconds = 0

    private var recorder: AVAudioRecorder?
    private var ticker: Task<Void, Never>?
    private let fileURL: URL = FileManager.default.temporaryDirectory
        .appendingPathComponent("note-\(UUID().uuidString).m4a")

    /** Starts recording; returns false when permission is denied. */
    func start() async -> Bool {
        // AVAudioApplication.requestRecordPermission is iOS 17+; the
        // AVAudioSession variant works on iOS 16.
        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                continuation.resume(returning: allowed)
            }
        }
        guard granted else { return false }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default)
        try? session.setActive(true)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        guard let recorder = try? AVAudioRecorder(url: fileURL, settings: settings) else { return false }
        self.recorder = recorder
        seconds = 0
        isRecording = recorder.record()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self, !Task.isCancelled else { return }
                self.seconds += 1
            }
        }
        return isRecording
    }

    /** Stops and returns the recorded file data (nil when empty). */
    func stop() -> Data? {
        ticker?.cancel()
        ticker = nil
        recorder?.stop()
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false)
        return try? Data(contentsOf: fileURL)
    }
}
