#!/usr/bin/env bash
set -euo pipefail
# Sync presentation-template into sandboxapp/presentation for quick testing
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT_DIR/presentation-template"
DST="$ROOT_DIR/sandboxapp/presentation"

echo "Syncing presentation template"
mkdir -p "$DST"
rsync -a --delete "$SRC/" "$DST/"
echo "Sync complete: $SRC -> $DST"

echo "You can now run:"
echo "  cd $ROOT_DIR && ./sandboxapp/start_server.sh 3024"
