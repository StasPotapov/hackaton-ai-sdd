#!/usr/bin/env bash
# Сборка email-package/GigaSpec-Proposal.pdf из PROPOSAL.md.
# pandoc → standalone HTML с зелёной темой proposal-pdf.css → Chrome --print-to-pdf.
# Требования: pandoc + Google Chrome (macOS). Путь к Chrome — через CHROME_BIN.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -t gigaspec-proposal-XXXXXX).html"
OUT="$ROOT/email-package/GigaSpec-Proposal.pdf"

trap 'rm -f "$TMP"' EXIT

pandoc "$ROOT/PROPOSAL.md" -o "$TMP" -s --embed-resources --css "$HERE/proposal-pdf.css"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$OUT" "file://$TMP" >/dev/null 2>&1

echo "→ $OUT"
