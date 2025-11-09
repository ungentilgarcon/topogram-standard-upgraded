#!/usr/bin/env bash
set -euo pipefail

# Regenerate dependency graph artifacts (JSON + CSV) and mapping CSVs
# Adjust options as needed. This script expects Node and Python3 to be available.

OUT_BASE=dependency_graph_topogram_code_local

echo "Generating main graph (no transitive for speed, using placeholders for orphan edges by default)..."
node scripts/build_full_dependency_graph.js --output-base "$OUT_BASE" --no-transitive --handle-orphans=placeholder

JSON=samples/${OUT_BASE}.json
if [ -f "$JSON" ]; then
  echo "Generating mapping CSVs for $JSON"
  # Mapping tool will also report any remaining orphan edges and create placeholders in CSVs
  python3 scripts/generate_node_edge_mappings.py "$JSON" --handle-orphans=placeholder
fi

echo "Done. Generated files are in samples/. Note: these files are not tracked by git by default."
echo "(Use --handle-orphans=placeholder to retain orphan edges with synthetic nodes, or --handle-orphans=keep to leave them unchanged.)"
