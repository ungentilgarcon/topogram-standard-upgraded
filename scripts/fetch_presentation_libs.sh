#!/usr/bin/env bash
set -euo pipefail

# Fetch recommended presentation runtime libraries into
# mapappbuilder/presentation-template/lib/

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
TGT_DIR="$ROOT_DIR/mapappbuilder/presentation-template/lib"
mkdir -p "$TGT_DIR"

echo "Fetching presentation libraries into: $TGT_DIR"

# Versions (editable)
LEAFLET_VER="1.9.4"

# URLs
LEAFLET_JS_URL="https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js"
LEAFLET_CSS_URL="https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css"
CYTO_JS_URL="https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js"

download() {
  local url="$1"; local out="$2"
  echo "- Downloading $url -> $out"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$out" "$url"
  else
    echo "Neither curl nor wget available; please download $url manually to $out" >&2
    return 1
  fi
}

set +e
download "$LEAFLET_JS_URL" "$TGT_DIR/leaflet.js" || download "https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.min.js" "$TGT_DIR/leaflet.js"
download "$LEAFLET_CSS_URL" "$TGT_DIR/leaflet.css"
download "$CYTO_JS_URL" "$TGT_DIR/cytoscape.min.js"
ret=$?
set -e

if [ $ret -ne 0 ]; then
  echo "Some downloads failed. You can re-run this script or fetch files manually." >&2
else
  echo "All files downloaded into $TGT_DIR"
fi

echo "Done."
