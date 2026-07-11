---
slug: colmi-r11-health-pipeline
title: "Talking to a Smart Ring That Has No Manual: Building the COLMI R11 Health Pipeline"
description: "How I reverse-engineered the COLMI R11's undocumented Bluetooth protocol, built a resilient SwiftUI app on CoreBluetooth, and wired it into a NestJS backend with an offline-first upload queue and a three-layer background strategy."
date: 2026-07-11
sortOrder: 0
---

# Talking to a Smart Ring That Has No Manual

I wanted a continuous view of my own vitals — heart rate, blood oxygen, sleep — without wearing a watch all day. Smart rings are the least intrusive option, and the **COLMI R11** is one of the cheapest on the market. There was one catch: COLMI doesn't publish a Bluetooth protocol, and no mainstream fitness app can read the ring, because it doesn't use the standard Heart Rate Service. So I had to reverse-engineer it.

The result is a four-part pipeline that lives in one monorepo: a **SwiftUI iOS app** that talks to the ring over Bluetooth, a **NestJS backend** that stores the readings, an admin dashboard that charts them, and a Telegram bot that queries the same data. This article covers the first two — everything between the ring on your finger and a row in Postgres.

## The protocol problem

The COLMI R11's exact Bluetooth protocol is not publicly documented. But the **R02**, a close sibling, is — thanks to an open-source reverse-engineering effort on GitHub (the `tahnok/colmi_r02_client` project) and a related Gadgetbridge pull request. The R11 uses a Nordic-UART-style custom service instead of the standard Heart Rate Service, which is precisely why generic fitness apps cannot see it.

My strategy was simple: derive every protocol constant from the R02 family, isolate it in a single Swift file, and clearly mark it as a placeholder until I can sniff the real R11 packets with nRF Connect. That way, when the real offsets are confirmed, only one file needs to change.

## Packet format

Communication happens in fixed-size **16-byte packets**. Bytes 0 and 1 are a header prefix, byte 2 is the command opcode, bytes 3 through 13 carry the payload, and byte 15 is a checksum — the sum of the first 15 bytes modulo 255.

```swift
static func buildPacket(command: Command, payload: [UInt8] = []) -> Data {
    var bytes = [UInt8](repeating: 0, count: 16)
    bytes[2] = command.rawValue
    for (i, b) in payload.enumerated() where i < 11 { bytes[3 + i] = b }
    bytes[15] = bytes.prefix(15).reduce(0, &+) % 255
    return Data(bytes)
}
```

The commands wired up today are realtime heart rate (`0x06`), realtime SpO2 (`0x57`), and battery (`0x04`). The full nine-metric vocabulary — heart rate, SpO2, steps, calories, distance, stress, HRV, sleep duration, sleep quality — is modeled end to end, from the Swift enum through the backend entity to the UI cards. But the history-fetch opcode that would populate the remaining metrics is still a stub, so right now only heart rate, SpO2, and battery actually flow over the air.

## Connecting with CoreBluetooth

The ring manager conforms to both `CBCentralManagerDelegate` and `CBPeripheralDelegate`. The connection flow is conventional: scan for the custom service UUID, filter the discovered peripheral by name, stop scanning, connect, discover the TX and RX characteristics, and call `setNotifyValue(true)` on RX to subscribe to notifications.

The interesting part is not the connection — it is surviving the background.

## The three-layer background strategy

This is the hardest problem on iOS. Apple will suspend your app, and if it is under memory pressure, kill it entirely. A naive `Timer` stops firing the moment the app backgrounds. I use three cooperating mechanisms, and I am honest in the code about which ones are reliable.

**Layer one: CoreBluetooth background mode plus state restoration.** The central manager is constructed with a restore identifier. iOS keeps the Bluetooth link alive across suspension and can relaunch the app in the background to deliver events. On relaunch, the restoration delegate re-attaches the peripheral and reconnects automatically. This is the reliable layer — the one you can actually count on.

**Layer two: BGTaskScheduler wakeups.** Two tasks are registered before the app finishes launching. The first is a background app-refresh task that fires no sooner than 15 minutes out and drains the upload queue. The second is a background processing task that fires no sooner than 60 minutes, requests a new reading, then flushes. I want to be clear about expectations here: background task timing is entirely at the operating system's discretion. It is a supplement to the Bluetooth background mode, not a reliable timer.

