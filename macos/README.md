# HealthTip — minimal macOS app + widget

A tiny macOS app and Notification Center widget that show the latest hourly
AI health tip from the grig-teo.space backend (`/api/health/tips`). While
the app is running it polls every 15 minutes and posts a **macOS
notification** whenever a new tip appears on the server (first launch asks
for notification permission; the tip current at install time is recorded
silently so it doesn't fire once for no reason).

## Build

```bash
cp Shared.xcconfig.example Shared.xcconfig   # fill in the real device key
brew install xcodegen                        # one-time
cd macos
xcodegen generate
xcodebuild -project HealthTip.xcodeproj -scheme HealthTip -configuration Release \
  -derivedDataPath build/DD build
```

The app lands at `build/DD/Build/Products/Release/HealthTip.app`. Move it to
`/Applications` (or `~/Applications`) and **launch it once** — that registers
the widget extension with the system.

## Add the widget

1. Open Notification Center (click the clock in the menu bar).
2. Scroll down → **Edit Widgets**.
3. Find **Health Tip** → drag the small or medium widget in.

The widget refreshes itself every 30 minutes; the app refreshes on open and
via the circular-arrow button.

## Layout

```
project.yml            # XcodeGen spec (app + widget targets)
Shared.xcconfig.example# build-time backend URL + device key template
Shared/                # TipFetcher (shared by app + widget)
HealthTipApp/          # the windowed app
TipWidget/             # the Notification Center widget
```

No sandbox, no App Group — the backend URL and device key are baked into
each target's Info.plist from `Shared.xcconfig` (gitignored), same pattern
as the iOS app.
