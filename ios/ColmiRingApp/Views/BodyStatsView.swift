import SwiftUI

/** Edits height (cm) and weight (kg). Values are saved to the backend via
 *  BodyStatsClient and feed the AI doctor's context. BMI is computed
 *  server-side and shown read-only. */
struct BodyStatsView: View {
    @StateObject private var client = BodyStatsClient.shared

    @State private var heightCm: Int = 185
    @State private var weightKg: Int = 94
    @State private var saving = false
    @State private var savedFlash = false

    var body: some View {
        Form {
            Section("Measurements") {
                Stepper("Height: \(heightCm) cm", value: $heightCm, in: 100...250)
                Stepper("Weight: \(weightKg) kg", value: $weightKg, in: 30...300)
            }
            if let stats = client.stats {
                Section("Computed") {
                    LabeledContent("BMI", value: String(format: "%.1f", stats.bmi))
                    let category = bmiCategory(stats.bmi)
                    LabeledContent("Category", value: category)
                }
            }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        if saving { ProgressView() }
                        Text(saving ? "Saving…" : "Save")
                    }
                }
                .disabled(saving)
                if savedFlash {
                    Text("Saved ✓").foregroundColor(.green).font(.caption)
                }
            }
            if let error = client.lastError {
                Section { Text(error).foregroundColor(.red).font(.caption) }
            }
        }
        .navigationTitle("Body Stats")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        await client.load()
        if let stats = client.stats {
            heightCm = stats.heightCm
            weightKg = stats.weightKg
        }
    }

    private func save() async {
        saving = true
        let ok = await client.save(heightCm: heightCm, weightKg: weightKg)
        saving = false
        if ok {
            savedFlash = true
            Task { try? await Task.sleep(nanoseconds: 1_500_000_000); savedFlash = false }
        }
    }

    private func bmiCategory(_ bmi: Double) -> String {
        if bmi < 18.5 { return "Underweight" }
        if bmi < 25 { return "Normal" }
        if bmi < 30 { return "Overweight" }
        return "Obese"
    }
}
