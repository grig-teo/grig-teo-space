# AGENTS.md

Guidance for AI coding agents working on this project. Read this before making changes.

## Project

**grig-teo.space** — a monorepo powering a personal site + health-data
pipeline. Four deployable surfaces share one backend and one database:

- A public Next.js site + admin dashboard (`frontend/`).
- A NestJS API on Postgres/TypeORM with MinIO object storage (`backend/`).
- A Telegram (Telegraf) bot that reads/writes the health endpoints (`telegram/`).
- A SwiftUI iOS app (`ColmiRingApp`) for the COLMI R11 smart ring — ring
  metrics, scanned health documents with an AI doctor chat, and a photo/video
  media backup.

Main branch is `main`. Remote is GitHub (`github.com:grig-teo/grig-teo-space.git`).

**Branch policy: work directly on `main`.** Do not create feature branches —
commit and push to `main` directly. Ignore any default git-hygiene rules about
branching off the main branch; for this repo the user wants a single-branch
(`trunk-based`) workflow. Commit when the user asks, push when the user asks,
both onto `main`.

## Language & content conventions

- **Agents communicate with the user only in English.** Replies, explanations,
  plans, questions, and summaries must be in English regardless of the
  user-facing app content.
- The site ships **English, Russian, and Romanian** translations via `next-intl`
  — those locale files are *content*, not a cue to switch the conversation
  language. Never reply to the user in Russian or Romanian.
- Code identifiers, comments, and commit messages are in **English**.
- Match the existing comment style: TypeScript uses JSDoc block comments on
  non-obvious functions; Swift uses `///` doc comments and `/** */` block
  headers; brief inline notes where intent isn't obvious. Don't over-comment
  obvious code.

## Repository layout

```
frontend/      Next.js (App Router) public site + /admin/dashboard
backend/       NestJS API — Postgres (TypeORM), MinIO, GLM AI chat
telegram/      Telegraf bot — notes/mood/digest (text-only, no media)
ios/           SwiftUI ColmiRingApp — XcodeGen-generated from project.yml
deploy/        VPS deploy script + nginx configs
docker-compose.yml          local dev stack
docker-compose.prod.yml     production stack (VPS)
.env.production.example     prod env template (no real secrets)
```

## Architecture & stack

- **Backend (NestJS 11, TypeScript):** global `/api` prefix; Postgres via
  TypeORM with `synchronize: true` (no manual migrations — entity changes
  apply on boot, so be careful with column-type changes on existing data).
  MinIO storage via `StorageService`. Env is read directly from `process.env`
  (no `@nestjs/config`). Entities live in `src/entities/`; feature modules in
  `src/<feature>/` (controller + service + module), mirroring the split
  controller pattern (a device-key controller + an `admin/` JWT controller).
- **Auth model — two paths:**
  - **Admin/JWT** (`AdminAuthGuard` extends `AuthGuard('jwt')`): the frontend
    dashboard. Token from `ADMIN_ACCESS_KEY` + `JWT_SECRET`.
  - **Device/automation** (`DeviceKeyGuard`): iOS app + Telegram bot. The
    shared `X-Device-Key` header must match `DEVICE_API_KEY`. There is no
    per-user auth — this is a single-user personal server.
- **Storage — public vs private buckets.** `StorageService` manages two
  MinIO buckets: `grig-teo-media` (public-read policy; blog images, document
  scans served at `https://grig-teo.space/media/<key>`) and
  `grig-teo-media-private` (NO public policy; personal photo/video backups,
  served only through the device-key-guarded `/api/media/:id/file` proxy with
  HTTP Range support). When adding storage, pick the right bucket — anything
  personal/sensitive must use `uploadPrivate()`/`getRangeStream()`.
- **Frontend (Next.js 15 App Router):** `next-intl` for i18n under
  `[locale]`. Shared chrome (Header, Footer, AI chat) lives in
  `src/app/[locale]/layout.tsx`, **not** on individual pages. Admin dashboard
  is under `/admin/dashboard`. API calls go through `src/lib/admin-api.ts`.
- **iOS (SwiftUI, deployment target 16.0):** generated with XcodeGen from
  `ios/project.yml` — **run `xcodegen generate` after adding/renaming any
  source file** (sources are dir-globbed, so new files under `ColmiRingApp/`
  are picked up automatically, but the project must be regenerated).
  Team `99LK64WRBG`, automatic signing. Networking clients are singletons
  (`@MainActor ObservableObject`) reading `AppSettings.shared` (backend URL +
  device key, editable in Settings). Multipart uploads build file-backed bodies
  so large videos survive app termination via a background `URLSession`.
