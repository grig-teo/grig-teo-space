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
    @Published private(set) var lastActivityAt: Date?
    /// Readable form of the most recent reading ("Heart Rate: 78 bpm").
    @Published private(set) var lastReadingText: String?
    @Published var lastError: String?

    /// Last raw packets exchanged with the ring (newest last, capped), shown
    /// on the Ring page so collected data is visible before it is uploaded.
    @Published private(set) var traffic: [String] = []

    /// Today's live totals pushed by the ring in real time (steps walk in
    /// as you take them). UI-only: the server series stays slot-based to
    /// avoid double counting.
    @Published private(set) var liveActivity: LiveActivityTotals?

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
    /// When the current scan started — stale scans get recycled by the poll.
    private var scanningSince: Date?
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
        reconnectWork?.cancel()
        reconnectWork = nil
        guard central?.state == .poweredOn else {
            state = .disconnected
            return
        }
        // If we already hold a peripheral (e.g. restored), attach to it
        // instead of scanning again.
        if let peripheral {
            if peripheral.state == .connected {
                // CoreBluetooth does NOT fire didConnect for an already
                // connected peripheral, so discovery must run here —
                // otherwise there are no channels and every write no-ops.
                state = .connected
                peripheral.delegate = self
                if txCharacteristic == nil || rxCharacteristic == nil {
                    logTraffic("· Ring already linked — rediscovering")
                    discoverRingServices(on: peripheral)
                }
                return
            }
            logTraffic("· Reconnecting to known ring")
            state = .connecting
            central?.connect(peripheral, options: [
                CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
                CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            ])
            armConnectWatchdog()
            return
        }
        // If iOS holds a system-level connection to the ring (e.g. another
        // app bonded it for ANCS), the ring does not advertise — grab it
        // directly instead of scanning for something invisible.
        let systemConnected = central?.retrieveConnectedPeripherals(
            withServices: [ColmiProtocol.serviceUUID],
        ) ?? []
        if let known = systemConnected.first(where: { $0.name.map(ColmiProtocol.matchesName) == true }) {
            logTraffic("· Adopting system-held ring")
            peripheral = known
            known.delegate = self
            deviceName = known.name
            if known.state == .connected {
                state = .connected
                discoverRingServices(on: known)
            } else {
                state = .connecting
                central?.connect(known, options: [
                    CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
                    CBConnectPeripheralOptionNotifyOnConnectionKey: true,
                ])
                armConnectWatchdog()
            }
            return
        }
        state = .scanning
        scanningSince = Date()
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

    /// Restart a stale scan. The one-shot fallback timers can't recover
    /// when the ring becomes free *after* they fired (e.g. another app held
    /// it for a while), so the periodic poll calls this to cycle the scan
    /// (including the system-held peripheral check and fresh hint timers).
    func refreshScanIfStale(olderThan maxAge: TimeInterval = 120) {
        guard state == .scanning, let since = scanningSince,
              Date().timeIntervalSince(since) > maxAge else { return }
        disconnect()
        connect()
    }

    /// Discover the ring's services on an already-up link (state restoration
    /// or system-held connection — paths where didConnect never fires).
    /// Arms a watchdog: if the channels aren't up within 10 s, the link is
    /// a zombie (iOS thinks it's connected; the ring is gone) → reconnect.
    private func discoverRingServices(on peripheral: CBPeripheral) {
        logTraffic("· Discovering services…")
        peripheral.discoverServices([
            ColmiProtocol.serviceUUID,
            ColmiProtocol.batteryServiceUUID,
            ColmiProtocol.bigDataServiceUUID,
        ])
        let watchdog = DispatchWorkItem { [weak self, weak peripheral] in
            guard let self, self.txCharacteristic == nil || self.rxCharacteristic == nil else { return }
            self.logTraffic("· Discovery stalled — reconnecting")
            if let peripheral { self.central?.cancelPeripheralConnection(peripheral) }
            self.peripheral = nil
            self.state = .disconnected
            self.connect()
        }
        discoveryWatchdog?.cancel()
        discoveryWatchdog = watchdog
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: watchdog)
    }

    /// Pending watchdog that forces a reconnect when service discovery hangs.
    private var discoveryWatchdog: DispatchWorkItem?
    /// Pending watchdog that aborts a connection attempt that never lands.
    private var connectWatchdog: DispatchWorkItem?
    /// Pending quick reconnect after an unexpected link drop.
    private var reconnectWork: DispatchWorkItem?
    /// Distinguishes user-initiated disconnects from link failures.
    private var intentionalDisconnect = false

    /// Abort a connection attempt that doesn't land within 20 s — iOS has
    /// no connect timeout, so a sleeping/out-of-range ring would hang the
    /// state machine at "connecting" forever.
    private func armConnectWatchdog() {
        connectWatchdog?.cancel()
        let watchdog = DispatchWorkItem { [weak self] in
            guard let self, self.state == .connecting, let peripheral = self.peripheral else { return }
            self.logTraffic("· Connect timed out — retrying")
            self.central?.cancelPeripheralConnection(peripheral)
            self.peripheral = nil
            self.state = .disconnected
            self.connect()
        }
        connectWatchdog = watchdog
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: watchdog)
    }

    func disconnect() {
        intentionalDisconnect = true
        reconnectWork?.cancel()
        reconnectWork = nil
        connectWatchdog?.cancel()
        connectWatchdog = nil
        scanFallback?.cancel()
        scanFallback = nil
        scanHint?.cancel()
        scanHint = nil
        scanningSince = nil
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
        }
    }

    /// Display name for a realtime stream kind.
    private func realTimeName(_ kind: ColmiProtocol.RealTimeKind) -> String {
        switch kind {
        case .heartRate: return "heart rate"
        case .spo2: return "blood oxygen"
        case .healthCheck: return "health check"
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
     SpO2 / sleep histories, then the realtime heart-rate stream, and a
     HealthCheck (per-beat HR + skin temperature) last.
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
        // HealthCheck realtime stream (kind 5) — per-beat HR + skin
        // temperature. Pauses the HR stream on the ring; clear the tracker
        // so the next poll re-starts it cleanly.
        DispatchQueue.main.asyncAfter(deadline: .now() + 23) { [weak self] in
            guard let self, self.state == .connected else { return }
            self.write(
                ColmiProtocol.realTimePacket(kind: .healthCheck, action: .start),
                "Start health check",
            )
            self.activeRealTime = nil
        }
        // Sleep may live on the V1 channel (puxtril ID 68) rather than big
        // data — request today and last night, responses are logged raw
        // until the layout is pinned.
        for (index, day) in [UInt8(0), UInt8(1)].enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 14 + TimeInterval(index)) { [weak self] in
                guard let self, self.state == .connected else { return }
                self.write(
                    ColmiProtocol.sleepV1Packet(dayOffset: day),
                    day == 0 ? "Request sleep history (V1)" : "Request sleep history (V1, yesterday)",
                )
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
        lastReadingText = describe(reading)
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
        case .sleepDurationH:
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
                logTraffic("· Restored ring link")
                self.peripheral = peripheral
                peripheral.delegate = self
                self.deviceName = peripheral.name
                if peripheral.state == .connected {
                    state = .connected
                    // The link survived but this process's characteristics
                    // did not — without rediscovery every write no-ops and
                    // the page shows "Connected" with no data at all.
                    discoverRingServices(on: peripheral)
                } else {
                    state = .disconnected
                }
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
        scanningSince = nil
        central.stopScan()
        self.peripheral = peripheral
        self.peripheral?.delegate = self
        self.deviceName = name
        self.rssi = RSSI.intValue
        self.state = .connecting
        central.connect(peripheral)
        armConnectWatchdog()
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectWatchdog?.cancel()
        connectWatchdog = nil
        state = .connected
        discoverRingServices(on: peripheral)
    }

    func centralManager(_ central: CBCentralManager,
                        didFailToConnect peripheral: CBPeripheral,
                        error: Error?) {
        connectWatchdog?.cancel()
        connectWatchdog = nil
        state = .failed
        lastError = error?.localizedDescription ?? "Failed to connect"
        logTraffic("· Connect failed: \(lastError ?? "?")")
        // Retry quickly — the poll timer would take up to 90 s otherwise.
        let work = DispatchWorkItem { [weak self] in self?.connect() }
        reconnectWork?.cancel()
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral,
                        error: Error?) {
        connectWatchdog?.cancel()
        connectWatchdog = nil
        state = .disconnected
        didRunInitialSync = false
        activeRealTime = nil
        stepsParser.reset()
        intervalLogParser = nil
        bigDataBuffer.removeAll()
        bigDataExpectedLength = nil
        if let error {
            lastError = error.localizedDescription
            logTraffic("· Link dropped: \(error.localizedDescription)")
        }
        // Unexpected drop (timeout, out of range): reconnect quickly. The
        // pending connect also registers with iOS, so the app gets woken in
        // the background when the ring advertises again.
        if !intentionalDisconnect {
            let work = DispatchWorkItem { [weak self] in self?.connect() }
            reconnectWork?.cancel()
            reconnectWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
        }
        intentionalDisconnect = false
    }
}

