import Foundation
import CoreBluetooth

/**
 The COLMI R11's exact Bluetooth protocol is not publicly documented.

 This file bundles **all** GATT UUIDs and packet-building logic in one place,
 based on the reverse-engineered COLMI R02 family (the closest documented
 sibling — see github.com/tahnok/colmi_r02_client and Gadgetbridge PR #3896).
 COLMI rings commonly use a Nordic-UART-style custom service rather than the
 standard Heart Rate Service (0x180D), which is why generic fitness apps can't
 read their data.

 ── HOW TO VERIFY / RETUNE FOR THE REAL R11 ──────────────────────────────────
 1. Install **nRF Connect for Mobile** on your phone.
 2. Pair the ring through the official COLMI / QRing app and perform a reading.
 3. In nRF Connect, connect to the ring and watch which characteristics get
    notified/written while the official app reads HR / SpO2.
 4. Update the UUIDs and command opcodes below to match what you observed.
 Everything that could differ between the R02 and the R11 lives in this file.
 */

enum ColmiProtocol {
    // MARK: - GATT UUIDs (R02-family defaults — verify with nRF Connect)

    /// Nordic-UART-style custom service used by the COLMI ring.
    static let serviceUUID = CBUUID(string: "6E40FFF0-B5A3-F393-E0A9-E50E24DCCA9E")
    /// Write target (app → ring).
    static let txCharacteristicUUID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    /// Notify source (ring → app).
    static let rxCharacteristicUUID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")

    /// Battery level uses the standard Battery Service.
    static let batteryServiceUUID = CBUUID(string: "180F")
    static let batteryLevelUUID = CBUUID(string: "2A19")

    /// Device-name substring to filter scan results (case-insensitive).
    static let nameFilter = "R11"

    // MARK: - Packet format

    /** COLMI rings use a fixed 16-byte packet.
     Bytes 0..2 : header prefix (0x00, 0x00 — placeholder for the real ring's sync bytes)
     Byte  3    : command type / opcode
     Bytes 4..14: payload
     Byte  15   : checksum = sum of the previous 15 bytes mod 255

     The exact header and opcodes must be confirmed by sniffing the real ring.
     The values below are R02-family derived and structured for easy editing.
     */
    static let packetLength = 16

    /// Command opcodes (R02-derived — confirm against the R11).
    enum Command: UInt8 {
        case realtimeHeartRate = 0x06
        case realtimeSpo2 = 0x57
        case historyFetch = 0x17
        case battery = 0x04
    }

    /// Builds a 16-byte request packet for the given command.
    static func buildPacket(command: Command, payload: [UInt8] = []) -> Data {
        var packet = [UInt8](repeating: 0x00, count: packetLength)
        packet[2] = command.rawValue
        for (index, byte) in payload.prefix(packetLength - 4).enumerated() {
            packet[3 + index] = byte
        }
        let checksum = packet.prefix(packetLength - 1).reduce(0, &+)
        packet[packetLength - 1] = UInt8(checksum % 255)
        return Data(packet)
    }
}
