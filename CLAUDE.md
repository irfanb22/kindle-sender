# Kindle Sender — Project Reference

Read this file first before working on this project. It covers how the app works, how it was built, key decisions, and known issues.

## What this is

A Python desktop app that lets you paste article URLs, queue them up, and send them to your Kindle as a formatted EPUB ebook via email — similar to Instapaper's send-to-Kindle feature. You paste a link, the app extracts the article content, and when you're ready (or automatically on a schedule), it bundles everything into an EPUB and emails it to your Kindle address.

## Project location

`~/Projects/kindle-sender` on the developer's Mac. The repo has a GitHub remote at `github.com/irfanb22/kindle-sender`.

## Tech stack

- **Backend**: Python 3 / Flask (web server + API routes)
- **Frontend**: Single HTML file with vanilla JS (no frameworks)
- **Article extraction**: trafilatura 2.0
- **EPUB creation**: ebooklib 0.18
- **Email delivery**: Python's built-in smtplib (SMTP via Gmail app passwords)
- **Desktop window**: pywebview 5.3.2 (when running from terminal; disabled in .app bundles)
- **macOS packaging**: py2app (builds a standalone .app bundle)

## File overview

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

## How the app works

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

## How to run it

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

## App entry points

`app.py` has three run modes at the bottom:

- `run_desktop()` — Starts Flask on a random free port in a background thread, then opens a pywebview native window pointing at it
- `run_browser()` — Starts Flask on a random free port, opens the system browser, runs Flask in the foreground
- The `__main__` block checks `_is_bundled_app()` to decide: bundled .app always uses `run_browser()`; otherwise tries pywebview first with a fallback to browser

## py2app build — issues encountered and fixes

### 1. charset_normalizer ModuleNotFoundError

**Problem**: The bundled app crashed on launch with `ModuleNotFoundError: charset_normalizer.md__mypyc`.

**Fix**: Added `charset_normalizer` to the `packages` list and `charset_normalizer.md__mypyc` to the `includes` list in `setup.py`.

### 2. pywebview Cocoa crash inside py2app bundles

**Problem**: pywebview's Cocoa/WebKit backend triggers `module 'objc._objc' has no attribute '__file__'` when running inside a py2app bundle.

**Fix**: Added `_is_bundled_app()` detection in `app.py` that checks for `sys.frozen` or `.app/Contents` in the executable path. When detected, the app skips pywebview entirely and uses browser mode. Also removed `webview` from the `setup.py` packages list.

### 3. Port 5000 conflict on macOS Monterey+

**Problem**: First launch would hang (bouncing dock icon, never opens). Second launch after force-quit would work. macOS Monterey and later uses port 5000 for AirPlay Receiver, and `run_browser()` was hardcoding port 5000.

**Fix**: Changed `run_browser()` to use the existing `_find_free_port()` function instead of hardcoded port 5000.

## Current py2app setup.py packages

These are the packages and includes that py2app needs to bundle correctly:

- **packages**: flask, trafilatura, ebooklib, jinja2, lxml, certifi, charset_normalizer, lxml_html_clean
- **includes**: lxml.html.clean, lxml._elementpath, charset_normalizer.md__mypyc
- webview was intentionally removed from packages (causes Cocoa crash in bundles)

## Future ideas

- Native Swift/SwiftUI rewrite with menu bar integration and notifications (if py2app continues to be problematic)
- Restructure `app.py` into separate modules: `extraction.py`, `epub_builder.py`, `mailer.py`, `scheduler.py`
