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
        case getSteps = 67              // 0x43
        case startRealTime = 105        // 0x69
        case stopRealTime = 106         // 0x6A
    }

    /// Logical poll commands the app uses; mapped to wire packets by the
    /// BLE manager (a realtime command is a start/continue/stop sequence,
    /// not a single opcode).
    enum Command {
        case setTime
        case battery
        case steps
        case realtimeHeartRate
        case realtimeSpo2
    }

    /// Realtime stream kinds (payload byte 1 of start/stop real-time).
    enum RealTimeKind: UInt8 {
        case heartRate = 1
        case spo2 = 3
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
        default: return nil
        }
        return HealthReading(metric: metric, value: Double(bytes[3]))
    }

    /// Battery frame (opcode 3): byte 1 = level %, byte 2 = charging flag.
    static func parseBattery(_ bytes: [UInt8]) -> (level: Int, charging: Bool)? {
        guard bytes.count >= 3 else { return nil }
        return (Int(bytes[1]), bytes[2] != 0)
    }

    /// Hex dump for the on-screen traffic log.
    static func hex(_ data: Data) -> String {
        data.map { String(format: "%02X", $0) }.joined(separator: " ")
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

        var calories = Int(bytes[7]) | (Int(bytes[8]) << 8)
        if newCalorieProtocol { calories *= 10 }
        let steps = Int(bytes[9]) | (Int(bytes[10]) << 8)
        let distanceMeters = Int(bytes[11]) | (Int(bytes[12]) << 8)

        // bytes[5]/[6] = packet index/count; the last packet resets the state.
        if bytes[5] == bytes[6] &- 1 { reset() } else { index += 1 }

        return [
            HealthReading(metric: .steps, value: Double(steps), recordedAt: timestamp),
            HealthReading(metric: .calories, value: Double(calories), recordedAt: timestamp),
            HealthReading(metric: .distanceKm, value: Double(distanceMeters) / 1000, recordedAt: timestamp),
        ]
    }
}
