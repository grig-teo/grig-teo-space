import SwiftUI
import UIKit

/**
 Camera capture view. Presents the rear camera so the user can photograph a
 physical document. Returns the captured image to the caller.

 Uses UIImagePickerController (camera) for broad compatibility. (Vision's
 live scanner could replace this later, but photo capture is simpler and
 reliable across iOS 16+.)
 */
struct ScannerView: UIViewControllerRepresentable {
    var onCaptured: (UIImage) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        // Fall back to photo library if the device has no camera (e.g. Simulator).
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        if picker.sourceType == .camera {
            picker.cameraDevice = .rear
            picker.cameraCaptureMode = .photo
        }
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ScannerView
        init(parent: ScannerView) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            let image = info[.originalImage] as? UIImage
            picker.dismiss(animated: true)
            if let image { parent.onCaptured(image) }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
