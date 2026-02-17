# Kindle Sender — Project Reference

Read this file first before working on this project. It covers how the app works, how it was built, key decisions, and known issues.

## What this is

A web app that lets you paste article URLs, queue them up, and send them to your Kindle as a formatted EPUB ebook via email — similar to Instapaper's send-to-Kindle feature. You paste a link, the app extracts the article content, and when you're ready (or automatically on a schedule), it bundles everything into an EPUB and emails it to your Kindle address.

**This project is being rewritten** from a Python desktop app (v1) to a full-stack TypeScript web app (v2). Both versions live in this repo. See "V2 Web App Rewrite" below for the current plan and progress.

## Project location

`~/Projects/kindle-sender` on the developer's Mac. The repo has a GitHub remote at `github.com/irfanb22/kindle-sender`.

---

# V1 — Python Desktop App (Legacy)

The original app. Still functional but being replaced by the v2 web app. All v1 files live in the repo root.

## V1 Tech stack

- **Backend**: Python 3 / Flask (web server + API routes)
- **Frontend**: Single HTML file with vanilla JS (no frameworks)
- **Article extraction**: trafilatura 2.0
- **EPUB creation**: ebooklib 0.18
- **Email delivery**: Python's built-in smtplib (SMTP via Gmail app passwords)
- **Desktop window**: pywebview 5.3.2 (when running from terminal; disabled in .app bundles)
- **macOS packaging**: py2app (builds a standalone .app bundle)

## V1 File overview

