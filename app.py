"""
Kindle Sender — Send web articles to your Kindle as a nicely formatted ebook.
Double-click 'Kindle Sender.command' to launch, or run: python app.py
"""

import os
import json
import uuid
import smtplib
import html as html_mod
import threading
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

from flask import Flask, render_template, request, jsonify
import trafilatura
from ebooklib import epub

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)

APP_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(APP_DIR, "settings.json")
QUEUE_FILE = os.path.join(APP_DIR, "queue.json")

ARTICLES: list[dict] = []  # in-memory queue (synced to disk)


# ---------------------------------------------------------------------------
# Helpers — settings
# ---------------------------------------------------------------------------
def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    return {}


def save_settings(settings: dict) -> None:
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


# ---------------------------------------------------------------------------
# Helpers — queue persistence
# ---------------------------------------------------------------------------
def load_queue() -> list[dict]:
    if os.path.exists(QUEUE_FILE):
        try:
            with open(QUEUE_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def save_queue() -> None:
    with open(QUEUE_FILE, "w") as f:
        json.dump(ARTICLES, f, indent=2)


# ---------------------------------------------------------------------------
# Helpers — article extraction
# ---------------------------------------------------------------------------
def _extract_title_from_html(html_text: str) -> str:
    """Fallback title extraction from raw HTML using og:title, <title>, etc."""
    import re
    m = re.search(r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']', html_text, re.I)
    if not m:
        m = re.search(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:title["\']', html_text, re.I)
    if m:
        return html_mod.unescape(m.group(1).strip())
    m = re.search(r'<meta[^>]*name=["\']twitter:title["\'][^>]*content=["\']([^"\']+)["\']', html_text, re.I)
    if m:
        return html_mod.unescape(m.group(1).strip())
    m = re.search(r'<title[^>]*>([^<]+)</title>', html_text, re.I)
    if m:
        return html_mod.unescape(m.group(1).strip())
    return ""


def fetch_article(url: str) -> dict:
    """Download a URL and extract its readable content + metadata."""
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError("Could not download the page. Check the URL.")

    result = trafilatura.bare_extraction(downloaded, include_comments=False,
                                          include_tables=True)
    if not result:
        raise ValueError("Could not extract readable content from this page.")

    if isinstance(result, dict):
        text = result.get("text", "")
        title = result.get("title", "")
        author = result.get("author", "") or ""
    else:
        text = getattr(result, "text", "") or ""
        title = getattr(result, "title", "") or ""
        author = getattr(result, "author", "") or ""

    if not title:
        title = _extract_title_from_html(downloaded)
    if not title:
        title = url

    if not text:
        raise ValueError("Could not extract readable content from this page.")

    return {
        "id": uuid.uuid4().hex[:12],
        "url": url,
        "title": title,
        "author": author,
        "content": text,
    }


# ---------------------------------------------------------------------------
# Helpers — EPUB creation
# ---------------------------------------------------------------------------
EPUB_CSS = """
body   { font-family: Georgia, "Times New Roman", serif; line-height: 1.7;
         margin: 1em; color: #1a1a1a; }
h1     { font-size: 1.35em; margin: 0 0 0.3em; }
.meta  { color: #666; font-size: 0.82em; margin-bottom: 1.8em; }
p      { margin: 0 0 0.75em; text-indent: 0; }
"""


def _text_to_html(text: str) -> str:
    paragraphs = text.split("\n")
    parts = []
    for p in paragraphs:
        p = p.strip()
        if p:
            parts.append(f"<p>{html_mod.escape(p)}</p>")
    return "\n".join(parts)


def create_epub(articles_list: list[dict]) -> str:
    book = epub.EpubBook()

    date_str = datetime.now().strftime("%Y-%m-%d")
    book.set_identifier(uuid.uuid4().hex)
    book.set_title(f"ReadLater - {date_str}")
    book.set_language("en")

    css_item = epub.EpubItem(uid="style", file_name="style/default.css",
                              media_type="text/css",
                              content=EPUB_CSS.encode("utf-8"))
    book.add_item(css_item)

    chapters = []
    for i, article in enumerate(articles_list):
        safe_title = html_mod.escape(article["title"])
        meta_parts = []
        if article.get("author"):
            meta_parts.append(html_mod.escape(article["author"]))
        meta_parts.append(html_mod.escape(article["url"]))
        meta_line = " · ".join(meta_parts)

        body_html = _text_to_html(article["content"])

        ch = epub.EpubHtml(title=article["title"],
                           file_name=f"article_{i}.xhtml", lang="en")
        ch.content = (
            f"<html><head><link rel='stylesheet' href='style/default.css'/>"
            f"</head><body>"
            f"<h1>{safe_title}</h1>"
            f"<p class='meta'>{meta_line}</p>"
            f"{body_html}"
            f"</body></html>"
        )
        ch.add_item(css_item)
        book.add_item(ch)
        chapters.append(ch)

    book.toc = chapters
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav"] + chapters

    epub_path = f"/tmp/kindle_sender_{uuid.uuid4().hex[:8]}.epub"
    epub.write_epub(epub_path, book)
    return epub_path


# ---------------------------------------------------------------------------
# Helpers — email to Kindle
# ---------------------------------------------------------------------------
def send_to_kindle_email(epub_path: str, settings: dict) -> None:
    kindle_email = settings["kindle_email"]
    sender_email = settings["sender_email"]
    sender_password = settings["sender_password"]
    smtp_server = settings.get("smtp_server", "smtp.gmail.com")
    smtp_port = int(settings.get("smtp_port", 587))

    msg = MIMEMultipart()
    msg["From"] = sender_email
    msg["To"] = kindle_email
    msg["Subject"] = "Articles"

    with open(epub_path, "rb") as f:
        part = MIMEBase("application", "epub+zip")
        part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment",
                        filename=os.path.basename(epub_path))
        msg.attach(part)

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)


# ---------------------------------------------------------------------------
# Helpers — send pipeline (shared by manual, auto, and scheduled sends)
# ---------------------------------------------------------------------------
def _do_send() -> tuple[bool, str, int]:
    """Build EPUB, email it, clear queue. Returns (ok, message, count)."""
    if not ARTICLES:
        return False, "No articles to send.", 0

    settings = load_settings()
    required = ("kindle_email", "sender_email", "sender_password")
    if not all(settings.get(k) for k in required):
        return False, "Email settings not configured.", 0

    try:
        epub_path = create_epub(ARTICLES)
    except Exception as exc:
        return False, f"EPUB creation failed: {exc}", 0

    try:
        send_to_kindle_email(epub_path, settings)
    except Exception as exc:
        return False, f"Email sending failed: {exc}", 0
    finally:
        if os.path.exists(epub_path):
            os.remove(epub_path)

    count = len(ARTICLES)
    ARTICLES.clear()
    save_queue()
    return True, "OK", count


# ---------------------------------------------------------------------------
# Scheduler — background thread for weekly sends + missed-send check
# ---------------------------------------------------------------------------
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
             "Saturday", "Sunday"]

