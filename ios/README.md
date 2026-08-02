# COLMI R11 — iOS app

A SwiftUI app that connects to the COLMI R11 smart ring over Bluetooth, reads
biometric data (heart rate, SpO₂, sleep, activity), and uploads it to the
`grig-teo.space` backend, where it powers the admin charts, the Telegram bot,
and (optionally) the public health page.

## Build

The project is generated with **XcodeGen** (so sources stay reviewable in git
without committing a bloated `.xcodeproj`).

```bash
brew install xcodegen          # one-time
cd ios
xcodegen generate              # produces ColmiRingApp.xcodeproj
open ColmiRingApp.xcodeproj    # build & run on a device/simulator from Xcode
```

Requirements: Xcode 15+, iOS 16+ deployment target.

> ⚠️ Bluetooth cannot run on the Simulator — test the BLE path on a real iPhone.

## First-run setup

1. Open the app → tap the **gear** icon (Settings).
2. Set **Backend URL** to your server (e.g. `https://grig-teo.space`).
3. Set **Device API key** to the same value as `DEVICE_API_KEY` in the backend env.

## How the real ring flow works

1. The app scans for devices advertising the COLMI GATT service.
2. On connect it subscribes to the RX (notify) characteristic and writes a
   realtime-read command to the TX characteristic.
3. Notified RX payloads are parsed into readings and forwarded to the backend
   via `POST /api/health/readings` (with the `X-Device-Key` header).

## ⚠️ Protocol verification (IMPORTANT — do this once the ring arrives)

The COLMI R11's exact Bluetooth protocol is **not publicly documented**. The
values in `ColmiRingApp/BLE/ColmiProtocol.swift` are derived from the
reverse-engineered **R02 family** (github.com/tahnok/colmi_r02_client) and are a
best-effort starting point. The R11 likely shares the same Nordic-UART-style
custom service, but the UUIDs and command opcodes may differ.

To verify and retune:

1. Install **nRF Connect for Mobile** (Android/iOS) on your phone.
2. Pair the ring through the official COLMI / QRing app, then perform a reading.
3. In nRF Connect, connect to the ring and watch which characteristics are
   notified/written while the official app reads heart rate / SpO₂.
4. Update `ColmiProtocol.swift`:
   - `serviceUUID`, `txCharacteristicUUID`, `rxCharacteristicUUID`
   - `Command` opcodes (realtime HR / SpO₂, history, battery)
   - `nameFilter` (the advertised device name)
5. Update `parseNotifyPayload` in `RingBluetoothManager.swift` with the actual
   byte offsets returned by the ring.

All R11-specific constants live in **`ColmiProtocol.swift`** — once verified,
only that one file (plus the parser method) should need changes.

## Architecture

```
ColmiRingApp/
├── ColmiRingApp.swift          # @main entry
├── ContentView.swift           # the single primary view
├── AppSettings.swift           # UserDefaults-backed config
├── BLE/
│   ├── ColmiProtocol.swift     # ⭐ all GATT UUIDs + packet format (R11-specific)
│   ├── RingBluetoothManager.swift  # CoreBluetooth manager + RX parser
│   ├── RingMetric.swift        # metric enum + units
│   └── RingDataSource.swift    # source protocol (+ AnyRingDataSource box)
├── Networking/
│   └── ApiClient.swift         # batched upload with offline queue
├── Models/
│   └── HealthReading.swift     # Codable matching backend DTO
└── Views/
    ├── ConnectionCard.swift    # BLE status, RSSI, battery
    ├── MetricCard.swift        # latest-value card
    ├── SyncLogView.swift       # pending count, last upload, Sync now
    └── SettingsSheet.swift     # backend URL, device key
```

Readings never block on network: if the upload fails they are persisted to
Application Support and retried on the next sync (manual or automatic).