| File | Purpose |
|------|---------|
| `app.py` (~525 lines) | The entire backend: Flask routes, article extraction, EPUB creation, email sending, queue/settings persistence, background scheduler, and app entry points |
| `templates/index.html` (~655 lines) | Single-page frontend with all CSS and JS inline. Two collapsible settings panels. All event binding uses `addEventListener` (no inline `onclick` — those are blocked by pywebview's WebKit CSP) |
| `setup.py` | py2app build configuration. Lists all packages and includes needed for bundling |
| `build.sh` | One-command build script: creates venv, installs deps + py2app, cleans old builds, runs py2app, opens dist/ |
| `requirements.txt` | Python dependencies: flask, trafilatura, ebooklib, pywebview |
| `Kindle Sender.command` | Double-clickable macOS launcher for running without py2app. Creates a venv on first run |
| `icon.icns` | App icon (dark rounded square with open book and green send arrow) |
| `settings.json` | Created at runtime. Stores email config and schedule preferences. Gitignored |
| `queue.json` | Created at runtime. Persists the article queue across launches. Gitignored |

## How the V1 app works

### Core flow

1. User pastes a URL into the input field (or drags a link onto the drop zone)
2. Backend calls `fetch_article()` which uses trafilatura to download and extract readable text, title, and author
3. The extracted article is added to the in-memory `ARTICLES` list and persisted to `queue.json`
4. When the user clicks "Send to Kindle" (or auto-send triggers), `create_epub()` builds an EPUB from all queued articles, and `send_to_kindle_email()` emails it as an attachment
5. On success, the queue is cleared

### Article extraction details

trafilatura 2.0 returns either a dict or a Document object depending on the version, so `fetch_article()` uses `isinstance()` checks with `getattr()` fallbacks to handle both. There's also a `_extract_title_from_html()` fallback that tries `og:title`, `twitter:title`, and `<title>` tags if trafilatura doesn't return a title.

### EPUB format

The EPUB is titled "ReadLater - YYYY-MM-DD" with each article as a separate chapter. Articles get a serif font (Georgia), 1.7 line height, and a metadata line showing author and source URL. The table of contents is auto-generated from chapter titles.

### Email delivery

Uses SMTP (default: Gmail on port 587 with STARTTLS). Requires:
- A Gmail "app password" (not your regular password)
- The sender email added to Amazon's approved senders list
- Your Kindle email address (found in Amazon > Manage Content & Devices > Preferences)

### Auto-send features

Two automation modes, both optional:

1. **Threshold auto-send**: When the queue reaches N articles, they're automatically bundled and sent. Checked every time an article is added.
2. **Scheduled weekly send**: Sends on a specific day/time. A background thread checks every 60 seconds. If the app wasn't open at the scheduled time, `_check_missed_send()` catches up on the next launch (looks back up to 7 days).

### Settings persistence

Settings and schedule preferences are stored in `settings.json`. The frontend uses a merge pattern when saving — it fetches the current settings, updates only the relevant fields, and POSTs the full object back. This prevents the email settings panel from clobbering the schedule settings panel and vice versa.

### Queue persistence

The article queue (including full extracted text) is stored in `queue.json` and loaded on startup. This means articles survive app restarts.

## How to run V1

### From terminal (development)

```bash
cd ~/Projects/kindle-sender
source .venv/bin/activate
python app.py
```

This tries pywebview first (native window), falls back to opening in the browser.

### Double-click launcher

Double-click `Kindle Sender.command`. On first run, it creates a `.venv` and installs dependencies automatically.

### As a macOS .app

```bash
cd ~/Projects/kindle-sender
./build.sh
```

The built app appears at `dist/Kindle Sender.app`. Drag it to Applications. The .app always runs in browser mode (pywebview is disabled in bundles).

## V1 App entry points

`app.py` has three run modes at the bottom:

- `run_desktop()` — Starts Flask on a random free port in a background thread, then opens a pywebview native window pointing at it
- `run_browser()` — Starts Flask on a random free port, opens the system browser, runs Flask in the foreground
- The `__main__` block checks `_is_bundled_app()` to decide: bundled .app always uses `run_browser()`; otherwise tries pywebview first with a fallback to browser

## V1 py2app build — issues encountered and fixes

### 1. charset_normalizer ModuleNotFoundError

**Problem**: The bundled app crashed on launch with `ModuleNotFoundError: charset_normalizer.md__mypyc`.

**Fix**: Added `charset_normalizer` to the `packages` list and `charset_normalizer.md__mypyc` to the `includes` list in `setup.py`.

### 2. pywebview Cocoa crash inside py2app bundles

**Problem**: pywebview's Cocoa/WebKit backend triggers `module 'objc._objc' has no attribute '__file__'` when running inside a py2app bundle.

**Fix**: Added `_is_bundled_app()` detection in `app.py` that checks for `sys.frozen` or `.app/Contents` in the executable path. When detected, the app skips pywebview entirely and uses browser mode. Also removed `webview` from the `setup.py` packages list.

### 3. Port 5000 conflict on macOS Monterey+

**Problem**: First launch would hang (bouncing dock icon, never opens). Second launch after force-quit would work. macOS Monterey and later uses port 5000 for AirPlay Receiver, and `run_browser()` was hardcoding port 5000.

**Fix**: Changed `run_browser()` to use the existing `_find_free_port()` function instead of hardcoded port 5000.

## V1 py2app setup.py packages

These are the packages and includes that py2app needs to bundle correctly:

- **packages**: flask, trafilatura, ebooklib, jinja2, lxml, certifi, charset_normalizer, lxml_html_clean
- **includes**: lxml.html.clean, lxml._elementpath, charset_normalizer.md__mypyc
- webview was intentionally removed from packages (causes Cocoa crash in bundles)

---

# V2 — Web App Rewrite (In Progress)

Full rewrite from Python desktop app to a hosted TypeScript web app. All v2 code lives in the `web/` subdirectory.

## Why the rewrite

- py2app packaging was painful and fragile
- Needed multi-device access (phone, tablet, any browser)
- UI felt rough/outdated — wanted a modern, polished interface
- Wanted new features (article preview/reader, send history)
- Unified language (TypeScript everywhere) instead of Python backend + JS frontend

## V2 Tech stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js (App Router) + React + Tailwind CSS v4 |
| **Backend** | Next.js API routes / Netlify Functions |
| **Auth** | Supabase Auth — magic link (passwordless) |
| **Auth email delivery** | Resend (free tier, 3k emails/month) — custom SMTP in Supabase |
| **Database** | Supabase Postgres |
| **Local cache** | React Query or SWR (planned) |
| **Article extraction** | `@extractus/article-extractor` (replaces trafilatura) |
| **EPUB creation** | `epub-gen-memory` (replaces ebooklib) |
| **Email (Kindle delivery)** | Nodemailer via Netlify Function (Gmail SMTP with app password) |
| **Hosting** | Netlify |

## V2 Supabase details

- **Project URL**: `https://scxkmenczzxpwustppee.supabase.co`
- **Anon key**: stored in `web/.env.local` (gitignored)
- Free tier — no cost

### Database tables

```
users (managed by Supabase Auth)

articles
├── id (uuid, pk)
├── user_id (fk → auth.users)
├── url, title, author, content (extracted HTML)
├── description (article summary/excerpt)
├── read_time_minutes (integer, calculated at 238 wpm)
├── status (queued | sent | failed)
├── created_at, sent_at

send_history
├── id (uuid, pk)
├── user_id (fk → auth.users)
├── article_count, status (success | failed), error_message
├── sent_at

settings
├── user_id (pk, fk → auth.users)
├── kindle_email, sender_email, smtp_password (encrypted)
├── min_article_count, schedule_days (text[]), schedule_time, timezone
├── created_at, updated_at (auto-updated via trigger)
```

## V2 File overview

All files live under `web/`:

| File | Purpose |
|------|---------|
| `web/package.json` | Node dependencies and scripts (`dev`, `build`, `start`, `lint`) |
| `web/tsconfig.json` | TypeScript config with `@/*` path alias to `./src/*` |
| `web/next.config.ts` | Next.js config — `serverExternalPackages` for epub-gen-memory |
| `web/postcss.config.mjs` | PostCSS config for Tailwind CSS v4 (`@tailwindcss/postcss`) |
| `web/.env.local` | Supabase URL and anon key (gitignored) |
| `web/src/app/globals.css` | Global styles — CSS variables for dark theme, Tailwind import |
| `web/src/app/layout.tsx` | Root layout — html/body wrapper, metadata |
| `web/src/app/page.tsx` | Login page — magic link auth via Supabase, editorial dark UI |
| `web/src/app/auth/callback/route.ts` | Auth callback — exchanges Supabase code for session, redirects to dashboard |
| `web/src/middleware.ts` | Route protection — redirects unauthenticated users to login, authenticated users from `/` to `/dashboard` |
| `web/src/lib/supabase/client.ts` | Browser-side Supabase client (uses `createBrowserClient` from `@supabase/ssr`) |
| `web/src/lib/supabase/server.ts` | Server-side Supabase client (uses `createServerClient` with cookie handling) |
| `web/src/lib/supabase/middleware.ts` | Session refresh logic used by the middleware |
| `web/src/app/(app)/layout.tsx` | Authenticated layout — top nav bar (Queue/History/Settings), sign out, user email |
| `web/src/app/(app)/dashboard/page.tsx` | Dashboard — URL input, article queue list, send-to-Kindle with loading/success states |
| `web/src/app/(app)/history/page.tsx` | Send history — last 10 sends with status, article count, timestamps |
| `web/src/app/(app)/settings/page.tsx` | Settings page — email config, auto-send threshold/schedule, test email button |
| `web/src/app/(app)/article/[id]/page.tsx` | Article preview page — fetches article, sanitizes HTML with DOMPurify, renders Kindle mockup |
| `web/src/app/(app)/article/[id]/kindle-mockup.tsx` | Kindle device mockup — CSS bezel frame, e-ink screen, grayscale content rendering |
| `web/src/app/api/articles/extract/route.ts` | Article extraction API — fetches URL, extracts content, calculates read time |
| `web/src/app/api/send/route.ts` | Send-to-Kindle API — generates EPUB with epub-gen-memory, emails via Nodemailer/Gmail SMTP |
| `web/src/app/api/send/test/route.ts` | Test email API — sends a mini test EPUB to verify SMTP config and Kindle address |
| `web/src/app/api/settings/route.ts` | Settings API — GET (load, masked password) / POST (upsert email config + auto-send prefs) |
| `web/src/lib/types.ts` | Shared TypeScript types (Article, Settings, SendHistory) used across pages |
| `web/supabase/migrations/001_create_tables.sql` | Database schema — articles, send_history, settings tables + RLS policies |
| `web/supabase/migrations/002_add_read_time_and_description.sql` | Adds read_time_minutes and description columns to articles |
| `web/supabase/migrations/003_rework_auto_send.sql` | Reworks delivery settings: schedule_day → schedule_days array, auto_send_threshold → min_article_count, adds timezone |
| `web/src/app/api/cron/send/route.ts` | Cron API route — scheduled send logic, called hourly by Supabase pg_cron |

## V2 Design system

- **Theme**: Dark (#0a0a0a bg, #141414 surfaces, #262626 borders, #22c55e green accent)
- **Fonts**: Instrument Serif (headings), DM Sans (body) — loaded via Google Fonts
- **Style**: Editorial/literary aesthetic — serif headings, clean sans body, subtle green glow, grid texture background
- **Animations**: Staggered fadeUp on page load, focus ring transitions on inputs

## How to run V2

```bash
cd ~/Projects/kindle-sender/web
npm run dev
```

Opens at `http://localhost:3000`. Requires Node.js (installed via nvm, v24 LTS).

## V2 Build phases

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Project scaffold, Supabase config, auth flow, basic UI shell | ✅ Complete |
| **Phase 2** | Article extraction API + queue management + Supabase CRUD | ✅ Complete |
| **Phase 3** | Kindle preview page with device mockup | ✅ Complete |
| **Phase 4** | EPUB generation + email sending + settings page | ✅ Complete |
| **Phase 4.5** | Deployment — Netlify hosting, Resend auth emails, production login verified | ✅ Complete |
| **Phase 5** | Auto-send, send history, settings polish, test email | ✅ Complete |
| **Phase 6** | EPUB customization — cover page, fonts, image toggle, metadata controls | ⬜ Not started |
| **Phase 7** | Polish — mobile responsive, loading states, error handling, PWA, branding, custom domain | ⬜ Not started |

### Phase 1 progress

- ✅ Next.js project scaffolded with TypeScript + Tailwind CSS v4
- ✅ Supabase client configured (browser, server, middleware)
- ✅ Environment variables set up (`.env.local`)
- ✅ Auth callback route (`/auth/callback`)
- ✅ Middleware for route protection (login redirect, session refresh)
- ✅ Login page with magic link flow (Instrument Serif + DM Sans, dark editorial design)
- ✅ Supabase database tables (articles, send_history, settings) — with RLS policies
- ✅ Dashboard page shell — URL input, article queue list, send button, empty states
- ✅ App navigation/layout for authenticated pages — shared nav bar via `(app)` route group

### Phase 2 progress

- ✅ Server-side article extraction API (`/api/articles/extract`) using `@extractus/article-extractor`
- ✅ Extracts title, author, content, description from article URLs
- ✅ Read time calculation (238 words per minute) stored in `read_time_minutes` column
- ✅ Background extraction UX — article appears instantly with shimmer loading animation
- ✅ Richer queue cards — title, author (fallback to website name), read time with clock icon
- ✅ Failed extraction warning — amber badge when content can't be extracted
- ✅ Shared Article type definition (`web/src/lib/types.ts`)
- ✅ Database migration 002 — added `read_time_minutes` and `description` columns
- ✅ Middleware updated to exclude API routes from auth redirect

### Phase 3 progress

- ✅ Kindle preview page at `/article/[id]` with client-side data fetching
- ✅ Stylized e-reader device mockup — pure CSS frame (`#3a3a3a` bezel, 420×620px, rounded corners, chin dot)
- ✅ E-ink screen simulation — cream `#f5f1e8` background, Georgia serif typography, grayscale filter on all content
- ✅ HTML sanitization with DOMPurify — explicit allowlist for tags/attributes, blocks scripts and event handlers
- ✅ Scrollable content inside fixed device frame
- ✅ Title + author + read time displayed inside the screen (like ebook chapter start)
- ✅ Loading state with shimmer skeleton inside the Kindle frame
- ✅ Error states — "Article not found" and "Content could not be extracted" with original URL
- ✅ Preview button (eye icon) on dashboard queue cards — hidden during extraction, green hover
- ✅ Wider layout (`max-w-6xl`) for article preview route
- ✅ Back to queue navigation button

### Phase 4 progress

- ✅ EPUB generation using `epub-gen-memory` — in-memory Buffer, no filesystem needed
- ✅ ESM import fix — `epubModule.default ?? epubModule` to get the actual generator function
- ✅ EPUB format matches V1: "ReadLater - YYYY-MM-DD" title, Georgia serif, 1.7 line height, author + URL per chapter
- ✅ Email sending via Nodemailer + Gmail SMTP (app password auth)
- ✅ Kindle body fix — `html: "<div></div>"` instead of `text: ""` to avoid Amazon E009 "No Attachment" rejection
- ✅ Send API route (`/api/send`) — full pipeline: auth → load settings → fetch articles → generate EPUB → send email → update statuses → log to send_history
- ✅ Articles with failed extraction silently skipped (skipped count shown in success message)
- ✅ Separate try/catch for EPUB generation vs email sending — distinct error messages
- ✅ Settings API route (`/api/settings`) — GET with masked password, POST with upsert
- ✅ Settings page — Kindle email, Gmail address, app password inputs with help links
- ✅ Auto-send section shown as disabled "Coming soon" placeholder
- ✅ Password preservation — updating emails without re-entering password uses direct Supabase update
- ✅ Dashboard send button wired up — spinner during send, disabled while articles extracting
- ✅ Green success banner after send, auto-dismiss after 5 seconds
- ✅ Redirects to `/settings` if email config not yet saved
- ✅ `next.config.ts` updated with `serverExternalPackages: ["epub-gen-memory"]`
- ✅ Settings type added to shared types (`web/src/lib/types.ts`)

### Phase 4.5 progress (Deployment)

- ✅ Netlify site created, auto-deploys from GitHub `main` branch
- ✅ `netlify.toml` configured with `@netlify/plugin-nextjs` for SSR/API routes
- ✅ Netlify env vars set (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- ✅ Supabase Site URL + redirect URLs updated for production domain
- ✅ Resend configured as custom SMTP in Supabase (replaces rate-limited built-in email provider)
- ✅ Magic link auth verified working on production (`https://kindle-sender.netlify.app`)
- ✅ Send-to-Kindle verified working on Netlify (manual send + scheduled cron send)

### Phase 5 progress (Auto-Send, History & Settings Polish)

- ✅ Send History page — queries `send_history` table, shows last 10 sends with status icon, article count, error message, smart date formatting
- ✅ `SendHistory` type added to shared types (`web/src/lib/types.ts`)
- ✅ Unified "Automatic Delivery" system — replaces confusing "threshold OR schedule" with day-of-week checkboxes + time + timezone
- ✅ Day picker — 7 pill-style toggles (Mon–Sun), user picks any combination of days
- ✅ Timezone picker — auto-detected via `Intl.DateTimeFormat`, full IANA timezone list via `Intl.supportedValuesOf('timeZone')`
- ✅ Minimum article count — gate on scheduled sends (1–50, default 1), skips delivery if queue is below minimum
- ✅ Dashboard simplified — removed threshold countdown toast, timer, and cancel button entirely
- ✅ Scheduled send via Supabase `pg_cron` + `pg_net` calling `/api/cron/send` hourly — multi-day matching (`schedule_days` array contains current day), timezone-aware via `Intl.DateTimeFormat`
- ✅ Uses Supabase service role key to bypass RLS (runs without user session)
- ✅ `netlify.toml` cleaned up (removed `[functions]` config — Netlify standalone functions don't work with Next.js plugin)
- ✅ Settings page visual polish — section header icons, card-like groupings, better spacing
- ✅ Test email button — sends a mini test EPUB to verify full pipeline (SMTP config + Kindle address)
- ✅ Test email API route (`/api/send/test`) — generates small EPUB with delivery confirmation content
- ✅ Test button disabled until email settings are saved; shows spinner during send
- ✅ Password-preserving save — updating delivery settings without re-entering password uses direct Supabase update
- ✅ DB migration 003 — `schedule_day` → `schedule_days text[]`, `auto_send_threshold` → `min_article_count`, added `timezone` column
- ✅ `SUPABASE_SERVICE_ROLE_KEY` env var set on Netlify
- ⚠️ Netlify Scheduled Functions do NOT work with `@netlify/plugin-nextjs` — the plugin overrides standalone functions entirely. Cron is handled by Supabase `pg_cron` instead.

### Phase 6 plan (EPUB Customization)

Goal: Make the EPUB output polished and customizable — branded cover page, font options, image control, and per-field metadata toggles.

#### Cover page

- Minimal editorial style — clean branded cover on every digest
- Shows: app name ("Kindle Sender" — branding TBA), digest/issue number (auto-incrementing per user, tracked in DB), date, total estimated read time, article count
- Issue numbering uses both formats: "Issue #12 — Feb 14, 2026"
- Read time is estimated across all articles (extracted where available, estimated where not)
- Cover is always included (no toggle) — it's part of the product identity

#### Table of contents

- Kindle native TOC only (chapter-level navigation via Kindle's built-in TOC)
- No custom styled TOC page inside the EPUB

#### Article formatting

- Keep current article style: title, metadata line, then content flows directly (no chapter title pages)
- Article metadata fields are independently toggle-able per user:
  - Author/name (on/off)
  - Read time (on/off)
  - Published date (on/off, shown if available from extraction)
  - Source URL is not included in the EPUB (already removed in current implementation)

#### Font options

- User-selectable font for article body text
- Options: Bookerly (Kindle default), Georgia, Palatino, Helvetica
- Font choice stored in settings, applied as CSS in EPUB chapters
- Default: Bookerly (matches native Kindle reading experience)

#### Image handling

- Simple toggle: include images (on/off)
- Default: on (images included)
- When off, all `<img>` tags stripped from article content before EPUB generation
- When on, images optimized for Kindle: grayscale not forced in EPUB (Kindle handles display), `ignoreFailedDownloads: true` kept as safety net

#### Settings UI

- New "EPUB Formatting" section on the existing Settings page (below email config)
- Fields: font choice (dropdown), include images (toggle), metadata toggles (author, read time, published date)
- Stored in `settings` table (new columns or JSON field)

#### Database changes

- Add `issue_number` column to `send_history` (integer, auto-incremented per user on each successful send)
- Add EPUB preference columns to `settings` table: `epub_font`, `epub_include_images`, `epub_show_author`, `epub_show_read_time`, `epub_show_published_date`
- Alternative: single `epub_preferences` JSONB column on `settings` (more flexible, fewer migrations)

#### Not included in Phase 6

- No archive/read-tracking links in EPUB (decided against for now)
- No custom TOC page styling (using Kindle native TOC)
- No cover page toggle (always on)
- No article separator customization (keeping current flowing style)
- No source URL in EPUB metadata (already removed in current implementation)

### Phase 7 plan (Polish, Branding & Custom Domain)

- **Clickable article links** — queue cards link to original article URL, displayed as clean domain (e.g. "ofdollarsanddata.com" links to full URL, opens in new tab)
- **Enhanced send history** — click into a send to see which articles were included. Requires storing article titles/URLs per send (JSON array on send_history or join table). Detail view shows article list with titles and sources.
- Mobile responsive design — breakpoints for phone/tablet, responsive Kindle mockup
- Loading states and error handling improvements across all pages
- PWA manifest, service worker, app icons
- **Favicon / web icon** — part of branding work, designed alongside logo and app identity
- **Branding** — finalize app name (currently "Kindle Sender" as codename), logo, color palette, favicon, update cover page branding to match
- **Custom domain** — purchase and configure custom domain (replace `kindle-sender.netlify.app`), update Supabase redirect URLs, Resend sender domain with DNS verification
- Resend custom domain setup (replace `onboarding@resend.dev` with branded sender email)

## V2 Pages (planned)

| Route | Purpose |
|-------|---------|
| `/` | Login — magic link email input |
| `/dashboard` | Main app — URL input, article queue, send button |
| `/article/:id` | Article reader/preview — read extracted content before sending |
| `/history` | Last 10 sends with status |
| `/settings` | Kindle email, SMTP config, auto-send preferences |

## V2 Deployment

- **Live URL**: https://kindle-sender.netlify.app
- **Hosting**: Netlify (free tier, auto-deploys from `main` branch)
- **Database**: Supabase free tier (already cloud-hosted)
- **Build**: Netlify builds from GitHub repo, `base = "web"`, `npm run build`, Node 22 LTS
- **Config file**: `netlify.toml` at repo root (not inside `web/`)
- **Plugin**: `@netlify/plugin-nextjs` (required for SSR/API routes on Netlify)
- **Env vars on Netlify**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (set via CLI)
- **Supabase Site URL**: Must be set to `https://kindle-sender.netlify.app` (in Auth > URL Configuration)
- **Supabase Redirect URLs**: Must include `https://kindle-sender.netlify.app/auth/callback` and `http://localhost:3000/auth/callback`
- **Supabase Custom SMTP**: Resend (configured in Supabase Dashboard > Project Settings > Auth > SMTP Settings)
  - **Host**: `smtp.resend.com`
  - **Port**: `465`
  - **Username**: `resend`
  - **Password**: Resend API key (set in Supabase dashboard, not in codebase)
  - **Sender email**: `onboarding@resend.dev` (Resend shared domain)

### Deployment status

- ✅ Site created and building from GitHub `main` branch
- ✅ Netlify env vars configured
- ✅ Supabase Site URL updated to Netlify domain
- ✅ Supabase redirect URL added for Netlify domain
- ✅ **Auth login verified working** — magic link emails delivered via Resend custom SMTP. Supabase's built-in email provider was silently dropping emails due to free-tier rate limits; Resend fixed this.
- ⚠️ **Send-to-Kindle not yet tested on Netlify** — works locally, but serverless function timeout (26s limit) could be an issue for large queues

### Deployment files

| File | Purpose |
|------|---------|
| `netlify.toml` | Build config — base dir, build command, Node version, Next.js plugin |
| `web/package.json` | Added `@netlify/plugin-nextjs` to devDependencies |

### Deployment gotchas

- `netlify.toml` `base` resolves relative to the git repo root, not the current working directory. In worktrees, Netlify CLI may resolve to the main repo's `web/` instead of the worktree's. Use GitHub integration (auto-deploy from push) instead of local `netlify deploy --build`.
- Netlify's `--no-build` deploy with `--dir=.next` does NOT work for Next.js apps with SSR/API routes. The `@netlify/plugin-nextjs` must run during the build to properly set up serverless functions.
- Node 22 LTS is used instead of v24 since Netlify may not support v24 yet.
- The `require()` import for epub-gen-memory (instead of ESM `import`) was needed to avoid TypeScript strict mode error on `.default` property access in the Netlify build environment.

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-02-08 | Rewrite as full-stack TypeScript web app | py2app was fragile, needed multi-device access, wanted modern UI |
| 2025-02-08 | Chose Next.js + Tailwind + Supabase + Netlify | Developer had Netlify/Supabase accounts; Next.js has best Netlify support; Supabase gives free Postgres + auth |
| 2025-02-08 | Magic link auth (passwordless) | Simpler UX, no passwords to manage |
| 2025-02-08 | Supabase + local cache for storage | Supabase as source of truth for multi-device sync, local cache for speed |
| 2025-02-08 | Keep v1 Python code in repo root | Still functional, can reference during rewrite, no need to delete yet |
| 2025-02-08 | Node.js installed via nvm (v24 LTS) | Developer didn't have Node installed; nvm allows easy version management |
| 2025-02-10 | Background extraction UX (not inline wait) | Matches Instapaper/Reader pattern — article appears instantly, content fills in |
| 2025-02-10 | Author fallback to website name | If no author extracted, show publisher/source name, then domain as last resort |
| 2025-02-10 | Read time at 238 wpm | Industry standard reading speed; stored as integer minutes in DB |
| 2025-02-10 | Split Kindle preview into separate Phase 3 | Keep Phase 2 focused on extraction; preview is a distinct feature |
| 2025-02-10 | Failed extraction adds with warning, not rejected | User keeps the URL in queue even if content can't be extracted |
| 2025-02-10 | Generic stylized Kindle mockup (not specific model) | Avoids trademark issues; cleaner look with CSS-only frame |
| 2025-02-10 | E-ink grayscale filter on article content | CSS `filter: grayscale(1)` simulates real Kindle e-ink display |
| 2025-02-10 | DOMPurify for HTML sanitization (client-side) | Industry standard; explicit allowlist prevents XSS from extracted article HTML |
| 2025-02-10 | Dedicated Preview button (not clickable card) | Explicit action keeps delete button safe from accidental clicks |
| 2025-02-10 | Scrollable content inside fixed frame | More realistic than paginated; simpler to implement |
| 2025-02-10 | Lighter bezel (`#3a3a3a`) against dark background | Dark `#1a1a1a` bezel was invisible on `#0a0a0a` app background |
| 2025-02-12 | `epub-gen-memory` for EPUB generation | In-memory Buffer output, no filesystem writes, works in serverless |
| 2025-02-12 | Main import, not `/sabstub` subpath | `/sabstub` uses `window` which breaks in Node.js server-side |
| 2025-02-12 | `epubModule.default ?? epubModule` pattern | ESM default import returns module object, not the function |
| 2025-02-12 | Nodemailer with `html: "<div></div>"` body | Amazon Kindle rejects emails with no body (E009); Python's MIMEMultipart always includes one |
| 2025-02-12 | Keep images in EPUB | Richer content; `ignoreFailedDownloads: true` as safety net for slow servers |
| 2025-02-12 | Settings page pulled forward from Phase 5 | Needed for send flow; built full page instead of a temporary modal |
| 2025-02-12 | Skip articles with failed extraction silently | Send only articles with content; show skipped count in success message |
| 2025-02-12 | Password masked in GET, preserved on email-only updates | Never send actual password to client; direct Supabase update avoids re-entering password |
| 2025-02-14 | Deploy to Netlify now (before Phase 5) | Get it live with current features; iterate and redeploy |
| 2025-02-14 | Netlify free subdomain (not custom domain) | `kindle-sender.netlify.app` is sufficient for now |
| 2025-02-14 | `@netlify/plugin-nextjs` required | Without it, Netlify serves 404 for all routes — SSR/API routes need the plugin |
| 2025-02-14 | Node 22 LTS for Netlify builds | v24 may not be supported on Netlify yet |
| 2025-02-14 | `require()` for epub-gen-memory in send route | ESM `import` caused TS strict mode error on `.default` access during Netlify build |
| 2025-02-14 | GitHub integration for deploys (not local CLI) | Worktree path resolution issues with `netlify deploy --build`; GitHub auto-deploy is more reliable |
| 2026-02-14 | Resend for Supabase auth emails (not built-in provider) | Supabase's free-tier email provider silently drops emails after ~3-4/hour with no error. Resend free tier (3k/month) configured as custom SMTP in Supabase dashboard. Uses shared `onboarding@resend.dev` domain — no custom domain needed. |
| 2026-02-14 | EPUB customization as Phase 6 (not part of Phase 5) | Phase 5 focuses on auto-send/history. EPUB formatting (cover page, fonts, images, metadata) is a distinct feature set that deserves its own phase. Bumped polish/PWA to Phase 7. |
| 2026-02-14 | Cover page always on (no toggle) | Part of product identity — every digest gets a branded cover. Reduces settings complexity. |
| 2026-02-14 | Kindle-native fonts only (Bookerly, Georgia, Palatino, Helvetica) | Ensures fonts render correctly on all Kindle devices without embedding font files in EPUB. |
| 2026-02-14 | JSONB column for EPUB preferences (considered) | Single `epub_preferences` JSONB column vs individual columns — more flexible for adding future options without migrations. Decision TBD at implementation time. |
| 2026-02-14 | No archive/read-tracking links in EPUB | Adds complexity (server-side redirect routes, tracking state) for marginal value. Can revisit later. |
| 2026-02-15 | Supabase pg_cron for scheduled send (replaces Netlify Scheduled Function) | `@netlify/plugin-nextjs` completely overrides standalone Netlify functions — the Next.js Server Handler intercepts all invocations, so standalone functions never execute (zero logs, zero metrics). Replaced with Supabase `pg_cron` + `pg_net` calling `/api/cron/send` every hour. Cron job created via SQL in Supabase dashboard. Requires SUPABASE_SERVICE_ROLE_KEY env var on Netlify. |
| 2026-02-15 | Test email sends mini EPUB (not plain text) | Tests the full pipeline: EPUB generation + SMTP + Kindle delivery. Catches more failure modes than a plain text email. |
| 2026-02-15 | Send history shows simple summary (no article titles) | DB only stores article_count; avoids join table complexity. Shows date, count, and status per entry. |
| 2026-02-16 | Unified delivery system (replaced threshold + single-day schedule) | Instapaper-inspired design. Day-of-week checkboxes instead of dropdown, minimum article count as gate instead of threshold trigger, timezone picker. Simpler, clearer UX. |
| 2026-02-16 | Day checkboxes instead of daily/weekly dropdown | User picks any combination of Mon–Sun. More flexible than "daily or pick one day". |
| 2026-02-16 | Minimum article count as gate (not threshold trigger) | Scheduled sends skip if queue < minimum. Removed countdown toast from dashboard entirely — less intrusive. |
| 2026-02-16 | Timezone picker with auto-detection | `Intl.supportedValuesOf('timeZone')` for full list, `Intl.DateTimeFormat().resolvedOptions().timeZone` for auto-detect. No external library needed. |
| 2026-02-16 | `schedule_days text[]` column (replaces `schedule_day text`) | Postgres array column stores multiple days. Scheduled function checks if current day is in the array. |