_scheduler_running = False


def _check_scheduled_send():
    """Called every 60s. If it's the right day/time and we haven't sent today,
    trigger a send."""
    settings = load_settings()
    if not settings.get("schedule_enabled"):
        return

    try:
        target_day = int(settings.get("schedule_day", 0))  # 0=Mon
        target_time = settings.get("schedule_time", "09:00")
        hour, minute = (int(x) for x in target_time.split(":"))
    except (ValueError, TypeError):
        return

    now = datetime.now()
    if now.weekday() != target_day:
        return
    if now.hour < hour or (now.hour == hour and now.minute < minute):
        return

    # Check if we already sent today
    last_sent_str = settings.get("last_scheduled_send", "")
    if last_sent_str:
        try:
            last_sent = datetime.fromisoformat(last_sent_str)
            if last_sent.date() == now.date():
                return  # already sent today
        except ValueError:
            pass

    if not ARTICLES:
        return

    ok, msg, count = _do_send()
    if ok:
        settings["last_scheduled_send"] = now.isoformat()
        save_settings(settings)
        print(f"  [Scheduler] Sent {count} article(s) to Kindle.")


def _check_missed_send():
    """On app startup, check if a scheduled send was missed and fire it."""
    settings = load_settings()
    if not settings.get("schedule_enabled"):
        return
    if not ARTICLES:
        return

    try:
        target_day = int(settings.get("schedule_day", 0))
        target_time = settings.get("schedule_time", "09:00")
        hour, minute = (int(x) for x in target_time.split(":"))
    except (ValueError, TypeError):
        return

    now = datetime.now()
    last_sent_str = settings.get("last_scheduled_send", "")

    if last_sent_str:
        try:
            last_sent = datetime.fromisoformat(last_sent_str)
        except ValueError:
            last_sent = datetime.min
    else:
        last_sent = datetime.min

    # Walk back up to 7 days to find if we missed a scheduled send
    for days_ago in range(7):
        check_date = now - timedelta(days=days_ago)
        if check_date.weekday() != target_day:
            continue
        scheduled_dt = check_date.replace(hour=hour, minute=minute, second=0,
                                           microsecond=0)
        if scheduled_dt > now:
            continue  # hasn't happened yet today
        if last_sent >= scheduled_dt:
            return  # already sent for this slot

        # Missed send found — fire it now
        ok, msg, count = _do_send()
        if ok:
            settings["last_scheduled_send"] = now.isoformat()
            save_settings(settings)
            print(f"  [Scheduler] Missed send caught up — sent {count} article(s).")
        return


