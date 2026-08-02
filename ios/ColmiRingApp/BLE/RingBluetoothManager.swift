import Foundation
import CoreBluetooth
import Combine

/**
 CoreBluetooth manager for the COLMI ring.

 Real device flow:
   scan → connect → discover ColmiProtocol.serviceUUID → subscribe to RX
   (notify) → write command packets to TX → parse notified RX frames into
   readings. Wire format lives in ColmiProtocol.swift (R02/R06/R10 family).
 */
final class RingBluetoothManager: NSObject, ObservableObject, RingDataSource {
    /// Connection phases. Aliased to the shared `RingConnectionState` so this
    /// manager can be used wherever `any RingDataSource` is expected.
    typealias ConnectionState = RingConnectionState

    /// Stable identifier CoreBluetooth uses to relaunch this app in the
    /// background after it has been killed, so the BLE link can be restored.
    static let restorationIdentifier = "space.grig-teo.colmi-ring.ble"

    @Published private(set) var state: ConnectionState = .disconnected
    @Published private(set) var deviceName: String?
    @Published private(set) var rssi: Int?
    @Published private(set) var batteryLevel: Int?
    @Published private(set) var lastReadingAt: Date?
    @Published var lastError: String?

    /// Last raw packets exchanged with the ring (newest last, capped), shown
    /// on the Ring page so collected data is visible before it is uploaded.
    @Published private(set) var traffic: [String] = []

    /** New readings are published here; the API client drains them. */
    let readings = PassthroughSubject<HealthReading, Never>()

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var txCharacteristic: CBCharacteristic?
    private var rxCharacteristic: CBCharacteristic?
    private var batteryCharacteristic: CBCharacteristic?
    /// Big data (V2) channel: sleep / SpO2 history.
    private var bigDataCommandCharacteristic: CBCharacteristic?
    private var bigDataNotifyCharacteristic: CBCharacteristic?
    /// Reassembly buffer for big data frames split across notifications.
    private var bigDataBuffer = Data()
    private var bigDataExpectedLength: Int?
    /// Pending fallback that restarts the scan without a service filter.
    private var scanFallback: DispatchWorkItem?
    /// Pending "ring not found" hint shown after a long fruitless scan.
    private var scanHint: DispatchWorkItem?
    /// Guards the one-shot full sync that runs after characteristics are up.
    private var didRunInitialSync = false
    /// Multi-packet steps response state.
    private let stepsParser = StepsParser()
    /// Stress / HRV 30-minute-interval history state (recreated per request).
    private var intervalLogParser: IntervalLogParser?
    private let sleepParser = SleepParser()
    private let spo2LogParser = Spo2LogParser()
    /// Realtime stream currently active on the ring (HR / SpO2 / stress / HRV).
    private var activeRealTime: ColmiProtocol.RealTimeKind?

    override init() {
        super.init()
        // The restore identifier opts the central manager into State
        // Restoration: iOS preserves the connection across app suspension and
        // can relaunch the app in the background to deliver BLE events even
        // after the app was killed. `delegateProxy` is `self`.
        self.central = CBCentralManager(
            delegate: self,
            queue: nil,
            options: [
                CBCentralManagerOptionRestoreIdentifierKey: Self.restorationIdentifier,
                CBCentralManagerOptionShowPowerAlertKey: false,
            ],
        )
    }

