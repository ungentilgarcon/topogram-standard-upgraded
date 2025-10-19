#!/usr/bin/env sh
# Simple packager for MapApp bundles (skeleton).
# Usage: ./package.sh <bundle-dir> <output-zip>
set -e
BUNDLE_DIR="$1"
OUT_ZIP="$2"
if [ -z "$BUNDLE_DIR" ] || [ -z "$OUT_ZIP" ]; then
  echo "Usage: $0 <bundle-dir> <output-zip>"
  exit 2
fi
cd "$BUNDLE_DIR"
# Ensure config exists
if [ ! -f "config.json" ]; then
  echo "Missing config.json in bundle dir"
  exit 3
fi
zip -r "$OUT_ZIP" .

echo "Packaged $OUT_ZIP"