def start_scheduler():
    """Start the background scheduler thread (runs every 60s)."""
    global _scheduler_running
    if _scheduler_running:
        return
    _scheduler_running = True

    def _loop():
        while _scheduler_running:
            try:
                _check_scheduled_send()
            except Exception as exc:
                print(f"  [Scheduler] Error: {exc}")
            threading.Event().wait(60)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/settings/load")
def get_settings():
    return jsonify(load_settings())


@app.route("/queue/load")
def get_queue():
    """Return the persisted queue so the frontend can restore it."""
    return jsonify([{"id": a["id"], "title": a["title"], "author": a.get("author", ""),
                      "url": a["url"]} for a in ARTICLES])


@app.route("/add", methods=["POST"])
def add_article():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided."}), 400
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        article = fetch_article(url)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    ARTICLES.append(article)
    save_queue()

    # --- Threshold auto-send ---
    settings = load_settings()
    auto_sent = False
    auto_count = 0
    if settings.get("threshold_enabled"):
        try:
            threshold = int(settings.get("threshold_count", 0))
        except (ValueError, TypeError):
            threshold = 0
        if threshold > 0 and len(ARTICLES) >= threshold:
            ok, msg, count = _do_send()
            if ok:
                auto_sent = True
                auto_count = count

    return jsonify({
        "id": article["id"],
        "title": article["title"],
        "author": article["author"],
        "url": article["url"],
        "auto_sent": auto_sent,
        "auto_count": auto_count,
    })


@app.route("/remove", methods=["POST"])
def remove_article():
    aid = (request.json or {}).get("id")
    global ARTICLES
    ARTICLES = [a for a in ARTICLES if a["id"] != aid]
    save_queue()
    return jsonify({"success": True})


@app.route("/settings", methods=["POST"])
def update_settings():
    data = request.json or {}
    save_settings(data)
    return jsonify({"success": True})


@app.route("/send", methods=["POST"])
def send():
    ok, msg, count = _do_send()
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"success": True, "count": count})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def _find_free_port() -> int:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _init():
    """Load persisted queue and start scheduler on app boot."""
    global ARTICLES
    ARTICLES = load_queue()
    if ARTICLES:
        print(f"  Restored {len(ARTICLES)} article(s) from queue.")
    _check_missed_send()
    start_scheduler()


def run_desktop():
    import webview

    port = _find_free_port()

    server = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=port, use_reloader=False),
        daemon=True,
    )
    server.start()

    import time
    time.sleep(0.5)

    _init()

    webview.create_window(
        "Kindle Sender",
        f"http://127.0.0.1:{port}",
        width=680,
        height=860,
        min_size=(480, 600),
    )
    webview.start()


def run_browser():
    import webbrowser
    port = _find_free_port()
    _init()
    webbrowser.open(f"http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=True, use_reloader=False)


def _is_bundled_app() -> bool:
    """Detect if we're running inside a py2app .app bundle."""
    import sys
    return getattr(sys, "frozen", False) or ".app/Contents" in sys.executable


if __name__ == "__main__":
    print("\n  Starting Kindle Sender...\n")
    if _is_bundled_app():
        # Bundled .app — always use browser (pywebview Cocoa bridge
        # doesn't work reliably inside py2app bundles)
        run_browser()
    else:
        try:
            import webview  # noqa: F401
            run_desktop()
        except (ImportError, Exception):
            print("  pywebview unavailable — opening in your browser instead.")
            run_browser()