    func connect() {
        lastError = nil
        guard central?.state == .poweredOn else {
            state = .disconnected
            return
        }
        // If we already hold a peripheral (e.g. restored), try reconnecting
        // directly instead of scanning again.
        if let peripheral, peripheral.state != .connected {
            state = .connecting
            central?.connect(peripheral, options: [
                CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
                CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            ])
            return
        }
        // If iOS holds a system-level connection to the ring (e.g. another
        // app bonded it for ANCS), the ring does not advertise — grab it
        // directly instead of scanning for something invisible.
        let systemConnected = central?.retrieveConnectedPeripherals(
            withServices: [ColmiProtocol.serviceUUID],
        ) ?? []
        if let known = systemConnected.first(where: { $0.name.map(ColmiProtocol.matchesName) == true }) {
            peripheral = known
            known.delegate = self
            deviceName = known.name
            state = .connecting
            central?.connect(known, options: [
                CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
                CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            ])
            return
        }
        state = .scanning
        central?.scanForPeripherals(
            withServices: [ColmiProtocol.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false],
        )
        // Some COLMI models (e.g. the R10) don't put the custom service UUID
        // in their advertisement, so a service-filtered scan never sees them.
        // After a grace period, fall back to an unfiltered scan — the name
        // filter in didDiscover still rejects non-COLMI devices. (Unfiltered
        // scans only run in the foreground; pairing is a foreground flow.)
        let fallback = DispatchWorkItem { [weak self] in
            guard let self, self.state == .scanning, self.peripheral == nil else { return }
            self.central?.stopScan()
            self.central?.scanForPeripherals(
                withServices: nil,
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false],
            )
            // Still nothing after the wide scan: the ring is almost
            // certainly held by another app — tell the user what to do
            // instead of spinning forever. Scanning continues meanwhile.
            let hint = DispatchWorkItem { [weak self] in
                guard let self, self.state == .scanning, self.peripheral == nil else { return }
                self.lastError = "Ring not found. Another app (e.g. QRing) may be holding the connection — force-close it, keep the ring near the phone, and wait a few seconds."
            }
            self.scanHint = hint
            DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: hint)
        }
        scanFallback = fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: fallback)
    }

    func disconnect() {
        scanFallback?.cancel()
        scanFallback = nil
        scanHint?.cancel()
        scanHint = nil
        if state == .scanning { central?.stopScan() }
        if let peripheral { central?.cancelPeripheralConnection(peripheral) }
        state = .disconnected
    }

    /// Poll the ring with a logical command (see `ColmiProtocol.Command`).
    /// Realtime commands manage the ring's streaming state: starting a
    /// different kind stops the current stream first; repeating the same
    /// kind sends a "continue" keep-alive.
    func requestRealtimeReading(command: ColmiProtocol.Command = .realtimeHeartRate) {
        switch command {
        case .setTime:
            write(ColmiProtocol.setTimePacket(), "Set ring time")
        case .battery:
            write(ColmiProtocol.batteryPacket(), "Request battery")
        case .steps:
            stepsParser.reset()
            write(ColmiProtocol.stepsPacket(dayOffset: 0), "Request today's activity")
        case .stressLog:
            intervalLogParser = IntervalLogParser(metric: .stress, dayStart: Calendar.current.startOfDay(for: Date()))
            write(ColmiProtocol.stressPacket(), "Request stress history")
        case .hrvLog:
            intervalLogParser = IntervalLogParser(metric: .hrv, dayStart: Calendar.current.startOfDay(for: Date()))
            write(ColmiProtocol.hrvPacket(daysAgo: 0), "Request HRV history")
        case .sleepLog:
            writeBigData(ColmiProtocol.bigDataRequest(type: .sleep), "Request sleep history")
        case .spo2Log:
            writeBigData(ColmiProtocol.bigDataRequest(type: .spo2), "Request blood oxygen history")
        case .realtimeHeartRate:
            startRealTime(kind: .heartRate)
        case .realtimeSpo2:
            startRealTime(kind: .spo2)
        case .realtimeStress:
            startRealTime(kind: .stress)
        case .realtimeHrv:
            startRealTime(kind: .hrv)
        }
    }

    /// Display name for a realtime stream kind.
    private func realTimeName(_ kind: ColmiProtocol.RealTimeKind) -> String {
        switch kind {
        case .heartRate: return "heart rate"
        case .spo2: return "blood oxygen"
        case .stress: return "stress"
        case .hrv: return "HRV"
        }
    }

    /// Start (or keep alive) a realtime stream, switching kinds if needed.
    private func startRealTime(kind: ColmiProtocol.RealTimeKind) {
        if activeRealTime == kind {
            write(ColmiProtocol.realTimePacket(kind: kind, action: .continue), "Continue realtime \(realTimeName(kind))")
        } else {
            if let previous = activeRealTime {
                write(ColmiProtocol.stopRealTimePacket(kind: previous), "Stop realtime \(realTimeName(previous))")
            }
            write(ColmiProtocol.realTimePacket(kind: kind, action: .start), "Start realtime \(realTimeName(kind))")
            activeRealTime = kind
        }
    }

    /**
     Fire every read the ring supports, staggered so the firmware isn't
     overwhelmed. Runs once per connection: set the ring clock (logs are
     timestamped by it), battery, today's activity, then the stress / HRV /
     SpO2 / sleep histories, and finally start the realtime heart-rate
     stream.
     */
    func startFullSync() {
        let schedule: [(seconds: TimeInterval, command: ColmiProtocol.Command)] = [
            (0.0, .setTime),
            (0.3, .battery),
            (0.6, .steps),
            (3.0, .stressLog),
            (6.0, .hrvLog),
            (9.0, .spo2Log),
            (12.0, .sleepLog),
            (16.0, .realtimeHeartRate),
        ]
        for (delay, command) in schedule {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.state == .connected else { return }
                self.requestRealtimeReading(command: command)
            }
        }
    }

    // MARK: - Packet I/O

    private func write(_ packet: Data, _ label: String) {
        guard let peripheral, let txCharacteristic else { return }
        logTraffic("→ \(label)")
        peripheral.writeValue(packet, for: txCharacteristic, type: .withResponse)
    }

    private func writeBigData(_ packet: Data, _ label: String) {
        guard let peripheral, let bigDataCommandCharacteristic else { return }
        logTraffic("→ \(label)")
        peripheral.writeValue(packet, for: bigDataCommandCharacteristic, type: .withResponse)
    }

    private func emit(_ reading: HealthReading) {
        lastReadingAt = Date()
        readings.send(reading)
    }

    /// Human-readable line for one parsed reading (e.g. "Heart rate: 72 bpm").
    private func describe(_ reading: HealthReading) -> String {
        guard let metric = RingMetric(rawValue: reading.metric) else {
            return "\(reading.metric): \(Int(reading.value))"
        }
        let value: String
        switch metric {
        case .distanceKm:
            value = String(format: "%.2f", reading.value)
        case .sleepDurationH, .bodyTemperature:
            value = String(format: "%.1f", reading.value)
        case .sleepQuality:
            value = "\(Int(reading.value))"
        default:
            value = "\(Int(reading.value))"
        }
        return "\(metric.displayName): \(value)\(metric.unit.isEmpty ? "" : " \(metric.unit)")"
    }

    /// Appends a log line, collapsing consecutive duplicates into a ×N
    /// suffix (e.g. repeated "Battery: 57%" while polling).
    private func logTraffic(_ line: String) {
        if let last = traffic.last {
            let (base, count) = splitRepeat(last)
            if base == line {
                traffic[traffic.count - 1] = "\(base) (×\(count + 1))"
                return
            }
        }
        traffic.append(line)
        if traffic.count > 30 {
            traffic.removeFirst(traffic.count - 30)
        }
    }

    /// Splits "line (×N)" back into ("line", N); plain lines give (line, 1).
    private func splitRepeat(_ line: String) -> (String, Int) {
        guard let open = line.lastIndex(of: "("), line.hasSuffix(")"),
              let number = Int(line[line.index(after: open)..<line.index(before: line.endIndex)].dropFirst()) else {
            return (line, 1)
        }
        return (String(line[..<open]).trimmingCharacters(in: .whitespaces), number)
    }
}

