import SwiftUI

/** Edits height (cm) and weight (kg). Values are auto-saved to the backend via
 *  BodyStatsClient (no Save button) and feed the AI doctor's context. BMI is
 *  computed server-side and shown read-only. */
struct BodyStatsView: View {
    @StateObject private var client = BodyStatsClient.shared

    @State private var heightCm: Int = 185
    @State private var weightKg: Int = 94
    /// True only after the initial load has populated the steppers, so the
    /// auto-save doesn't fire from the load itself.
    @State private var ready = false
    @State private var debouncer: Task<Void, Never>?

    var body: some View {
        Form {
            Section("Measurements") {
                Stepper("Height: \(heightCm) cm", value: $heightCm, in: 100...250)
                    .onChange(of: heightCm) { _ in scheduleSave() }
                Stepper("Weight: \(weightKg) kg", value: $weightKg, in: 30...300)
                    .onChange(of: weightKg) { _ in scheduleSave() }
            }
            if let stats = client.stats {
                Section("Computed") {
                    LabeledContent("BMI", value: String(format: "%.1f", stats.bmi))
                    let category = bmiCategory(stats.bmi)
                    LabeledContent("Category", value: category)
                }
            }
            if let error = client.lastError {
                Section { Text(error).foregroundColor(.red).font(.caption) }
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        await client.load()
        if let stats = client.stats {
            heightCm = stats.heightCm
            weightKg = stats.weightKg
        }
        ready = true
    }

    /// Debounces the save so rapid stepper taps coalesce into one upload.
    private func scheduleSave() {
        guard ready else { return }
        debouncer?.cancel()
        debouncer = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await client.save(heightCm: heightCm, weightKg: weightKg)
        }
    }

    private func bmiCategory(_ bmi: Double) -> String {
        if bmi < 18.5 { return "Underweight" }
        if bmi < 25 { return "Normal" }
        if bmi < 30 { return "Overweight" }
        return "Obese"
    }
}
