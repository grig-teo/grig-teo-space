import Foundation
import CoreBluetooth

/**
 COLMI R02-family (R02 / R06 / R10) BLE protocol.

 Reverse-engineered by the colmi_r02_client project
 (github.com/tahnok/colmi_r02_client; command reference:
 colmi.puxtril.com/commands). The COLMI R10 is fully compatible with this
 family. The ring speaks a Nordic-UART-style custom service — the standard
 Heart Rate Service is NOT used.

 Packet format (both directions, always 16 bytes):
   byte 0      : opcode
   bytes 1..14 : payload ("sub data")
   byte 15     : checksum = sum(bytes 0..14) & 0xFF
 */
enum ColmiProtocol {
    // MARK: - GATT UUIDs (verified for the R02/R06/R10 family)

    /// Nordic-UART-style custom service used by the COLMI ring.
    static let serviceUUID = CBUUID(string: "6E40FFF0-B5A3-F393-E0A9-E50E24DCCA9E")
    /// Write target (app → ring).
    static let txCharacteristicUUID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    /// Notify source (ring → app).
    static let rxCharacteristicUUID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")

    /// Battery level also exists on the standard Battery Service on some
    /// firmware; the canonical way is the battery opcode below.
    static let batteryServiceUUID = CBUUID(string: "180F")
    static let batteryLevelUUID = CBUUID(string: "2A19")

    /// "Big data" channel (V2): sleep and SpO2 history travel here, as
    /// multi-packet frames with their own length header.
    static let bigDataServiceUUID = CBUUID(string: "de5bf728-d711-4e47-af26-65e3012a5dc7")
    /// Big data write target (app → ring).
    static let bigDataCommandUUID = CBUUID(string: "de5bf72a-d711-4e47-af26-65e3012a5dc7")
    /// Big data notify source (ring → app).
    static let bigDataNotifyUUID = CBUUID(string: "de5bf729-d711-4e47-af26-65e3012a5dc7")

    /// Device-name substrings to filter scan results (case-insensitive).
    /// COLMI models advertise differently — "R02_XXXX", "R10…", "A201…" —
    /// so match any known variant.
    static let nameFilters = ["COLMI", "R02", "R06", "R10", "R11", "A201"]

    /// Case-insensitive advertised-name match against `nameFilters`.
    static func matchesName(_ name: String) -> Bool {
        let upper = name.uppercased()
        return nameFilters.contains { upper.contains($0) }
    }

    // MARK: - Wire opcodes (byte 0)

    enum Opcode: UInt8 {
        case setTime = 1
        case battery = 3
        case readHeartRateLog = 21      // 0x15
        case keepAliveRealTimeHR = 30   // 0x1E
        case syncStress = 55            // 0x37
        case syncHRV = 57               // 0x39
        case getSteps = 67              // 0x43
        case startRealTime = 105        // 0x69
        case stopRealTime = 106         // 0x6A
        case notification = 115         // 0x73 — ring-pushed live data
        case bigDataV2 = 188            // 0xBC — sleep / SpO2 history frames
    }

    /// Big data frame types (byte 1 of a 0xBC frame).
    enum BigDataType: UInt8 {
        case sleep = 0x27
        case spo2 = 0x2A
    }

    /// Notification subtypes (byte 1 of an 0x73 frame).
    enum NotificationType: UInt8 {
        case newHeartRateData = 0x01
        case newSpo2Data = 0x03
        case newStepsData = 0x04
        case temperature = 0x05
        case batteryLevel = 0x0C
        case liveActivity = 0x12
        case newSleepData = 0x27
    }

    /// Logical poll commands the app uses; mapped to wire packets by the
    /// BLE manager (a realtime command is a start/continue/stop sequence,
    /// not a single opcode).
    enum Command {
        case setTime
        case battery
        case steps
        case stressLog
        case hrvLog
        case sleepLog
        case spo2Log
        case realtimeHeartRate
        case realtimeSpo2
    }

    /// Realtime stream kinds (payload byte 1 of start/stop real-time).
    /// NB: only heart rate and SpO2 are streamed — starting a realtime
    /// pressure(8)/HRV(10) stream wedges R10 firmware into silence.
    enum RealTimeKind: UInt8 {
        case heartRate = 1
        case spo2 = 3
        case stress = 8     // "pressure" in the protocol docs
        case hrv = 10
    }

    /// Realtime stream actions (payload byte 2 of start real-time).
    enum RealTimeAction: UInt8 {
        case start = 1
        case pause = 2
        case `continue` = 3
        case stop = 4
    }

    static let packetLength = 16