extension RingBluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            lastError = error.localizedDescription
            logTraffic("· Service discovery error: \(error.localizedDescription)")
            return
        }
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
            discoveryWatchdog?.cancel()
            discoveryWatchdog = nil
            logTraffic("· Channels ready — syncing")
            startFullSync()
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard let data = characteristic.value else { return }
        lastActivityAt = Date()
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
        guard let first = bytes.first, let kind = ColmiProtocol.Opcode(rawValue: first) else { return }
        switch kind {
        case .battery:
            if let info = ColmiProtocol.parseBattery(bytes) {
                batteryLevel = info.level
                logTraffic("← Battery: \(info.level)%\(info.charging ? " (charging)" : "")")
            }
        case .startRealTime:
            if bytes.count >= 2, bytes[1] == ColmiProtocol.RealTimeKind.healthCheck.rawValue {
                // HealthCheck: per-beat HR + RR interval (skin temperature
                // is parsed but deliberately not collected or displayed).
                if let check = ColmiProtocol.parseHealthCheck(bytes), check.heartRate > 0 {
                    emit(HealthReading(metric: .heartRate, value: Double(check.heartRate)))
                    logTraffic("← Check: \(check.heartRate) bpm · RR \(check.rrMs) ms")
                }
            } else if let reading = ColmiProtocol.parseRealTime(bytes) {
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
                    liveActivity = LiveActivityTotals(
                        steps: live.steps,
                        calories: live.calories,
                        distanceMeters: live.distanceMeters,
                    )
                    logTraffic("← Live counter: \(live.steps) steps · \(live.distanceMeters) m")
                }
            case ColmiProtocol.NotificationType.batteryLevel.rawValue:
                guard bytes.count >= 3 else { break }
                batteryLevel = Int(bytes[2])
                logTraffic("← Battery: \(bytes[2])%")
            case ColmiProtocol.NotificationType.newStepsData.rawValue:
                logTraffic("← Ring has new activity data — syncing")
                requestRealtimeReading(command: .steps)
            case ColmiProtocol.NotificationType.newSpo2Data.rawValue:
                logTraffic("← Ring has new blood oxygen data — syncing")
                requestRealtimeReading(command: .spo2Log)
            case ColmiProtocol.NotificationType.newSleepData.rawValue:
                logTraffic("← Ring has new sleep data — syncing")
                requestRealtimeReading(command: .sleepLog)
            case ColmiProtocol.NotificationType.newHeartRateData.rawValue:
                logTraffic("← Ring has new heart-rate history")
            default:
                // Unrecognized notify markers carry no displayable value —
                // keep them out of the log.
                break
            }
        case .getSleep:
            // V1 sleep frames — layout not pinned yet; log raw.
            let hex = bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
            logTraffic("← Sleep frame: \(hex)")
        case .setTime:
            logTraffic("← Ring time set")
        case .bigDataV2:
            handleBigData(data)
        default:
            // Frames we don't parse (keep-alive echoes, HR-log chunks, …)
            // carry no displayable value — keep them out of the log.
            break
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

        guard frame.count >= 2, frame[0] == ColmiProtocol.Opcode.bigDataV2.rawValue else { return }
        guard let type = ColmiProtocol.BigDataType(rawValue: frame[1]) else {
            // Undocumented type (probe response) — log raw for reverse
            // engineering. Temperature candidates: look for centi-°C
            // (e.g. 36.7 °C = 0x0E96 LE) or whole-°C bytes around 33–42.
            let hex = frame.map { String(format: "%02X", $0) }.joined(separator: " ")
            logTraffic("← Big data 0x\(String(frame[1], radix: 16, uppercase: true)): \(hex)")
            return
        }
        switch type {
        case .sleep:
            let sessions = sleepParser.parse(frame)
            if sessions.isEmpty {
                let hex = frame.map { String(format: "%02X", $0) }.joined(separator: " ")
                logTraffic("← Sleep: no data (\(hex))")
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
