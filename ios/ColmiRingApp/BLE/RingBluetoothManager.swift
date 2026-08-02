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
    }

    func disconnect() {
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
            for peripheral in peripherals where peripheral.name?.uppercased().contains(ColmiProtocol.nameFilter) == true {
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
        // Prefer the name filter, fall back to advertising the service.
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        guard name.uppercased().contains(ColmiProtocol.nameFilter) else { return }
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
