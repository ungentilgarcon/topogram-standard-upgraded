#!/usr/bin/env bash
set -euo pipefail
# Sync presentation-template into sandboxapp/presentation for quick testing
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT_DIR/presentation-template"
DST="$ROOT_DIR/sandboxapp/presentation"

# When syncing, render index.html from index.html.tpl (simple template replacement)
TEMPLATE="$SRC/index.html.tpl"
OUT_INDEX="$DST/index.html"

echo "Syncing presentation template"
mkdir -p "$DST"
rsync -a --delete "$SRC/" "$DST/"
echo "Sync complete: $SRC -> $DST"

echo "You can now run:"
echo "  cd $ROOT_DIR && ./sandboxapp/start_server.sh 3024"

# render index.html from template
if [ -f "$TEMPLATE" ]; then
	echo "Rendering index.html from template"
	mkdir -p "$(dirname "$OUT_INDEX")"
	# naive replacement for {{TITLE}} - use default if not provided
	TITLE="Sandbox Presentation"
	sed "s/{{TITLE}}/${TITLE}/g" "$TEMPLATE" > "$OUT_INDEX"
fi

# Copy sample data and config if not present (so the sandbox can run standalone)
mkdir -p "$ROOT_DIR/sandboxapp/data"
mkdir -p "$DST/data"
if [ ! -f "$DST/data/topogram.json" ]; then
	echo "Copying sample topogram.json into sandbox"
	cat > "$DST/data/topogram.json" <<'JSON'
{
	"nodes": [
		{ "id": "n1", "label": "A", "lat": 37.77, "lon": -122.42, "weight": 3 },
		{ "id": "n2", "label": "B", "lat": 34.05, "lon": -118.24, "weight": 2 },
		{ "id": "n3", "label": "C", "lat": 36.17, "lon": -115.14, "weight": 1 }
	],
	"edges": [
		{ "source": "n1", "target": "n2", "weight": 5, "label": "ab" },
		{ "source": "n2", "target": "n3", "weight": 2, "label": "bc" }
	]
}
JSON
fi

if [ ! -f "$DST/config.json" ]; then
	echo "Copying sample config.json into sandbox"
	cat > "$DST/config.json" <<'JSON'
{
	"mapRenderer": "leaflet",
	"networkRenderer": "cytoscape",
	"networkOptions": {}
}
JSON
fi
