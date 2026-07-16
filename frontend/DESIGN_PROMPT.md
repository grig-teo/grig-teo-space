# DESIGN_PROMPT.md — "BUILD LOG" redesign of grig-teo.space

> Generated from the live production data (profile, projects, experience, blog)
> on 2026-07-16. This file is the single source of truth for the redesign.
> Every implementation agent MUST read this file fully before editing code.

## 1. The data the design must serve

- **Profile**: Gregory Theodor — Full-Stack Developer, Moldova. Born in
  Cioburciu, Transnistria; Romanian-language school; ~4 years taekwondo;
  programming college in Krasnogorsk; first job as Java dev at Crossix in
  Chisinau; enjoys nature and music.
- **Projects (3, all in active development)**:
  - *Politrack* — civic-tech political intelligence platform (Next.js, FastAPI,
    Playwright, SpeechBrain ML, MinIO). https://politrack.space
  - *Vecin2Vecin* — hyperlocal P2P grocery delivery marketplace (Next.js,
    NestJS, MongoDB, Stripe, Leaflet). https://vecin2vecin.ro/
  - *Debate Room* — cross-platform live debate app, iOS/Android/web with
    real-time A/V (Swift, Kotlin, mediasoup, Socket.IO). https://debate-room.ru/en
- **Experience (6 roles, 2018 → present)**: GlavUpDK (Android, offline-first,
  OCR, CI) → Vecin2Vecin (Founder) → Debate Zone (Founder) → FeelIT (backend,
  OpenAI) → Amdaris (backend, Java/Spring/Kafka) → Crossinx (backend + Android,
  Java, OpenCV).
- **Blog (4 articles)**: COLMI R11 BLE reverse-engineering; Durov at Oslo
  Freedom Forum; AI-era hiring; supermarket delivery without APIs.

**Narrative**: one builder who ships entire products alone — hardware
protocols, real-time media, marketplaces, civic data. 8 years from enterprise
Java to indie founder. Mobile (iOS + Android) is first-class.

## 2. Concept: "BUILD LOG"

An evolved engineer's console. We KEEP the terminal soul (the `grig-teo:~$`
prompt is the brand) but grow it up:

- **Dark-first** palette, phosphor-teal accent (was blue), amber as the
  secondary "status" accent (in-development badges, featured article, founder
  era chips).
- **Typography inversion**: today everything is monospace. New: monospace is
  the *voice of the system* (nav, headings, labels, badges, stats, prompts)
  and a clean **sans is the voice of the content** (paragraphs, excerpts,
  about text). This contrast IS the redesign.
- **Depth**: cards sit on a lifted `surface` with soft radius (6–8px) and a
  hairline border; hover raises a subtle accent glow. No drop-shadow soup —
  one restrained glow max.
- **Data-forward hero**: the landing immediately shows the proof — a stats
  strip computed from the real data (see §5), not a bare name.

## 3. Design tokens (exact values — implement verbatim)

CSS variables in `frontend/src/app/globals.css`. Dark is the flagship; light
is a warm-paper variant. Keep the existing `data-theme` attribute mechanism
and `prefers-color-scheme` fallback exactly as they work today.

```css
:root {                       /* light — warm paper */
  --color-background: 248 248 245;
  --color-surface:    255 255 255;
  --color-foreground: 22 28 38;
  --color-muted:      92 104 118;
  --color-accent:     13 148 136;   /* teal-600 */
  --color-accent-2:   180 120 10;   /* readable amber */
  --color-border:     222 224 228;
}
html[data-theme='dark'], (prefers-dark fallback) {
  --color-background: 10 13 18;     /* deep ink */
  --color-surface:    17 22 30;     /* lifted card */
  --color-foreground: 226 232 240;  /* slate-200 */
  --color-muted:      125 138 155;
  --color-accent:     45 212 191;   /* teal-400 phosphor */
  --color-accent-2:   251 191 36;   /* amber-400 */
  --color-border:     38 47 60;
}
```

