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
        slot[7] = 100; slot[8] = 0                       // calories raw 100 → 1.0 kcal (centi-kcal)
        slot[9] = 44; slot[10] = 1                       // steps 300
        slot[11] = 244; slot[12] = 1                     // distance 500 m
        let readings = parser.parse(slot)

        #expect(readings?.count == 3)
        let steps = readings?.first { $0.metric == "steps" }
        #expect(steps?.value == 300)
        let calories = readings?.first { $0.metric == "calories" }
        #expect(calories?.value == 1.0)
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

// MARK: - History parsers (stress/HRV intervals, sleep, SpO2, live activity)

@MainActor
struct ColmiHistoryParserTests {

    @Test
    func intervalLogParsesThirtyMinuteValues() {
        let dayStart = Calendar.current.startOfDay(for: Date())
        let parser = IntervalLogParser(metric: .stress, dayStart: dayStart)

        // Header packet: not done, no readings.
        var header = [UInt8](repeating: 0, count: 16)
        header[0] = 0x37; header[1] = 0; header[2] = 4
        let headerResult = parser.parse(header)
        #expect(headerResult.readings.isEmpty && !headerResult.done)

        // Packet 1: values start at byte 3; byte 3 = 40 → 00:00, byte 4 = 55 → 00:30.
        var packet1 = [UInt8](repeating: 0, count: 16)
        packet1[0] = 0x37; packet1[1] = 1; packet1[3] = 40; packet1[4] = 55
        let (readings, done) = parser.parse(packet1)
        #expect(!done)
        #expect(readings.count == 2)
        #expect(readings[0].metric == "stress" && readings[0].value == 40)
        #expect(readings[0].recordedAt == dayStart)
        #expect(readings[1].value == 55)
        #expect(readings[1].recordedAt == dayStart.addingTimeInterval(30 * 60))

        // Packet 4: values start at byte 2 and mark the end.
        var packet4 = [UInt8](repeating: 0, count: 16)
        packet4[0] = 0x37; packet4[1] = 4; packet4[2] = 70
        let last = parser.parse(packet4)
        #expect(last.done)
        // (12 + 2*13) * 30 minutes before packet 4's first value
        #expect(last.readings.first?.value == 70)
    }

    @Test
    func intervalLogHandlesNoData() {
        let parser = IntervalLogParser(metric: .hrv, dayStart: Date())
        var packet = [UInt8](repeating: 0, count: 16)
        packet[0] = 0x39; packet[1] = 0xFF
        let noData = parser.parse(packet)
        #expect(noData.readings.isEmpty && noData.done)
    }

    @Test
    func sleepParserReadsSessionAndStages() {
        let parser = SleepParser()
        var frame = [UInt8](repeating: 0, count: 17)
        frame[0] = 0xBC; frame[1] = 0x27
        frame[2] = 10; frame[3] = 0        // payload length (unused by parser)
        frame[6] = 1                        // one day
        frame[7] = 1                        // daysAgo = 1
        frame[8] = 8                        // dayBytes = 8 → 2 stage pairs
        frame[9] = 0x64; frame[10] = 0x05   // sleepStart = 1380 min (23:00)
        frame[11] = 0xA4; frame[12] = 0x01  // sleepEnd = 420 min (07:00)
        frame[13] = 3; frame[14] = 120      // deep 120 min
        frame[15] = 4; frame[16] = 120      // REM 120 min

        let sessions = parser.parse(frame)
        #expect(sessions.count == 1)
        guard let session = sessions.first else { return }

        // 23:00 → 07:00 next morning = 8 h
        #expect(session.end.timeIntervalSince(session.start) == 8 * 3600)
        #expect(session.stageMinutes[3] == 120)
        #expect(session.stageMinutes[4] == 120)

        let readings = parser.readings(for: session)
        let duration = readings.first { $0.metric == "sleep_duration_h" }
        #expect(duration?.value == 8.0)
        let quality = readings.first { $0.metric == "sleep_quality" }
        #expect(quality?.value == 50) // (120 + 120) / 480 * 100
    }