extension RingBluetoothManager: CBCentralManagerDelegate {
    /// Called by CoreBluetooth when iOS relaunches the app in the background
    /// to deliver events for a central manager that outlived the app. We
    /// reconstruct the peripheral and re-attach as its delegate so the link
    /// keeps working without user interaction.
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
            for peripheral in peripherals where peripheral.name.map(ColmiProtocol.matchesName) == true {
                self.peripheral = peripheral
                peripheral.delegate = self
                self.deviceName = peripheral.name
                self.state = peripheral.state == .connected ? .connected : .disconnected
            }
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            // If we were restored with a known peripheral, re-establish the
            // link automatically (this is the background-relaunch path).
            if state == .disconnected, peripheral != nil {
                connect()
            }
        case .poweredOff:
            state = .disconnected
            lastError = "Bluetooth is powered off"
        case .unauthorized:
            state = .failed
            lastError = "Bluetooth permission denied"
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any],
                        rssi RSSI: NSNumber) {
        // Match by advertised name (COLMI R10/R11 variants).
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        guard ColmiProtocol.matchesName(name) else { return }
        scanFallback?.cancel()
        scanFallback = nil
        scanHint?.cancel()
        scanHint = nil
        central.stopScan()
        self.peripheral = peripheral
        self.peripheral?.delegate = self
        self.deviceName = name
        self.rssi = RSSI.intValue
        self.state = .connecting
        central.connect(peripheral)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        state = .connected
        peripheral.discoverServices([
            ColmiProtocol.serviceUUID,
            ColmiProtocol.batteryServiceUUID,
            ColmiProtocol.bigDataServiceUUID,
        ])
    }

    func centralManager(_ central: CBCentralManager,
                        didFailToConnect peripheral: CBPeripheral,
                        error: Error?) {
        state = .failed
        lastError = error?.localizedDescription ?? "Failed to connect"
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral,
                        error: Error?) {
        state = .disconnected
        didRunInitialSync = false
        activeRealTime = nil
        stepsParser.reset()
        intervalLogParser = nil
        bigDataBuffer.removeAll()
        bigDataExpectedLength = nil
        if let error { lastError = error.localizedDescription }
    }
}

