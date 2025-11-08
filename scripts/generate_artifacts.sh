#!/usr/bin/env bash
set -euo pipefail

# scripts/generate_artifacts.sh
# Wrapper to produce repository artifacts for a straightaway launch:
#  - write a full chronological changelog to docs/CHANGELOG_FULL.md
#  - regenerate dependency graphs (JSON + CSV) using existing scripts
#  - optionally build Debian package Topogram CSVs or batch builds
#
# Usage examples:
#  ./scripts/generate_artifacts.sh                    # changelog + graphs
#  ./scripts/generate_artifacts.sh --skip-graphs      # only changelog
#  ./scripts/generate_artifacts.sh --debian bash      # build Debian package graph for 'bash'
#  ./scripts/generate_artifacts.sh --batch --suite trixie --outdir /tmp/topograms

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHLOG=true
GRAPHS=true
DEBIAN_PKG=""
DEBIAN_DEPTH=2
BATCH=false
BATCH_SUITE="stable"
BATCH_COMPONENT="main"
BATCH_OUTDIR="/tmp/topograms"
BATCH_TOP=10

show_help() {
  cat <<'EOF'
Usage: generate_artifacts.sh [options]
Options:
  --skip-changelog         Skip generating docs/CHANGELOG_FULL.md
  --skip-graphs            Skip regenerating dependency graphs
  --debian <PACKAGE>       Build Debian package Topogram CSV for PACKAGE
  --debian-depth <N>       BFS depth for Debian graph (default: 2)
  --batch                  Run batch_build_topograms.py (use --suite and --outdir below)
  --suite <SUITE>          Debian suite for batch builds (default: stable)
  --component <COMP>       Debian component for batch builds (default: main)
  --outdir <PATH>          Output dir for batch builds (default: /tmp/topograms)
  --top <N>                Limit top N packages for batch builder (default: 10)
  -h, --help               Show this help
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-changelog) CHLOG=false; shift ;;
    --skip-graphs) GRAPHS=false; shift ;;
    --debian) DEBIAN_PKG="$2"; shift 2 ;;
    --debian-depth) DEBIAN_DEPTH="$2"; shift 2 ;;
    --batch) BATCH=true; shift ;;
    --suite) BATCH_SUITE="$2"; shift 2 ;;
    --component) BATCH_COMPONENT="$2"; shift 2 ;;
    --outdir) BATCH_OUTDIR="$2"; shift 2 ;;
    --top) BATCH_TOP="$2"; shift 2 ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "Unknown option: $1" >&2; show_help; exit 2 ;;
  esac
done

# Generate full changelog
if [ "$CHLOG" = true ]; then
  echo "Generating full changelog -> $REPO_ROOT/docs/CHANGELOG_FULL.md"
  git -C "$REPO_ROOT" log --pretty=format:'- %h %ad %s' --date=short > "$REPO_ROOT/docs/CHANGELOG_FULL.md"
  echo "Wrote: $REPO_ROOT/docs/CHANGELOG_FULL.md"
fi

# Regenerate dependency graphs (uses existing helper script)
if [ "$GRAPHS" = true ]; then
  if [ -x "$REPO_ROOT/scripts/regenerate_dependency_graph.sh" ]; then
    echo "Running dependency graph regeneration script"
    "$REPO_ROOT/scripts/regenerate_dependency_graph.sh"
  else
    echo "Invoking node build_full_dependency_graph.js directly"
    node "$REPO_ROOT/scripts/build_full_dependency_graph.js" --output-base "dependency_graph_topogram_code_local" --no-transitive
  fi
fi

# Optional Debian package graph for a single package
if [ -n "$DEBIAN_PKG" ]; then
  echo "Building Debian Topogram for package: $DEBIAN_PKG (depth=$DEBIAN_DEPTH)"
  python3 "$REPO_ROOT/scripts/build_debian_topogram.py" "$DEBIAN_PKG" -d "$DEBIAN_DEPTH" -o "$REPO_ROOT/samples/debian_${DEBIAN_PKG}_topogram.csv"
  echo "Debian CSV: $REPO_ROOT/samples/debian_${DEBIAN_PKG}_topogram.csv"
fi

# Optional batch Debian builds
if [ "$BATCH" = true ]; then
  echo "Running batch build of Debian topograms (suite=$BATCH_SUITE component=$BATCH_COMPONENT) -> $BATCH_OUTDIR"
  python3 "$REPO_ROOT/scripts/batch_build_topograms.py" --suite "$BATCH_SUITE" --component "$BATCH_COMPONENT" --outdir "$BATCH_OUTDIR" --top "$BATCH_TOP"
  echo "Batch outputs in: $BATCH_OUTDIR"
fi

echo "Done. Summary:"
if [ "$CHLOG" = true ]; then echo " - CHANGELOG: $REPO_ROOT/docs/CHANGELOG_FULL.md"; fi
if [ "$GRAPHS" = true ]; then echo " - Dependency graphs: samples/dependency_graph_*"; fi
if [ -n "$DEBIAN_PKG" ]; then echo " - Debian CSV: samples/debian_${DEBIAN_PKG}_topogram.csv"; fi
if [ "$BATCH" = true ]; then echo " - Batch output dir: $BATCH_OUTDIR"; fi

exit 0