**Layer three: a background URLSession for uploads.** Uploads use a background URLSession configuration so that an upload in flight when the app is suspended completes anyway, and the system relaunches the app to deliver the result. The app picks the background session only when the application state is backgrounded; in the foreground it uses the shared session, which is faster and simpler.

## The offline-first upload queue

Readings are too valuable to drop on a flaky network. Every reading from the ring lands in an on-disk queue before it ever touches the network.

```swift
func enqueue(_ reading: HealthReading) {
    pending.append(reading)
    savePending(pending)
    flush()
}
```

On flush, the app POSTs the whole pending array to the backend. On a successful response it removes the first batch of readings from disk and stamps the last-sync timestamp. On failure it leaves the queue intact and records the error, so the next attempt retries. Bursty networks never lose data, and nothing is re-uploaded wholesale.

There is one genuinely nasty gotcha hiding in that flush method. To wrap the readings in a JSON envelope I needed `JSONSerialization`, but `JSONSerialization` cannot encode Swift structs — it throws an Objective-C exception that Swift cannot catch, which crashes the app. The fix is a two-step encode: encode the structs to `Data` with `JSONEncoder`, rehydrate that data as a plain array via `JSONSerialization`, and only then re-wrap it in the envelope.

## Wiring the two ends together

The metric vocabulary is identical on both sides of the wire. The Swift `RingMetric` raw values are byte-for-byte the same as the TypeScript `HealthMetric` union, so the two ends of the pipeline cannot drift on naming.

```typescript
type HealthMetric =
  | 'heart_rate' | 'spo2' | 'steps' | 'calories' | 'distance_km'
  | 'stress' | 'hrv' | 'sleep_duration_h' | 'sleep_quality';
```

Each reading is a thin, source-tagged record that crosses the boundary.

```typescript
type IncomingReading = {
  metric: HealthMetric;
  value: number;
  unit?: string | null;
  recordedAt: string;
  source?: 'ring' | 'demo' | 'manual';
  raw?: Record<string, unknown>;
};
```

The `recordedAt` timestamp is serialized with an ISO 8601 formatter configured for internet date-time with fractional seconds, so it lands cleanly in the Postgres `timestamptz` column without rounding or timezone ambiguity.

## The backend ingest

The device endpoints — used by the iOS app and the Telegram bot — do not use JWT authentication. They share a single secret: the `X-Device-Key` header, checked by a guard against an environment variable.

```typescript
@Post('readings')
@UseGuards(DeviceKeyGuard)
@HttpCode(201)
async addReadings(@Body() { readings }: { readings: IncomingReading[] }) {
  return this.health.addReadings(readings);
}
```

The guard **fails closed**: if no device key is configured in the environment, no device may write. This is deliberate. A missing secret should never degrade to open. Each incoming reading is validated against the metric union, the date is parsed, a default unit is filled in if one is missing, and the rows are bulk-inserted into the health-reading table, which is indexed on the metric and timestamp for fast time-window queries. A single request is capped at two thousand readings.

## From rows to charts

Once the readings are in Postgres, they feed three consumers. An admin overview endpoint returns each metric with a downsampled time series plus a summary of count, average, minimum, maximum, and latest value. An unauthenticated public endpoint surfaces only the metrics the admin has explicitly toggled on. And the Telegram bot queries the same summary endpoint to answer questions in chat.

There is also a lightweight anomaly detector running over the recent window. Blood oxygen below 90 percent is flagged critical. Resting heart rate above 120 or below 40 is a warning, with the last few offending readings attached so you can see the trend.

## What I would do differently

- **Sniff the real R11 before shipping anything serious.** The R02-derived constants are a placeholder. Until I capture real packets, the byte offsets in the notify parser are a heuristic, not a guarantee.
- **Implement the history fetch.** The history opcode and the round-robin poll only exercise real-time heart rate and SpO2 today. Steps, sleep, and the rest need the history path, which is the bulk of what a ring is actually useful for.
- **Make the device key rotatable without an app update.** Right now it lives in user defaults, set manually in settings. A short-lived token exchange would be cleaner.

The ring is a fascinating target precisely because it is closed. The lesson, if there is one, is that "no public protocol" usually means "no official protocol" — and a documented sibling plus a single isolated file of constants can take you a long way.
