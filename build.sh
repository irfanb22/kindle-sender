#!/bin/bash
# ─────────────────────────────────────────────────────────
# Build Kindle Sender.app
# Run this once: ./build.sh
# The app will be at dist/Kindle Sender.app
# ─────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

echo ""
echo "  Building Kindle Sender.app..."
echo ""

# ── Set up build environment ─────────────────────────────
if [ ! -d ".venv" ]; then
    echo "  Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "  Installing dependencies..."
pip install --upgrade pip -q
pip install -r requirements.txt -q
pip install py2app -q

# ── Clean previous builds ────────────────────────────────
rm -rf build dist

# ── Build the .app ───────────────────────────────────────
echo "  Bundling app (this takes a minute)..."
python setup.py py2app 2>&1 | tail -5

echo ""
echo "  =================================================="
echo "  Build complete!"
echo "  Your app is at: dist/Kindle Sender.app"
echo ""
echo "  To install, drag it to your Applications folder:"
echo "    open dist/"
echo "  =================================================="
echo ""

# Open the dist folder so the user can see the .app
open dist/
