import Foundation
import CoreBluetooth
import Combine

/**
 CoreBluetooth manager for the COLMI ring.

 Real device flow:
   scan → connect → discover ColmiProtocol.serviceUUID → subscribe to RX (notify)
   → write a realtime command to TX → parse notified RX bytes into readings.

 This is a faithful scaffold of that flow. The actual parsing of RX notify
 payloads into metric values is stubbed (`parseNotifyPayload`) because the
 exact byte layout must be confirmed by sniffing the real R11 (see
 ColmiProtocol.swift).
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

    /// Request a real-time reading once connected (heart rate by default).
    func requestRealtimeReading(command: ColmiProtocol.Command = .realtimeHeartRate) {
        guard let peripheral, let txCharacteristic else { return }
        let packet = ColmiProtocol.buildPacket(command: command)
        peripheral.writeValue(packet, for: txCharacteristic, type: .withResponse)
    }

    /**
     Fire every read command the ring supports, back to back. Runs once per
     connection (after characteristics are discovered) so a fresh link pulls
     all data immediately instead of waiting for the 90s round-robin.
     Responses the parser doesn't understand yet (e.g. history frames) are
     ignored by `ColmiProtocol.parse`.
     */
    func startFullSync() {
        if let batteryCharacteristic, let peripheral {
            peripheral.readValue(for: batteryCharacteristic)
        }
        let commands: [ColmiProtocol.Command] = [
            .realtimeHeartRate, .realtimeSpo2, .battery, .historyFetch,
        ]
        for command in commands {
            requestRealtimeReading(command: command)
        }
    }

    // MARK: - RX parsing (delegates to ColmiProtocol — R11-specific, must be verified)

    /**
     Parse a notified RX payload into a reading. Delegates to the pure
     `ColmiProtocol.parse` so the byte layout is tested in one place and the
     real R11 retune is a single, reviewable change.
     */
    private func parseNotifyPayload(_ data: Data) -> HealthReading? {
        ColmiProtocol.parse(data)
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
        } else if characteristic.uuid == ColmiProtocol.rxCharacteristicUUID {
            if let reading = parseNotifyPayload(data) {
                lastReadingAt = Date()
                readings.send(reading)
            }
        }
    }
}
