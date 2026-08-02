import Testing
import Foundation
@testable import ColmiRingApp

/**
 Tests for the pure protocol functions in `ColmiProtocol` + `StepsParser`.

 These pin the reverse-engineered R02/R06/R10 wire format (see
 colmi_r02_client / colmi.puxtril.com): opcode at byte 0, payload from
 byte 1, checksum = sum(bytes 0..14) & 0xFF. Any silent drift in the frame
 layout will fail here.
 */
@MainActor
struct ColmiProtocolTests {

    // MARK: - buildPacket

    @Test
    func packetIsAlwaysFixedLength() {
        for opcode in [
            ColmiProtocol.Opcode.setTime, .battery, .getSteps,
            .startRealTime, .stopRealTime,
        ] {
            let packet = ColmiProtocol.buildPacket(opcode)
            #expect(packet.count == ColmiProtocol.packetLength, "opcode \(opcode.rawValue) produced wrong length")
        }
    }

    @Test
    func opcodePlacedAtByteZero() {
        let packet = ColmiProtocol.buildPacket(.battery)
        #expect(packet[0] == 3)
    }

    @Test
    func payloadIsPlacedStartingAtByteOne() {
        let packet = ColmiProtocol.buildPacket(.battery, subData: [0xAB, 0xCD])
        #expect(packet[1] == 0xAB)
        #expect(packet[2] == 0xCD)
    }

    @Test
    func checksumIsSumOfFirstFifteenMod256() {
        let packet = ColmiProtocol.buildPacket(.startRealTime, subData: [1, 1])
        let sumOfFirst15 = packet.prefix(ColmiProtocol.packetLength - 1).reduce(0) { $0 + Int($1) }
        #expect(sumOfFirst15 == 107)
        #expect(packet[ColmiProtocol.packetLength - 1] == UInt8(sumOfFirst15 & 0xFF))
    }

    @Test
    func packetIsZeroPaddedBeyondPayload() {
        let packet = ColmiProtocol.buildPacket(.battery, subData: [0xFF])
        #expect(packet[2] == 0x00)
        #expect(packet[13] == 0x00)
    }

    // MARK: - Request packets

    @Test
    func setTimePacketEncodesUTCAsBCD() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let date = calendar.date(from: DateComponents(
            year: 2026, month: 7, day: 15, hour: 4, minute: 30, second: 45,
        ))!
        let packet = ColmiProtocol.setTimePacket(date)
        #expect(packet[0] == 1)     // set-time opcode
        #expect(packet[1] == 0x26)  // year 2026 → 26 BCD
        #expect(packet[2] == 0x07)  // July
        #expect(packet[3] == 0x15)  // 15th (BCD)
        #expect(packet[4] == 0x04)  // hour
        #expect(packet[5] == 0x30)  // minute (BCD)
        #expect(packet[6] == 0x45)  // second (BCD)
        #expect(packet[7] == 1)     // language: English
    }

    @Test
    func stepsPacketCarriesProtocolConstants() {
        let packet = ColmiProtocol.stepsPacket(dayOffset: 0)
        #expect(packet[0] == 67)    // 0x43
        #expect([UInt8](packet[1...5]) == [0x00, 0x0F, 0x00, 0x5F, 0x01])
    }

    @Test
    func realTimePacketsCarryKindAndAction() {
        let start = ColmiProtocol.realTimePacket(kind: .heartRate, action: .start)
        #expect(start[0] == 105 && start[1] == 1 && start[2] == 1)
        let cont = ColmiProtocol.realTimePacket(kind: .spo2, action: .continue)
        #expect(cont[0] == 105 && cont[1] == 3 && cont[2] == 3)
        let stop = ColmiProtocol.stopRealTimePacket(kind: .spo2)
        #expect(stop[0] == 106 && stop[1] == 3)
    }

    // MARK: - Response parsing

    @Test
    func parsesRealTimeHeartRate() {
        let reading = ColmiProtocol.parseRealTime([0x69, 0x01, 0x00, 72])
        #expect(reading?.metric == "heart_rate")
        #expect(reading?.value == 72)
    }

    @Test
    func parsesRealTimeSpo2() {
        let reading = ColmiProtocol.parseRealTime([0x69, 0x03, 0x00, 97])
        #expect(reading?.metric == "spo2")
        #expect(reading?.value == 97)
    }

    @Test
    func realTimeRejectsErrorsAndSettlingValues() {
        #expect(ColmiProtocol.parseRealTime([0x69, 0x01, 0x01, 72]) == nil) // error code
        #expect(ColmiProtocol.parseRealTime([0x69, 0x01, 0x00, 0]) == nil)  // sensor settling
        #expect(ColmiProtocol.parseRealTime([0x69, 0x01]) == nil)           // too short
        #expect(ColmiProtocol.parseRealTime([]) == nil)
    }

    @Test
    func parsesBatteryFrame() {
        let info = ColmiProtocol.parseBattery([0x03, 85, 1])
        #expect(info?.level == 85)
        #expect(info?.charging == true)
        #expect(ColmiProtocol.parseBattery([0x03]) == nil)
    }

    // MARK: - StepsParser

    @Test
    func stepsParserHandlesHeaderThenSlot() {
        let parser = StepsParser()
        // Header: byte 1 = 0xF0, byte 3 = 1 → new calorie protocol.
        var header = [UInt8](repeating: 0, count: 16)
        header[0] = 0x43; header[1] = 0xF0; header[3] = 0x01
        #expect(parser.parse(header) == nil)

        // One slot: 2026-07-15, slot 16 (04:00), last packet of the batch.
        var slot = [UInt8](repeating: 0, count: 16)
        slot[0] = 0x43
        slot[1] = 0x26; slot[2] = 0x07; slot[3] = 0x15   // BCD date
        slot[4] = 16                                     // time index → 04:00
        slot[5] = 0; slot[6] = 1                         // index 0 of 1 → last
        slot[7] = 100; slot[8] = 0                       // calories 100 (×10 new protocol)
        slot[9] = 44; slot[10] = 1                       // steps 300
        slot[11] = 244; slot[12] = 1                     // distance 500 m
        let readings = parser.parse(slot)

        #expect(readings?.count == 3)
        let steps = readings?.first { $0.metric == "steps" }
        #expect(steps?.value == 300)
        let calories = readings?.first { $0.metric == "calories" }
        #expect(calories?.value == 1000)
        let distance = readings?.first { $0.metric == "distance_km" }
        #expect(distance?.value == 0.5)

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let expected = calendar.date(from: DateComponents(year: 2026, month: 7, day: 15, hour: 4, minute: 0))
        #expect(steps?.recordedAt == expected)
    }

    @Test
    func stepsParserHandlesNoData() {
        let parser = StepsParser()
        var packet = [UInt8](repeating: 0, count: 16)
        packet[0] = 0x43; packet[1] = 0xFF
        #expect(parser.parse(packet)?.isEmpty == true)
    }
}
