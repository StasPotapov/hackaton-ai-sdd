#!/usr/bin/env bash
# Собирает оба PDF в email-package/ одной командой:
#   email-package/GigaSpec-Proposal.pdf   ← PROPOSAL.md
#   email-package/GigaSpec-Pitch-Deck.pdf ← presentation/gigaspec-pitch-deck.html
# Требования: pandoc + Google Chrome (macOS) + node. puppeteer-core ставится сам.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# puppeteer-core в presentation/node_modules — чтобы node нашёл модуль рядом со скриптом
if [ ! -d node_modules/puppeteer-core ]; then
  echo "· ставлю puppeteer-core…"
  npm install --no-audit --no-fund
fi

echo "· proposal…"
./build-proposal-pdf.sh

echo "· дека…"
node build-deck-pdf.js

echo "✓ email-package собран"