Tailwind (`frontend/tailwind.config.ts`): add `surface` and `accent-2`
(note: `accent-2` → class `bg-accent-2`, `text-accent-2`, `border-accent-2`)
to `colors`, and add `fontFamily.sans` (system-ui stack:
`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`).
Keep `fontFamily.mono` as-is. NO webfont downloads.

`body` switches to `font-sans`; mono is applied explicitly to headings, nav,
labels, badges, stats, buttons (see component specs).

### Signature CSS utilities (globals.css)

- `.bg-mesh` — keep the animated SVG mesh (Background.tsx) but RE-PALETTE the
  blobs: teal `rgb(45 212 191 / 0.35)`, indigo `rgb(99 102 241 / 0.30)`,
  amber `rgb(251 191 36 / 0.18)` (dark); teal/indigo/amber at ~0.30/0.25/0.15
  (light). Same 3-blob structure + drift keyframes + reduced-motion guard.
- `.bg-grid` — NEW faint engineering grid layered over the mesh:
  `background-image: linear-gradient(rgb(var(--color-foreground) / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--color-foreground) / 0.035) 1px, transparent 1px); background-size: 44px 44px;`
  fixed full-viewport, z-index -1, pointer-events none. Render it as a plain
  div next to `<Background />` in the locale layout (chrome agent adds it —
  layout file edit is assigned there).
- `.glow-card` — card hover: `transition: border-color .2s, box-shadow .2s;`
  hover → `border-color: rgb(var(--color-accent) / 0.6); box-shadow: 0 0 24px rgb(var(--color-accent) / 0.12);`
- Keep `.cursor-blink` and `::selection` (retint selection to accent).
- Retint the `.admin-blocknote` / `.blog-body-viewer` BlockNote overrides to
  the new tokens (replace hardcoded `#000/#111/#fff` with token-based values:
  editor bg `rgb(var(--color-surface))`, text `rgb(var(--color-foreground))`,
  menus `rgb(var(--color-background))`, borders `rgb(var(--color-border))`).
- Scrollbar: thin, `color-border` thumb on transparent (webkit + Firefox).

## 4. i18n key spec (en / ru / ro) — implement EXACTLY these keys

Existing keys stay untouched (nav, sections.blog/projects/experience,
viewAll, viewAllArticles, readMore, footer.*, projectsPage.*,
experiencePage.*, blogPage.*, meta.*, health.*). ADD:

```json
"hero": {
  "prompt": "grig-teo:~$",                       // exists already
  "whoami": "$ whoami",
  "tagline": {
    "en": "I ship whole products alone — from Bluetooth protocols to marketplaces.",
    "ru": "Я один довожу продукты до релиза — от Bluetooth-протоколов до маркетплейсов.",
    "ro": "Livrez produse întregi de unul singur — de la protocoale Bluetooth la marketplace-uri."
  },
  "domains": {
    "en": "marketplaces · real-time A/V · civic data · health tech",
    "ru": "маркетплейсы · real-time A/V · гражданские данные · health-tech",
    "ro": "marketplace-uri · A/V în timp real · date civice · health-tech"
  },
  "stats": {
    "years":    { "en": "{value}+ yrs", "ru": "{value}+ лет", "ro": "{value}+ ani" },
    "roles":    { "en": "{value} roles", "ru": "{value} ролей", "ro": "{value} roluri" },
    "products": { "en": "{value} products", "ru": "{value} продукта", "ro": "{value} produse" },
    "articles": { "en": "{value} articles", "ru": "{value} статьи", "ro": "{value} articole" }
  },
  "ctaProjects": { "en": "view projects", "ru": "смотреть проекты", "ro": "vezi proiectele" },
  "ctaContact":  { "en": "get in touch →", "ru": "связаться →", "ro": "contactează-mă →" }
},
"sections": {
  "... existing keys ...": "",
  "featured": { "en": "featured", "ru": "избранное", "ro": "recomandat" },
  "eraFounder":  { "en": "founder", "ru": "основатель", "ro": "fondator" },
  "eraIndustry": { "en": "industry", "ru": "компании", "ro": "industrie" }
}
```

(In the real JSON files each leaf is a plain translated string, not a
per-locale object — the table above is just compact notation.)

## 5. Component specs