    /// Builds a 16-byte packet: opcode at byte 0, payload from byte 1, and
    /// the checksum (sum of the first 15 bytes & 0xFF) in the last byte.
    static func buildPacket(_ opcode: Opcode, subData: [UInt8] = []) -> Data {
        var packet = [UInt8](repeating: 0, count: packetLength)
        packet[0] = opcode.rawValue
        for (index, byte) in subData.prefix(packetLength - 2).enumerated() {
            packet[1 + index] = byte
        }
        let sum = packet.prefix(packetLength - 1).reduce(0 as UInt16) { $0 + UInt16($1) }
        packet[packetLength - 1] = UInt8(sum & 0xFF)
        return Data(packet)
    }

    // MARK: - Request packets

    /// Set the ring's internal clock (UTC, BCD). The ring timestamps its
    /// HR/step logs with this clock, so it must be sent after every connect.
    static func setTimePacket(_ date: Date = Date()) -> Data {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        func bcd(_ value: Int) -> UInt8 { UInt8(((value / 10) << 4) | (value % 10)) }
        return buildPacket(.setTime, subData: [
            bcd((c.year ?? 2000) % 100), bcd(c.month ?? 1), bcd(c.day ?? 1),
            bcd(c.hour ?? 0), bcd(c.minute ?? 0), bcd(c.second ?? 0),
            1, // language: 1 = English (0 = Chinese)
        ])
    }

    static func batteryPacket() -> Data { buildPacket(.battery) }

    /// Steps/calories/distance for a day (0 = today), answered with one
    /// packet per 15-minute slot. Trailing bytes are protocol constants.
    static func stepsPacket(dayOffset: UInt8 = 0) -> Data {
        buildPacket(.getSteps, subData: [dayOffset, 0x0f, 0x00, 0x5f, 0x01])
    }

    /// Stress (pressure) history for today: 30-minute interval values.
    static func stressPacket() -> Data { buildPacket(.syncStress) }

    /// HRV history for a day (0 = today): 30-minute interval values.
    static func hrvPacket(daysAgo: UInt8 = 0) -> Data {
        buildPacket(.syncHRV, subData: [daysAgo, 0, 0, 0])
    }

    /// Big data history request (sleep / SpO2). Sent on the V2 command
    /// characteristic; NOT a 16-byte checksummed packet.
    static func bigDataRequest(type: BigDataType) -> Data {
        Data([Opcode.bigDataV2.rawValue, type.rawValue, 0x01, 0x00, 0xFF, 0x00, 0xFF])
    }

    static func realTimePacket(kind: RealTimeKind, action: RealTimeAction) -> Data {
        buildPacket(.startRealTime, subData: [kind.rawValue, action.rawValue])
    }

    static func stopRealTimePacket(kind: RealTimeKind) -> Data {
        buildPacket(.stopRealTime, subData: [kind.rawValue, 0, 0])
    }

    // MARK: - Response parsing

    /// Realtime stream frame (opcode 105): byte 1 = kind, byte 2 = error
    /// code (0 = ok), byte 3 = value. Value 0 means the sensor is still
    /// settling — not a real reading.
    static func parseRealTime(_ bytes: [UInt8]) -> HealthReading? {
        guard bytes.count >= 4, bytes[2] == 0, bytes[3] > 0 else { return nil }
        let metric: RingMetric
        switch RealTimeKind(rawValue: bytes[1]) {
        case .heartRate: metric = .heartRate
        case .spo2: metric = .spo2
        case .stress: metric = .stress
        case .hrv: metric = .hrv
        default: return nil
        }
        return HealthReading(metric: metric, value: Double(bytes[3]))
    }

    /// Battery frame (opcode 3): byte 1 = level %, byte 2 = charging flag.
    static func parseBattery(_ bytes: [UInt8]) -> (level: Int, charging: Bool)? {
        guard bytes.count >= 3 else { return nil }
        return (Int(bytes[1]), bytes[2] != 0)
    }

    /// Live activity push (opcode 115, subtype 0x12): today's totals —
    /// steps uint24 **big-endian** at bytes 2..4, calories uint16
    /// little-endian deci-kcal (÷10) at bytes 5..6, distance (m) uint24
    /// big-endian at bytes 8..10. Displayed in the UI only; NOT emitted as
    /// readings, since the per-slot history (opcode 67) feeds the series
    /// and totals would double-count.
    static func parseLiveActivity(_ bytes: [UInt8]) -> (steps: Int, calories: Int, distanceMeters: Int)? {
        guard bytes.count >= 11 else { return nil }
        func uint24BE(_ hi: Int) -> Int {
            (Int(bytes[hi]) << 16) | (Int(bytes[hi + 1]) << 8) | Int(bytes[hi + 2])
        }
        let caloriesRaw = Int(bytes[5]) | (Int(bytes[6]) << 8)
        return (uint24BE(2), caloriesRaw / 10, uint24BE(8))
    }

