# grig-teo portfolio

Personal developer portfolio — Next.js frontend + NestJS backend.

**Domain:** [grig-teo.space](https://grig-teo.space)

## Stack

- **Frontend:** Next.js 15, Tailwind CSS, next-intl (EN / RU / RO)
- **Backend:** NestJS 11 REST API
- **Deploy:** Docker Compose + Nginx + Let's Encrypt

## Health pipeline (COLMI R11 ring)

A full data pipeline from a COLMI R11 smart ring to public charts:

```
COLMI R11 ring ──BLE──▶ iOS app ──▶ /api/health/readings ──▶ Postgres
                                                                    │
Telegram bot ◀──summary/alerts── /api/health/summary               │
   │  (notes in, digests/alerts out)                                ▼
   └──▶ /api/health/notes ──▶  Admin charts (/admin/dashboard/health)
                                Public page (/<locale>/health) ◀── /api/health/public
```

**Components:**

- **Backend** (`backend/src/health/`): ingest + summary + public endpoints, anomaly
  detection (low SpO₂, abnormal HR), and per-metric public-exposure config stored
  as JSONB in `site_content`. New tables: `health_reading`, `health_note`.
- **iOS app** (`ios/`): SwiftUI + CoreBluetooth scaffold. Built with XcodeGen.
  Reads the ring over BLE and uploads readings. Includes a **Demo data** toggle
  so the pipeline works before the ring arrives. See `ios/README.md` — the BLE
  protocol constants live in `ColmiProtocol.swift` and must be verified against
  the real ring with nRF Connect.
- **Telegram bot** (`telegram/`): Telegraf service. Logs your notes/mood, sends a
  daily digest, and forwards anomaly alerts. Talks to the backend over REST only.
- **Admin charts** (`/admin/dashboard/health`): recharts line/bar charts for every
  metric, a notes timeline, an alerts strip, and a public-exposure panel where you
  choose which metrics visitors can see (each has a recommendation).
- **Public health page** (`/<locale>/health`): shows only the metrics you opted into,
  with a nav link in the header that appears only when the page is enabled.

**Setup (env vars):**

```
DEVICE_API_KEY=<shared secret — used by the iOS app + Telegram bot>
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHAT_ID=<your numeric Telegram chat id>
```

**Run locally** (iOS build is separate — see `ios/README.md`):

```bash
docker compose up --build   # now includes the telegram service
```

Smoke-test the ingest endpoint:

```bash
curl -X POST http://localhost:3001/api/health/readings \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: dev-device-key" \
  -d '{"readings":[{"metric":"heart_rate","value":72,"recordedAt":"2026-07-11T12:00:00Z","source":"demo"}]}'
```



## Run locally

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- CV download: http://localhost:3001/api/cv

## Deploy to VPS

DNS must point to your server before HTTPS setup:

```
A     grig-teo.space      -> <your-server-ip>
A     www.grig-teo.space  -> <your-server-ip>
```

Production uses **host nginx** on the VPS (ports 80/443 are shared with other projects).

SSH alias from `~/.ssh/config`:

```bash
ssh vecin2vecin-vps
```

From your machine:

```bash
chmod +x deploy/deploy.sh deploy/init-ssl.sh
./deploy/deploy.sh
./deploy/init-ssl.sh
```

Production compose file: `docker-compose.prod.yml`  
Environment: `.env.production`

Manual deploy on the server:

```bash
ssh vecin2vecin-vps
cd /opt/grig-teo-space
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Development without Docker

```bash
# Backend
cd backend && npm install && npm run build && npm start

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```