    @Test
    func spo2LogParsesHourlyAverages() {
        let parser = Spo2LogParser()
        var frame: [UInt8] = [0xBC, 0x2A, 49, 0, 0, 0, 0] // length 49, daysAgo = 0 (today)
        for _ in 0..<24 { frame.append(95); frame.append(99) }
        let readings = parser.parse(frame)
        // Hours in the future are dropped, so only today's elapsed hours remain.
        let hoursElapsed = Calendar.current.component(.hour, from: Date()) + 1
        #expect(readings.count == hoursElapsed)
        #expect(readings.first?.metric == "spo2")
        #expect(readings.first?.value == 97)
        let dayStart = Calendar.current.startOfDay(for: Date())
        #expect(readings.last?.recordedAt == dayStart.addingTimeInterval(TimeInterval((hoursElapsed - 1) * 3600)))
    }

    @Test
    func parsesLiveActivityTotals() {
        var bytes = [UInt8](repeating: 0, count: 16)
        bytes[0] = 0x73; bytes[1] = 0x12
        bytes[2] = 0x12; bytes[3] = 0x34; bytes[4] = 0x56   // steps 0x123456 (BE24)
        bytes[8] = 0x00; bytes[9] = 0x03; bytes[10] = 0xE8  // calories 1000 → 100
        bytes[11] = 0x00; bytes[12] = 0x27; bytes[13] = 0x10 // distance 10000 m
        let live = ColmiProtocol.parseLiveActivity(bytes)
        #expect(live?.steps == 0x123456)
        #expect(live?.calories == 100)
        #expect(live?.distanceMeters == 10000)
    }

    @Test
    func liveActivityDoesNotExplodeOnSmallValues() {
        // Real frame from an R10: 0x2B steps (43), not 0x2B0000 (2.8M).
        var bytes = [UInt8](repeating: 0, count: 16)
        bytes[0] = 0x73; bytes[1] = 0x12
        bytes[4] = 0x2B
        bytes[10] = 0x32 // 50 deci-kcal → 5 kcal
        bytes[13] = 0x26 // 38 m
        let live = ColmiProtocol.parseLiveActivity(bytes)
        #expect(live?.steps == 43)
        #expect(live?.calories == 5)
        #expect(live?.distanceMeters == 38)
    }

    @Test
    func parsesRealTimeStressAndHrv() {
        let stress = ColmiProtocol.parseRealTime([0x69, 0x08, 0x00, 42])
        #expect(stress?.metric == "stress" && stress?.value == 42)
        let hrv = ColmiProtocol.parseRealTime([0x69, 0x0A, 0x00, 55])
        #expect(hrv?.metric == "hrv" && hrv?.value == 55)
    }
}

@MainActor
struct ColmiHealthCheckTests {
    @Test
    func parsesHealthCheckFrame() {
        // Real R10 frame: HR 82, RR 654 ms (temperature field present but
        // intentionally not surfaced).
        let check = ColmiProtocol.parseHealthCheck([0x69, 0x05, 0x00, 0x52, 0x80, 0x55, 0x8E, 0x02])
        #expect(check?.heartRate == 82)
        #expect(check?.rrMs == 654)
    }

    @Test
    func parsesTemperatureCapability() {
        #expect(ColmiProtocol.parseCapabilities([0x01, 0x01]) == true)
        #expect(ColmiProtocol.parseCapabilities([0x01, 0x00]) == false)
        #expect(ColmiProtocol.parseCapabilities([0x01]) == nil)
    }

    @Test
    func healthCheckSkipsWarmupAndErrors() {
        // Sensor warming up (temperature zero) → nil.
        #expect(ColmiProtocol.parseHealthCheck([0x69, 0x05, 0x00, 0x00, 0x00, 0x00, 0xD3, 0x02]) == nil)
        // Error code set → nil.
        #expect(ColmiProtocol.parseHealthCheck([0x69, 0x05, 0x01, 0x52, 0x80, 0x55, 0x8E, 0x02]) == nil)
        // Too short → nil.
        #expect(ColmiProtocol.parseHealthCheck([0x69, 0x05, 0x00]) == nil)
    }
}