    /// Temperature push (opcode 115, subtype 0x05). The frame layout is not
    /// documented; QRing reports values like 36.7 °C. Try the plausible
    /// encodings in order: uint16 LE centi-°C at bytes 2..3 (2500–4500),
    /// then a whole-°C byte at byte 2 (25–45). Returns nil when neither
    /// fits so garbage frames stay out of the series.
    static func parseTemperature(_ bytes: [UInt8]) -> Double? {
        guard bytes.count >= 4 else { return nil }
        let centi = Int(bytes[2]) | (Int(bytes[3]) << 8)
        if (2500...4500).contains(centi) {
            return Double(centi) / 100
        }
        if (25...45).contains(Int(bytes[2])) {
            return Double(bytes[2])
        }
        return nil
    }

    /// Capability flags from the set-time response (opcode 1):
    /// byte 1 = temperature sensor present.
    static func parseCapabilities(_ bytes: [UInt8]) -> Bool? {
        guard bytes.count >= 2 else { return nil }
        return bytes[1] == 1
    }
}

/**
 Stateful parser for the multi-packet steps response (opcode 67).

 The first packet (byte 1 = 0xF0) is a header announcing the calorie format;
 byte 1 = 0xFF means "no data for that day". Each following packet carries
 one 15-minute slot: BCD date, slot index, calories, steps, distance (m).
 */
final class StepsParser {
    private var newCalorieProtocol = false
    private var index = 0

    func reset() {
        newCalorieProtocol = false
        index = 0
    }

    /// Parses one packet. Returns readings for a slot, `[]` on "no data",
    /// or nil for header/continuation packets.
    func parse(_ bytes: [UInt8]) -> [HealthReading]? {
        guard bytes.count >= ColmiProtocol.packetLength else { return nil }
        if index == 0 && bytes[1] == 255 {
            reset()
            return []
        }
        if index == 0 && bytes[1] == 240 {
            newCalorieProtocol = bytes[3] == 1
            index += 1
            return nil
        }
        func bcd(_ byte: UInt8) -> Int { Int(byte >> 4) * 10 + Int(byte & 15) }
        var components = DateComponents()
        components.year = bcd(bytes[1]) + 2000
        components.month = bcd(bytes[2])
        components.day = bcd(bytes[3])
        let slot = Int(bytes[4])
        components.hour = slot / 4
        components.minute = (slot % 4) * 15
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let timestamp = calendar.date(from: components) ?? Date()

        let caloriesRaw = Int(bytes[7]) | (Int(bytes[8]) << 8)
        // New-calorie-protocol rings (R10) report centi-kcal — observed on
        // device: raw 143 for a 23-step slot = 1.43 kcal. Older firmware
        // reports plain kcal (Gadgetbridge behavior).
        let calories = newCalorieProtocol ? Double(caloriesRaw) / 100 : Double(caloriesRaw)
        let steps = Int(bytes[9]) | (Int(bytes[10]) << 8)
        let distanceMeters = Int(bytes[11]) | (Int(bytes[12]) << 8)

        // bytes[5]/[6] = packet index/count; the last packet resets the state.
        if bytes[5] == bytes[6] &- 1 { reset() } else { index += 1 }

        return [
            HealthReading(metric: .steps, value: Double(steps), recordedAt: timestamp),
            HealthReading(metric: .calories, value: calories, recordedAt: timestamp),
            HealthReading(metric: .distanceKm, value: Double(distanceMeters) / 1000, recordedAt: timestamp),
        ]
    }
}

/**
 Parser for the 30-minute-interval history logs (stress opcode 55, HRV
 opcode 57). Both share one layout:

   packet 0xFF       : "no data"
   packet 0          : header (byte 2 = total packet count)
   packet 1          : values start at byte 3
   packets 2..4      : values start at byte 2, 13 per packet
   (packet 1 carries 12 values; each value covers 30 minutes of the day)
 */
final class IntervalLogParser {
    let metric: RingMetric
    private let dayStart: Date

    init(metric: RingMetric, dayStart: Date) {
        self.metric = metric
        self.dayStart = dayStart
    }

    /// Parses one packet. Returns readings for the values it carries and a
    /// `done` flag (true on the last packet or "no data").
    func parse(_ bytes: [UInt8]) -> (readings: [HealthReading], done: Bool) {
        guard bytes.count >= 2 else { return ([], true) }
        let packetNr = Int(bytes[1])
        if packetNr == 0xFF { return ([], true) }   // no data
        if packetNr == 0 { return ([], false) }     // header

        let startIndex = packetNr == 1 ? 3 : 2
        var minutesBefore = 0
        if packetNr > 1 {
            minutesBefore = 12 * 30 + (packetNr - 2) * 13 * 30
        }
        var readings: [HealthReading] = []
        for index in startIndex..<(bytes.count - 1) where bytes[index] != 0 {
            let minuteOfDay = minutesBefore + (index - startIndex) * 30
            let timestamp = dayStart.addingTimeInterval(TimeInterval(minuteOfDay * 60))
            readings.append(HealthReading(metric: metric, value: Double(bytes[index]), recordedAt: timestamp))
        }
        return (readings, packetNr >= 4)
    }
}