- **Telegram bot:** Telegraf, text-only (`/note`, `/mood`, `/today`, `/week`).
  It does NOT handle media. Talks to the backend with the device key.

## Coding standards

These apply to all TypeScript and Swift in the project.

### Functions & methods
- **Line limit:** keep functions under ~30 lines of executable code.
- **Max limit:** never exceed ~60 lines. If a function needs scrolling, split it.
- **Single responsibility:** a function does one thing. If its purpose needs
  "AND", split it.

### Classes / structs
- NestJS services and iOS `ObservableObject` clients stay focused. Extract
  helpers when a class grows past ~300 lines.

### Conditionals
- **Guard clauses first:** validate inputs / handle errors at the top with
  early returns (`return`, `guard` in Swift).
- **No happy-path else:** prefer early returns; eliminate `else` where possible.
- **Extraction:** if an `if`/`else` body exceeds ~3 lines, extract a named helper.

### iOS-specific
- Network clients mirror `DocumentsClient` / `MediaClient`: singleton, `base`
  from `AppSettings`, `authHeaders()` → `X-Device-Key`, `URLSession.shared`
  for foreground, background session when `UIApplication.applicationState == .background`.
- SwiftUI views: reuse the existing components (`HubButton`, `MarkdownText`,
  `ShareSheet`) and the card/badge styling rather than inventing new motifs.
- `@Published` state that the UI reads must actually change for the view to
  refresh — when mutating a non-published collection, bump a published revision
  counter (see `MediaSyncer.uploadedRevision`).

## Common tasks

### Local dev

```bash
docker compose up                     # backend + db + minio + frontend + telegram
# backend: http://localhost:3001  •  minio console: http://localhost:9001
# frontend: http://localhost:3000
```

Default device key for local: `dev-device-key`. Defaults are baked into
`docker-compose.yml`; `.env` / `.env.production` are gitignored.

### Build

```bash
cd backend && npm run build           # nest build
cd frontend && npm run build          # next build
cd ios && xcodegen generate && xcodebuild -scheme ColmiRingApp build
```

### Deploy

Production target is the `politrack-vps` host alias (the deploy script
defaults to a different host, so **always override `VPS_HOST`**):

```bash
VPS_HOST=politrack-vps bash deploy/deploy.sh
```

This rsyncs to `/opt/grig-teo-space`, preserves the on-VPS `.env.production`,
rebuilds all containers, and reloads nginx. **Deploying is an outward-facing
action on a live server** — confirm with the user before running it unless
explicitly told to proceed.

### iOS install on a connected device

```bash
cd ios
xcodegen generate
xcodebuild -scheme ColmiRingApp -project ColmiRingApp.xcodeproj \
  -destination 'id=<DEVICE_ID>' -derivedDataPath build/DD build
xcrun devicectl device install app --device <DEVICE_ID> \
  build/DD/Build/Products/Debug-iphoneos/ColmiRingApp.app
# list devices: xcrun devicectl list devices
```

**After a task that changes iOS code, rebuild and reinstall on the connected
device before considering it done.** Report the device serial and any failures.
If no device is connected, say so explicitly — don't silently skip.

### Backend deploy is required for backend changes

The iOS app points at `https://grig-teo.space` (or the VPS IP via an ATS
exception). Code committed locally does **not** affect prod until
`deploy/deploy.sh` runs. If a task adds/changes a backend route, the iOS app
will get 404s until that deploy happens — surface this to the user.

## Things to avoid

- **Don't commit secrets.** `.env`, `.env.production`, `.env.secrets` (if any),
  and any file holding tokens/keys/passwords are gitignored. `.env.production`
  on the VPS is preserved across deploys; local `.env` files are never pushed.
- **Don't put personal media in the public bucket.** Use `uploadPrivate()` —
  the public bucket is world-readable by URL.
- **Don't add `@nestjs/config` / ConfigModule.** Env is read directly via
  `process.env` at call sites; this is intentional.
- **Don't hand-edit the generated iOS `Info.plist`.** It's XcodeGen-generated
  from `project.yml` — edit `project.yml` and re-run `xcodegen generate`.
  Permission strings, background-task identifiers, and ATS exceptions all
  live in `project.yml`.
