import Foundation

extension Date {
    /// "14:05" in the device's current timezone — always 24-hour, regardless
    /// of the system's 12/24-hour preference. Follows the user when traveling.
    var time24: String {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("HHmm")
        return formatter.string(from: self)
    }
}