/**
 Parser for sleep history (big data type 0x27). Layout of a complete,
 reassembled frame:

   bytes 0..1 : 0xBC, type
   bytes 2..3 : payload length (uint16 LE)
   byte  6    : number of days in the frame
   per day    : daysAgo(1), dayBytes(1), sleepStart uint16 LE (min after
                midnight), sleepEnd uint16 LE, then (stage, minutes) pairs

 Stage types: 2 = light, 3 = deep, 4 = REM, 5 = awake.
 */
final class SleepParser {
    struct Session {
        let start: Date
        let end: Date
        let stageMinutes: [UInt8: Int]  // stage type → minutes
    }

    /// Parses a complete big data frame into sleep sessions.
    func parse(_ bytes: [UInt8]) -> [Session] {
        guard bytes.count >= 8 else { return [] }
        let daysInPacket = Int(bytes[6])
        var index = 7
        var sessions: [Session] = []
        let calendar = Calendar.current

        for _ in 0..<daysInPacket {
            guard index + 6 <= bytes.count else { break }
            let daysAgo = Int(bytes[index]); index += 1
            let dayBytes = Int(bytes[index]); index += 1
            let sleepStart = Int(bytes[index]) | (Int(bytes[index + 1]) << 8); index += 2
            let sleepEnd = Int(bytes[index]) | (Int(bytes[index + 1]) << 8); index += 2

            guard let dayBase = calendar.date(byAdding: .day, value: -daysAgo, to: Date()).flatMap({
                calendar.startOfDay(for: $0)
            }) else { break }

            // sleepStart can exceed 1440 (before midnight of the base day).
            let start = dayBase.addingTimeInterval(TimeInterval((sleepStart - (sleepStart > sleepEnd ? 1440 : 0)) * 60))
            let end = dayBase.addingTimeInterval(TimeInterval(sleepEnd * 60))

            var stageMinutes: [UInt8: Int] = [:]
            for _ in stride(from: 4, to: dayBytes, by: 2) {
                guard index + 2 <= bytes.count else { break }
                let stage = bytes[index]
                let minutes = Int(bytes[index + 1])
                index += 2
                if minutes > 0 {
                    stageMinutes[stage, default: 0] += minutes
                }
            }
            sessions.append(Session(start: start, end: end, stageMinutes: stageMinutes))
        }
        return sessions
    }

    /// Readings for one session: duration in hours and a quality score
    /// (deep + REM share of the session, 0–100).
    func readings(for session: Session) -> [HealthReading] {
        let minutes = session.end.timeIntervalSince(session.start) / 60
        guard minutes > 0 else { return [] }
        let restorative = Double(session.stageMinutes[3, default: 0] + session.stageMinutes[4, default: 0])
        let quality = min(100, (restorative / minutes) * 100)
        return [
            HealthReading(metric: .sleepDurationH, value: minutes / 60, recordedAt: session.end),
            HealthReading(metric: .sleepQuality, value: quality, recordedAt: session.end),
        ]
    }
}

/**
 Parser for SpO2 history (big data type 0x2A). Layout after the 6-byte big
 data header: repeating blocks of daysAgo(1) followed by 24 hourly
 (min, max) pairs; the block with daysAgo == 0 (today) ends the frame.
 Values are averaged per hour.
 */
final class Spo2LogParser {
    /// Parses a complete big data frame into hourly SpO2 readings.
    func parse(_ bytes: [UInt8]) -> [HealthReading] {
        guard bytes.count >= 7 else { return [] }
        let length = Int(bytes[2]) | (Int(bytes[3]) << 8)
        var index = 6
        var readings: [HealthReading] = []
        let calendar = Calendar.current

        while index < bytes.count && index - 6 < length {
            let daysAgo = Int(bytes[index]); index += 1
            guard let dayBase = calendar.date(byAdding: .day, value: -daysAgo, to: Date()).flatMap({
                calendar.startOfDay(for: $0)
            }) else { break }
            for hour in 0..<24 {
                guard index + 2 <= bytes.count else { break }
                let minValue = bytes[index]
                let maxValue = bytes[index + 1]
                index += 2
                if minValue > 0 && maxValue > 0 {
                    let timestamp = dayBase.addingTimeInterval(TimeInterval(hour * 3600))
                    let average = (Double(minValue) + Double(maxValue)) / 2
                    readings.append(HealthReading(metric: .spo2, value: average, recordedAt: timestamp))
                }
                if index - 6 >= length { break }
            }
            if daysAgo == 0 { break }
        }
        return readings
    }
}