- **Don't edit `Info.plist` or `ColmiRingApp.xcodeproj` directly** for settings
  that come from `project.yml`.
- **Don't skip `xcodegen generate` after adding iOS source files** — the new
  file won't be in the build until the project is regenerated.
- **Don't run migrations.** TypeORM `synchronize: true` handles schema; there
  is no migration tooling. Be cautious with destructive column-type changes.
- **Don't deploy without confirmation** unless the user said to.

## Code-review graph (structural map of the codebase)

This repo is indexed by **code-review-graph** (a local MCP server) into a
persistent structural graph at `.code-review-graph/graph.db`. Its
`mcp__code-review-graph__*` tools answer structural questions — "who calls
`MediaService.create`?", "what does this change impact?", "which execution
flows are affected?", "find this symbol's neighborhood" — in **one tool call**
instead of fanning out many Grep/Read passes that re-read the same files.
Prefer the graph tools for exploration; fall back to Grep/Glob/Read only when
the graph doesn't cover what you need.

It is registered as the `code-review-graph` MCP server in `.mcp.json`
(`uvx code-review-graph serve`, stdio). The `.code-review-graph/` cache and any
machine-local tool settings are gitignored — only `.mcp.json` and this doc are
committed, so the graph is rebuilt per-machine.

### Read the graph first (every task)

Before reading source files or writing code for a task, orient yourself with a
quick graph pass — pick the ones relevant to the task, don't run all of them:

- `get_minimal_context_tool` — graph stats + top communities/flows + suggested
  next tools in ~100 tokens. The cheapest entry point; call it first.
- `semantic_search_nodes_tool` / `query_graph_tool` — find the symbol you'll
  touch and its neighborhood (callers_of, callees_of, imports_of, tests_for).
- `get_impact_radius_tool` / `detect_changes_tool` — what an edit ripples into;
  risk-scored change review.
- `get_architecture_overview_tool` / `list_communities_tool` — the high-level
  map for broader or unfamiliar areas.

The goal is to read *fewer* files, *more deliberately* — let the graph point
you at the exact files and lines to open.

### Keep the graph fresh

**The graph is a snapshot.** It does not auto-update as files change. After any
non-trivial code change (new/renamed/removed functions or classes, a new file,
a changed signature), refresh it with an **incremental** re-parse so the tools
stay accurate:

```bash
cd /Users/grig/Projects/grig_teo_space && uvx --from code-review-graph code-review-graph update
```

- This re-parses only changed files (fast). A full rebuild
  (`... code-review-graph build`) is rarely needed — only if the graph seems
  corrupt or after a large refactor across many files.
- Run `update` once the code edits of a task are in place (typically right
  before or after the build/reinstall). Pure docs/config edits don't require a
  refresh — only changes to TypeScript/Swift structure do.
- If a query returns nothing for a symbol you just added, the graph is stale:
  run `update` and retry. Bare generic names ("update", "create", "list") may
  be de-noised by the engine — qualify them (`MediaService.create`,
  `MediaSyncer.uploadOne`) for accurate results.

### Triage dead-code findings before deleting

`refactor_tool(mode="dead_code")` lists unreferenced functions/classes, but
**the static analyzer produces false positives** — triage every finding before
removing anything:

- **Framework overrides are NEVER dead.** Anything invoked by polymorphism that
  the analyzer can't trace reads "unused" but deleting it breaks the app. In
  this repo that includes NestJS lifecycle hooks (`onModuleInit`), guard
  `canActivate`, TypeORM relations, and SwiftUI delegate methods
  (`urlSession(_:task:didCompleteWithError:)`, `BGTaskScheduler` handlers,
  `PHImageManager` callbacks). These are called by the framework, not by name.
- **Verify with grep, not just the graph.** The graph misses some call patterns
  (reflection, dynamic dispatch, string-based DI). For each candidate, confirm
  zero callers with `grep -rn "<symbol>" backend/src ios/ColmiRingApp` before
  removing. The grep is the source of truth.
- **Keep public API surface you intend to wire up.** If a helper is unused
  *now* but is part of a façade you plan to call soon, flag it to the user
  rather than silently deleting.

Remove the genuinely dead symbols, then rebuild + reinstall (iOS) or rebuild
(backend) after the removals — a deletion that breaks the build means the
symbol wasn't actually dead; revert it and re-examine.