### 5.1 Hero (`frontend/src/components/Hero.tsx`, full rewrite)

Props change: `Hero({ profile, stats }: { profile: Profile; stats: HeroStats })`
where `HeroStats = { years: number; roles: number; products: number; articles: number }`
is computed in `[locale]/page.tsx`:

- `years` = current year − earliest start year parsed from `ExperienceItem.period`
  (`"2018 — 2021"` → 2018; take the min over all items).
- `roles` = experience.length, `products` = projects.length,
  `articles` = blogPosts.length.

Layout (max-w-5xl, left-aligned, py-20+):

1. **Terminal card** — `bg-surface border border-border rounded-lg font-mono`,
   header bar with 3 traffic dots + `grig-teo:~$`; body: line `$ whoami`
   (text-muted) → **name** in `text-4xl md:text-6xl font-bold font-mono`
   (text-foreground) → title `text-accent` → location `text-muted`.
2. **Tagline** — `t('hero.tagline')`, font-sans text-lg text-muted, max-w-2xl.
3. **About** — `profile.about`, font-sans text-sm leading-relaxed text-muted,
   max-w-2xl. The Transnistria story is identity — show it, don't hide it.
4. **Stats strip** — 4 cells in a `divide-x divide-border border border-border
   rounded-lg bg-surface` row (wrap on mobile): each cell mono, first line
   the formatted stat via `t('hero.stats.*', { value })` in
   `text-lg text-accent`, nothing else. No labels — the string carries it.
5. **Domain chips** — `t('hero.domains')` split on `·` into pill badges:
   `border border-border rounded-full px-3 py-1 text-xs font-mono text-muted`.
6. **CTAs** — primary `bg-accent text-background rounded px-5 py-2.5 font-mono
   text-sm hover:opacity-90` linking to `#projects` (`t('hero.ctaProjects')`),
   ghost `border border-border ... hover:border-accent` linking to `#contact`
   (`t('hero.ctaContact')`).

### 5.2 Landing composition (`[locale]/page.tsx`)

Section order: Hero → **Projects** → **Blog** → Experience (work before
writing). Fetch data as today, compute `HeroStats` (extract a small helper,
<30 lines), pass to Hero. Keep `<JsonLd>`.

### 5.3 Content sections (`Blog.tsx`, `Projects.tsx`, `Experience.tsx`)

Keep ALL exported names and prop signatures (`BlogPreview`, `BlogList`,
`ProjectCard`, `ProjectsPreview`, `Experience`) — pages import them.

- **Section headers** (all three): mono `text-sm text-muted` prefix `## ` in
  accent + title, right side keeps the `view all →` link. E.g.
  `<span class="text-accent">##</span> /projects`.
- **BlogPreview**: first post = featured wide card (grid md:grid-cols-2,
  first card spans both cols / or md:col-span-2 row): amber `featured` badge
  (`text-accent-2 border-accent-2/50`), date mono text-xs, title text-xl
  font-semibold, excerpt font-sans. Remaining posts in the 3-col grid. Cards:
  `bg-surface border border-border rounded-lg p-6 glow-card`.
- **ProjectsPreview**: 3-col grid (there are exactly 3 — show all). Card:
  surface + rounded-lg + glow-card; header row: title (mono font-semibold) +
  in-development badge → `text-accent-2 border border-accent-2/50 rounded
  px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono`; description
  font-sans text-sm text-muted line-clamp-4; footer: tags as
  `text-xs font-mono text-muted/80` plain text separated by middle dots
  (drop the bordered tag boxes — cleaner); external icon top-right on hover.
- **Experience**: single vertical timeline, rail `left-[5px] w-px bg-border`,
  node = `rounded-full border-2` — `border-accent-2` when `role` contains
  "Founder" (case-insensitive), else `border-accent`; era chip next to the
  period: `t('sections.eraFounder')` / `t('sections.eraIndustry')` as
  `text-[10px] uppercase tracking-wider font-mono` (amber chip for founder,
  muted chip for industry). Period mono text-xs; role text-accent mono;
  company link keeps current behavior; description font-sans.

### 5.4 Detail/list pages (blog list+detail, projects, experience/[id], health)