extension RingBluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error { lastError = error.localizedDescription; return }
        for service in peripheral.services ?? [] {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        if let error { lastError = error.localizedDescription; return }
        for characteristic in service.characteristics ?? [] {
            switch characteristic.uuid {
            case ColmiProtocol.txCharacteristicUUID:
                txCharacteristic = characteristic
            case ColmiProtocol.rxCharacteristicUUID:
                rxCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            case ColmiProtocol.batteryLevelUUID:
                batteryCharacteristic = characteristic
                peripheral.readValue(for: characteristic)
            case ColmiProtocol.bigDataCommandUUID:
                bigDataCommandCharacteristic = characteristic
            case ColmiProtocol.bigDataNotifyUUID:
                bigDataNotifyCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            default:
                break
            }
        }
        // Both channels up → pull everything once (guarded so repeated
        // discovery callbacks don't re-fire).
        if txCharacteristic != nil && rxCharacteristic != nil && !didRunInitialSync {
            didRunInitialSync = true
            startFullSync()
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard let data = characteristic.value else { return }
        if characteristic.uuid == ColmiProtocol.batteryLevelUUID {
            batteryLevel = Int(data.first ?? 0)
            return
        }
        if characteristic.uuid == ColmiProtocol.bigDataNotifyUUID {
            handleBigData(data)
            return
        }
        guard characteristic.uuid == ColmiProtocol.rxCharacteristicUUID else { return }

        let bytes = [UInt8](data)
        guard let opcode = bytes.first, let kind = ColmiProtocol.Opcode(rawValue: opcode) else { return }
        switch kind {
        case .battery:
            if let info = ColmiProtocol.parseBattery(bytes) {
                batteryLevel = info.level
                logTraffic("← Battery: \(info.level)%\(info.charging ? " (charging)" : "")")
            }
        case .startRealTime:
            if let reading = ColmiProtocol.parseRealTime(bytes) {
                emit(reading)
                logTraffic("← \(describe(reading))")
            }
            // Frames with error codes or settling values (0) are skipped
            // silently — they flood the log while a stream warms up.
        case .getSteps:
            if let slotReadings = stepsParser.parse(bytes) {
                if slotReadings.isEmpty {
                    logTraffic("← Activity: no data for today")
                } else {
                    slotReadings.forEach(emit)
                    logTraffic("← \(describeSlot(slotReadings))")
                }
            }
            // Header/continuation frames carry no slot data — skip.
        case .syncStress, .syncHRV:
            handleIntervalLog(bytes)
        case .notification:
            guard bytes.count >= 2 else { break }
            switch bytes[1] {
            case ColmiProtocol.NotificationType.liveActivity.rawValue:
                if let live = ColmiProtocol.parseLiveActivity(bytes) {
                    logTraffic("← Live: \(live.steps) steps · \(live.calories) kcal · \(live.distanceMeters) m today")
                }
            case ColmiProtocol.NotificationType.temperature.rawValue:
                if let celsius = ColmiProtocol.parseTemperature(bytes) {
                    let reading = HealthReading(metric: .bodyTemperature, value: celsius)
                    emit(reading)
                    logTraffic("← \(describe(reading))")
                } else {
                    // Unknown layout — log raw so the encoding can be pinned.
                    logTraffic("← Temperature frame: \(ColmiProtocol.hex(data))")
                }
            default:
                logTraffic("← Notify 0x\(String(bytes[1], radix: 16, uppercase: true)): \(ColmiProtocol.hex(data))")
            }
        case .setTime:
            if let supportsTemperature = ColmiProtocol.parseCapabilities(bytes) {
                logTraffic("← Ring time set · temperature sensor: \(supportsTemperature ? "yes" : "no")")
            } else {
                logTraffic("← Ring time set")
            }
        case .bigDataV2:
            handleBigData(data)
        default:
            logTraffic("← Unknown frame (0x\(String(opcode, radix: 16, uppercase: true)))")
        }
    }

    /// Stress / HRV history packet: feed the shared interval parser, emit
    /// readings, and log the batch when it completes.
    private func handleIntervalLog(_ bytes: [UInt8]) {
        guard let parser = intervalLogParser else { return }
        let (batch, done) = parser.parse(bytes)
        batch.forEach(emit)
        if done {
            let name = parser.metric == .stress ? "Stress" : "HRV"
            logTraffic(batch.isEmpty
                ? "← \(name) history: no data for today"
                : "← \(name) history: \(batch.count) values, latest \(describe(batch.last!))")
            intervalLogParser = nil
        }
    }

    /// Big data frames (sleep / SpO2 history) can span multiple
    /// notifications: reassemble by the length header, then parse.
    private func handleBigData(_ data: Data) {
        bigDataBuffer.append(data)
        if bigDataExpectedLength == nil, bigDataBuffer.count >= 4 {
            let length = Int(bigDataBuffer[2]) | (Int(bigDataBuffer[3]) << 8)
            bigDataExpectedLength = length + 6 // 6-byte frame header
        }
        guard let expected = bigDataExpectedLength, bigDataBuffer.count >= expected else { return }
        let frame = [UInt8](bigDataBuffer.prefix(expected))
        bigDataBuffer.removeAll(keepingCapacity: false)
        bigDataExpectedLength = nil

        guard frame.count >= 2, frame[0] == ColmiProtocol.Opcode.bigDataV2.rawValue,
              let type = ColmiProtocol.BigDataType(rawValue: frame[1]) else { return }
        switch type {
        case .sleep:
            let sessions = sleepParser.parse(frame)
            if sessions.isEmpty {
                logTraffic("← Sleep: no data")
            }
            for session in sessions {
                let readings = sleepParser.readings(for: session)
                readings.forEach(emit)
                let deep = session.stageMinutes[3, default: 0]
                let rem = session.stageMinutes[4, default: 0]
                let light = session.stageMinutes[2, default: 0]
                let span = "\(session.start.formatted(date: .omitted, time: .shortened)) → \(session.end.formatted(date: .omitted, time: .shortened))"
                let duration = readings.first.map(describe) ?? "Sleep"
                logTraffic("← Sleep \(span) — \(duration), deep \(deep)m, REM \(rem)m, light \(light)m")
            }
        case .spo2:
            let batch = spo2LogParser.parse(frame)
            batch.forEach(emit)
            logTraffic(batch.isEmpty
                ? "← Blood oxygen history: no data"
                : "← Blood oxygen history: \(batch.count) hourly values, latest \(describe(batch.last!))")
        }
    }

    /// One line for a 15-minute activity slot, e.g.
    /// "Activity 04:00 — 300 steps · 1000 kcal · 0.50 km".
    private func describeSlot(_ readings: [HealthReading]) -> String {
        let time = readings.first?.recordedAt.formatted(date: .omitted, time: .shortened) ?? ""
        let parts = readings.map(describe).joined(separator: " · ")
        return "Activity \(time) — \(parts)"
    }
}
