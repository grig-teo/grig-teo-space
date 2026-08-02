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
    /// Pending fallback that restarts the scan without a service filter.
    private var scanFallback: DispatchWorkItem?
    /// Guards the one-shot full sync that runs after characteristics are up.
    private var didRunInitialSync = false
    /// Multi-packet steps response state.
    private let stepsParser = StepsParser()
    /// Realtime stream currently active on the ring (HR or SpO2).
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
        }
        scanFallback = fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: fallback)
    }

    func disconnect() {
        scanFallback?.cancel()
        scanFallback = nil
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
        case .realtimeHeartRate:
            startRealTime(kind: .heartRate)
        case .realtimeSpo2:
            startRealTime(kind: .spo2)
        }
    }

    /// Start (or keep alive) a realtime stream, switching kinds if needed.
    private func startRealTime(kind: ColmiProtocol.RealTimeKind) {
        let name = kind == .heartRate ? "heart rate" : "blood oxygen"
        if activeRealTime == kind {
            write(ColmiProtocol.realTimePacket(kind: kind, action: .continue), "Continue realtime \(name)")
        } else {
            if let previous = activeRealTime {
                let previousName = previous == .heartRate ? "heart rate" : "blood oxygen"
                write(ColmiProtocol.stopRealTimePacket(kind: previous), "Stop realtime \(previousName)")
            }
            write(ColmiProtocol.realTimePacket(kind: kind, action: .start), "Start realtime \(name)")
            activeRealTime = kind
        }
    }

    /**
     Fire every read the ring supports, in order. Runs once per connection
     (after characteristics are discovered) so a fresh link pulls all data
     immediately instead of waiting for the 90s round-robin: set the ring
     clock (logs are timestamped by it), battery, today's steps, then start
     the realtime heart-rate stream.
     */
    func startFullSync() {
        let commands: [ColmiProtocol.Command] = [
            .setTime, .battery, .steps, .realtimeHeartRate,
        ]
        for command in commands {
            requestRealtimeReading(command: command)
        }
    }

    // MARK: - Packet I/O

    private func write(_ packet: Data, _ label: String) {
        guard let peripheral, let txCharacteristic else { return }
        logTraffic("→ \(label)")
        peripheral.writeValue(packet, for: txCharacteristic, type: .withResponse)
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
        let value = reading.metric == RingMetric.distanceKm.rawValue
            ? String(format: "%.2f", reading.value)
            : "\(Int(reading.value))"
        return "\(metric.displayName): \(value)\(metric.unit.isEmpty ? "" : " \(metric.unit)")"
    }

    private func logTraffic(_ line: String) {
        traffic.append(line)
        if traffic.count > 30 {
            traffic.removeFirst(traffic.count - 30)
        }
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
        peripheral.discoverServices([ColmiProtocol.serviceUUID, ColmiProtocol.batteryServiceUUID])
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
        case .setTime:
            logTraffic("← Ring time set")
        default:
            logTraffic("← Unknown frame (0x\(String(opcode, radix: 16, uppercase: true)))")
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
