import Testing
import Foundation
@testable import ColmiRingApp

/**
 Tests for the pure protocol functions `ColmiProtocol.buildPacket` and
 `ColmiProtocol.parse`.

 These pin the current R02-derived byte layout so that retuning for the real
 R11 (after sniffing with nRF Connect) is a deliberate, reviewable change —
 any silent drift in the frame layout will fail here.

 The byte offsets are derived from the COLMI R02 family; see ColmiProtocol.swift
 for the verification procedure.
 */
@MainActor
struct ColmiProtocolTests {

    // MARK: - buildPacket

    @Test
    func packetIsAlwaysFixedLength() {
        for command in [
            ColmiProtocol.Command.realtimeHeartRate,
            .realtimeSpo2,
            .historyFetch,
            .battery,
        ] {
            let packet = ColmiProtocol.buildPacket(command: command)
            #expect(packet.count == ColmiProtocol.packetLength, "command \(command.rawValue) produced wrong length")
        }
    }

    @Test
    func commandOpcodePlacedAtByteTwo() {
        // Per the packet format: byte 2 holds the command opcode.
        let packet = ColmiProtocol.buildPacket(command: .realtimeHeartRate)
        #expect(packet[2] == ColmiProtocol.Command.realtimeHeartRate.rawValue)
    }

    @Test
    func payloadIsPlacedStartingAtByteThree() {
        let packet = ColmiProtocol.buildPacket(command: .battery, payload: [0xAB, 0xCD])
        #expect(packet[3] == 0xAB)
        #expect(packet[4] == 0xCD)
    }

    @Test
    func checksumIsSumModulo255() {
        let packet = ColmiProtocol.buildPacket(command: .realtimeSpo2, payload: [0x01, 0x02])
        let sumOfFirst15 = packet.prefix(ColmiProtocol.packetLength - 1).reduce(0) { $0 + Int($1) }
        #expect(packet[ColmiProtocol.packetLength - 1] == UInt8(sumOfFirst15 % 255))
    }

    @Test
    func packetIsZeroPaddedBeyondPayload() {
        // Bytes after the payload and before the checksum stay zero.
        let packet = ColmiProtocol.buildPacket(command: .battery, payload: [0xFF])
        #expect(packet[4] == 0x00)
        #expect(packet[13] == 0x00)
    }

    // MARK: - parse

    @Test
    func parsesHeartRateNotify() {
        // byte 0 = command echo (0x06 = realtimeHeartRate), byte 1 = bpm value.
        let payload = Data([ColmiProtocol.Command.realtimeHeartRate.rawValue, 72])
        let reading = ColmiProtocol.parse(payload)
        #expect(reading?.metric == "heart_rate")
        #expect(reading?.value == 72)
    }

    @Test
    func parsesSpo2Notify() {
        let payload = Data([ColmiProtocol.Command.realtimeSpo2.rawValue, 97])
        let reading = ColmiProtocol.parse(payload)
        #expect(reading?.metric == "spo2")
        #expect(reading?.value == 97)
    }

    @Test
    func parseRejectsTooShortPayload() {
        // A single byte can't carry command + value.
        #expect(ColmiProtocol.parse(Data([0x06])) == nil)
        #expect(ColmiProtocol.parse(Data()) == nil)
    }

    @Test
    func parseRejectsUnknownCommandByte() {
        // 0x00 is not a recognized realtime command opcode.
        let payload = Data([0x00, 50])
        #expect(ColmiProtocol.parse(payload) == nil)
    }
}
