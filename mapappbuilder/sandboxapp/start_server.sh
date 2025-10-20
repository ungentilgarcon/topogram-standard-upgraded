#!/usr/bin/env bash
set -euo pipefail
# start a simple static server to serve the sandbox presentation
PORT=${1:-3024}
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PRESENTATION_DIR="$ROOT_DIR/sandboxapp/presentation"

if [ ! -d "$PRESENTATION_DIR" ]; then
  echo "Presentation directory not found: $PRESENTATION_DIR"
  echo "Run ../sync_sandboxapp.sh first to populate it."
  exit 1
fi

echo "Serving $PRESENTATION_DIR on http://localhost:$PORT"
# prefer python3 -m http.server when available
if command -v python3 >/dev/null 2>&1; then
  (cd "$PRESENTATION_DIR" && python3 -m http.server "$PORT")
else
  (cd "$PRESENTATION_DIR" && python -m SimpleHTTPServer "$PORT")
fi