- Blog detail: article column `max-w-2xl mx-auto`; title mono text-3xl; date
  mono text-xs text-muted; body via `BlogBodyViewer` (font-sans, leading-7).
  Back links keep `← back` mono style.
- Projects page: uses `ProjectCard detailed` — detailed variant gets the same
  surface/rounded/glow treatment; highlights list marker `—` in accent; visit
  link = accent button outline.
- Experience detail: summary font-sans text-base, highlights with `—` accent
  markers, stack in a `bg-surface border rounded-lg p-4 font-mono text-xs`.
- Health page + `HealthWidget`: restyle metric cards to surface/rounded/
  tokens; keep all logic. Mono numerals for metric values.

### 5.5 Chrome (Header, Footer, switchers, modal, chat widget)

- Header: keep sticky + blur; bg becomes `bg-background/80
  backdrop-blur-md border-b border-border`. Brand link unchanged concept
  (`grig-teo:~$` + blinking cursor). Nav links: `font-mono text-sm
  text-muted hover:text-accent` (drop the underscore-prefixed accent links —
  nav reads as system labels now). Mobile menu: same items, surface bg.
- Footer: top border; left = CV button (accent outline → filled hover,
  rounded, mono); right = social icons `text-muted hover:text-accent`. Add a
  small mono line `designed & built by grig-teo` … actually NO — keep it
  minimal, no new footer text.
- ThemeSwitcher/LanguageSwitcher: restyle to `border border-border rounded
  px-2 py-1 font-mono text-xs text-muted hover:border-accent` — keep behavior.
- CvDownloadModal: surface card, rounded-lg, token colors, accent confirm.
- AssistantChatWidget: retint to tokens (surface panel, accent send button);
  zero logic changes.

### 5.6 Admin (`/admin/**` + `components/admin/**`) — RESTYLE ONLY, zero logic changes

- Login: centered `bg-surface border border-border rounded-lg p-8` card,
  mono heading `grig-teo:~$ admin`, input `bg-background border-border
  rounded px-3 py-2 focus:border-accent outline-none`, button filled accent.
- Dashboard header: keep links/logout behavior; nav becomes segmented control
  (container `border border-border rounded-lg p-0.5`, active `bg-accent
  text-background rounded-md`, inactive `text-muted hover:text-foreground`).
- AdminEditor (973 lines — touch classes only, NO state/effect/handler edits):
  tabs → same segmented control; every panel `bg-surface border border-border
  rounded-lg p-6`; section titles `font-mono text-xs uppercase tracking-wider
  text-muted`; inputs/textarea/select `bg-background border border-border
  rounded px-3 py-2 text-sm font-sans focus:border-accent outline-none`;
  save/autosave status in a sticky bar under the header
  (`sticky top-[57px] z-10 bg-background/80 backdrop-blur`) with mono text-xs;
  destructive buttons `text-red-400 border-red-400/40 hover:bg-red-400/10`.
- HealthCharts, PublicExposurePanel, BlogBodyEditor: retint hardcoded colors
  to tokens; keep structure.

## 6. Hard constraints (all agents)

1. NO backend, DB, API, or data-model changes. Frontend only.
2. NO new npm dependencies. Tailwind + existing libs only.
3. Keep `next-intl` patterns (`useTranslations`, `Link` from `@/i18n/navigation`).
4. Keep all exported component names and prop signatures unless this file
   explicitly changes them (only Hero changes props).
5. Keep `JsonLd`, metadata generation, `robots.ts`, `sitemap.ts` untouched.
6. Functions ≤ ~30 lines; guard clauses; match AGENTS.md comment style
   (JSDoc on non-obvious functions only).
7. Edit ONLY the files assigned to you — other agents own the rest.
8. Do NOT run `npm run build` / dev servers — the orchestrator verifies the
   integration build after all agents finish.
9. Content strings come from the DB via existing API types
   (`frontend/src/lib/api.ts`) — do not hardcode user content into components
   (i18n UI labels are fine, portfolio content is not).
10. `page.tsx` files under `[locale]` are server components; the section
    components they render stay client components as they are today.
