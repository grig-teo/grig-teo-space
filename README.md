# grig-teo portfolio

Personal developer portfolio and health-data platform — Next.js frontend + NestJS
backend + iOS companion app + Telegram bot, served at
[grig-teo.space](https://grig-teo.space).

## Stack

- **Frontend:** Next.js 15, Tailwind CSS, next-intl (EN / RU / RO)
- **Backend:** NestJS 11 REST API, TypeORM (JSONB content in Postgres)
- **iOS:** SwiftUI + CoreBluetooth (XcodeGen project, iOS 16+)
- **Bot:** Telegraf (TypeScript)
- **Deploy:** Docker Compose + host Nginx + Let's Encrypt

## What's on the site

- **Hero with live health vitals** — animated heart (bpm avg), walking figure
  (steps today), and a brain character that morphs from zen meditation to a
  flaming panic state as the public stress average changes. Vitals refetch
  from `/api/health/public` every 60 s in the browser.
- **Portfolio** — projects, experience (detail pages with video/image
  attachments), blog (BlockNote editor in admin, server-rendered for readers),
  CV download (per-locale PDF, regenerated on content save).
- **AI assistant chat** — answers questions about the owner from profile,
  projects, experience and blog context.
- **SEO** — per-locale alternates/canonicals, JSON-LD, OG tags, and a 10-minute
  nginx page microcache in front of the dynamic SSR.

## Health pipeline (COLMI R10 ring)

End-to-end pipeline from a COLMI R10 (A201) smart ring to public charts. The
ring's BLE protocol is reverse-engineered (R02 family — 16-byte packets, opcode
at byte 0, checksum = sum of first 15 bytes & 0xFF); see the blog post
*Talking to a Smart Ring That Has No Manual*.

```
COLMI R10 ring ──BLE──▶ iOS app ──▶ /api/health/readings ──▶ Postgres
   ▲  realtime HR/SpO2, activity slots, stress/HRV logs,            │
   │  SpO2 history, sleep (big-data), HealthCheck (skin temp)       ▼
   │                                                       upsert on (metric,
   └── histories re-sync every 20 min + on demand           recorded_at)
Telegram bot ◀──digest/alerts── /api/health/summary
Admin charts (/admin/dashboard/health) ◀── overview + exposure config
Landing hero + widget ◀── /api/health/public (only metrics opted in)
```

**Components:**

- **iOS app** (`ios/`): full protocol implementation — realtime heart-rate and
  SpO₂ streams, 15-min activity slots (steps / calories / distance), 30-min
  stress and HRV interval logs, hourly SpO₂ history, sleep sessions via the
  big-data channel, and HealthCheck frames (heart rate, skin temperature, RR
  interval). Built for unreliable BLE: state restoration, zombie-link watchdog,
  silence watchdog, one-master detection. Also: media library backup, health
  record scanning (Vision OCR → AI chat), body stats, hourly AI health tips,
  home-screen widget (deep links into the app), Face ID app lock. See
  `ios/README.md`.
- **Backend** (`backend/src/health/`): ingest (upsert on `(metric, recorded_at)`
  so re-syncs are idempotent), summary/overview for admin, per-metric public
  exposure config, anomaly alerts, AI tip generation.
- **Telegram bot** (`telegram/`): notes/mood logging, daily digest, anomaly
  alerts — REST only.
- **Admin** (`/admin/dashboard`): cookie-JWT auth; content editor (profile,
  projects, experience, blog with BlockNote + media upload), health charts
  (recharts), public-exposure panel.

**Env vars:**

```
DEVICE_API_KEY=<shared secret — iOS app + Telegram bot>
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHAT_ID=<your numeric Telegram chat id>
```

## Run locally

```bash
docker compose up --build   # frontend :3000, backend :3001, db, minio, telegram
```

iOS build is separate — see `ios/README.md` (`cd ios && xcodegen generate`).

Smoke-test the ingest endpoint:

```bash
curl -X POST http://localhost:3001/api/health/readings \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: dev-device-key" \
  -d '{"readings":[{"metric":"heart_rate","value":72,"recordedAt":"2026-07-11T12:00:00Z"}]}'
```

## Deploy to VPS

DNS must point to your server before HTTPS setup:

```
A     grig-teo.space      -> <your-server-ip>
A     www.grig-teo.space  -> <your-server-ip>
```

Production uses **host nginx** on the VPS (ports 80/443 shared with other
projects). From your machine:

```bash
chmod +x deploy/deploy.sh deploy/init-ssl.sh
VPS_HOST=root@<your-server-ip> ./deploy/deploy.sh
./deploy/init-ssl.sh
```

The deploy rsyncs the repo to `/opt/grig-teo-space`, takes a pre-deploy
`pg_dump` (last 5 kept in `backups/`), rebuilds and recreates the containers,
and reloads nginx with the current site config. Production compose file:
`docker-compose.prod.yml`, environment: `.env.production`.

## Development without Docker

```bash
# Backend
cd backend && npm install && npm run build && npm start

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```
