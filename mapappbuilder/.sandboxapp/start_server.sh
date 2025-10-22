#!/usr/bin/env bash
set -euo pipefail
# start a simple static server to serve the sandbox presentation

# Defaults
PORT=3024
NETWORK=""
GEOMAP=""
OPEN_BROWSER=0

usage(){
  cat <<EOF
Usage: $0 [--port PORT|-p PORT] [--network NETWORK] [--geomap GEOMAP] [--open]

Options:
  -p, --port PORT       Port to serve on (default: $PORT)
  --network NETWORK     Optional network renderer to pass as query (sigma|cytoscape|reagraph)
  --geomap GEOMAP       Optional geomap renderer to pass as query (leaflet|cesium|maplibre)
  --open                Open the default browser to the demo URL
  -h, --help            Show this help
EOF
}

# parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)
      PORT="$2"; shift 2;;
    --network)
      NETWORK="$2"; shift 2;;
    --geomap)
      GEOMAP="$2"; shift 2;;
    --open)
      OPEN_BROWSER=1; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown argument: $1"; usage; exit 1;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# support both the hidden .sandboxapp and older sandboxapp layouts
if [ -d "$ROOT_DIR/.sandboxapp/presentation" ]; then
  PRESENTATION_DIR="$ROOT_DIR/.sandboxapp/presentation"
elif [ -d "$ROOT_DIR/sandboxapp/presentation" ]; then
  PRESENTATION_DIR="$ROOT_DIR/sandboxapp/presentation"
else
  PRESENTATION_DIR="$ROOT_DIR/.sandboxapp/presentation"
fi

if [ ! -d "$PRESENTATION_DIR" ]; then
  echo "Presentation directory not found: $PRESENTATION_DIR"
  echo "Run ../sync_sandboxapp.sh first to populate it."
  exit 1
fi

# build URL with optional query params
URL="http://localhost:$PORT/"
QS=""
if [ -n "$NETWORK" ]; then
  QS="network=$(printf '%s' "$NETWORK" | sed 's/ /%20/g')"
fi
if [ -n "$GEOMAP" ]; then
  if [ -n "$QS" ]; then QS="$QS&"; fi
  QS="$QS""geomap=$(printf '%s' "$GEOMAP" | sed 's/ /%20/g')"
fi
if [ -n "$QS" ]; then
  URL="${URL}?${QS}"
fi

echo "Serving $PRESENTATION_DIR on $URL"

# Start the server in background and capture its PID robustly. Use nohup so logs are stable.
# Launch the python static server as a background child of this shell so $! is valid.
pushd "$PRESENTATION_DIR" > /dev/null
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" > /tmp/sandbox_server.log 2>&1 &
else
  python -m SimpleHTTPServer "$PORT" > /tmp/sandbox_server.log 2>&1 &
fi
SERVER_PID=$!
echo "$SERVER_PID" > /tmp/sandbox_server.pid || true
popd > /dev/null

if [ -z "${SERVER_PID:-}" ] || ! printf '%s' "$SERVER_PID" | grep -qE '^[0-9]+$'; then
  echo "Failed to start server (no PID). Check /tmp/sandbox_server.log for details."
  exit 1
fi

trap 'echo "Stopping server..."; kill "${SERVER_PID}" 2>/dev/null || true; wait "${SERVER_PID}" 2>/dev/null || true; exit 0' INT TERM EXIT

sleep 0.25

if [ "$OPEN_BROWSER" -eq 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  else
    echo "No desktop opener found (xdg-open/open). Copy/paste this URL into your browser: $URL"
  fi
fi

echo "Server PID: $SERVER_PID — press Ctrl-C to stop"

# wait for the server process so the script stays in foreground
wait "$SERVER_PID"

