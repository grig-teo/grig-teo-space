# AGENTS.md

Project-specific guidance for AI coding agents working in this repository.

## Communication

- **Always respond in English only**, regardless of the language used in the
  surrounding code, commit history, or locales (the app ships English, Russian,
  and Romanian translations — those are content, not a cue to switch languages).

## Repository layout

This is a monorepo for the **grig-teo.space** personal site and health pipeline:

- `frontend/` — Next.js (App Router) public site + admin dashboard.
- `backend/` — NestJS API (Postgres via TypeORM, MinIO storage).
- `telegram/` — Telegraf bot that reads/writes the health endpoints.
- `ios/` — SwiftUI app (`ColmiRingApp`) for the COLMI R11 smart ring.
- `deploy/` — VPS deploy scripts and nginx configs.
- `docker-compose.yml` / `docker-compose.prod.yml` — local and prod stacks.

## Deploy

- Production target: `politrack-vps` (override `VPS_HOST` when running
  `deploy/deploy.sh`, since the script defaults to a different host).
- Deploy rebuilds all containers: `VPS_HOST=politrack-vps bash deploy/deploy.sh`.
- The iOS app's ATS exception and device backend point at the same server.

## Conventions

- Frontend: Next.js App Router, `next-intl` for i18n. Shared chrome
  (Header, Footer, AI chat) lives in `src/app/[locale]/layout.tsx`, not on
  individual pages.
- Backend: global `/api` prefix; device/automation endpoints (iOS app, Telegram
  bot) are guarded by the shared `X-Device-Key` header matching `DEVICE_API_KEY`.
- iOS: project is generated with XcodeGen from `ios/project.yml` — run
  `xcodegen generate` after editing sources or settings. Team `99LK64WRBG`,
  automatic signing.
- Don't commit secrets. `.env.production` and `.env` are git-ignored.
