#!/usr/bin/env bash
# Integration helper: call the Meteor export method via the existing DDP helper
# and run the verifier on the produced zip. Usage:
#
# ./scripts/integration_export_and_verify.sh <topogramId> [config.json]

set -euo pipefail

ME=$(basename "$0")
TOPODIR=$(pwd)

if [ $# -lt 1 ]; then
  echo "Usage: $ME <topogramId> [config.json]"
  exit 2
fi

TOPOD_ID="$1"
CONFIG_ARG=""
if [ $# -ge 2 ]; then
  CONFIG_ARG="$2"
fi

# Call the node DDP helper which prints the filename of the exported zip
NODE_CMD="node scripts/run_export_ddp.js"
if [ -n "$CONFIG_ARG" ]; then
  NODE_CMD="$NODE_CMD --config $CONFIG_ARG"
fi

echo "Calling exporter for topogram id: $TOPOD_ID"
OUT=$(eval "$NODE_CMD --id $TOPOD_ID" 2>&1)
echo "$OUT"

# The helper prints a JSON or plain line containing filename; try to extract zip path
FNAME=$(echo "$OUT" | tr '\n' ' ' | sed -n 's/.*\("filename"\s*:\s*"\([^"]*\.zip\)"\).*/\2/p')
if [ -z "$FNAME" ]; then
  # fallback: try to read last .zip path
  FNAME=$(echo "$OUT" | sed -n 's/.*\(topogram-[^ ]*\.zip\).*/\1/p' | tail -n1)
fi

if [ -z "$FNAME" ]; then
  echo "Could not determine exported zip filename from exporter output." >&2
  exit 3
fi

ZIPPATH="$TMPDIR/${FNAME}"
# The exporter places zips under OS tmp dir `topogram-exports`; try to find it
if [ -f "$FNAME" ]; then
  ZIPPATH="$FNAME"
else
  # search in /tmp/topogram-exports
  CAND="/tmp/topogram-exports/$FNAME"
  if [ -f "$CAND" ]; then
    ZIPPATH="$CAND"
  else
    # try cwd
    if [ -f "$PWD/$FNAME" ]; then
      ZIPPATH="$PWD/$FNAME"
    else
      echo "Could not locate exported zip ($FNAME) in common locations." >&2
      exit 4
    fi
  fi
fi

echo "Located exported bundle: $ZIPPATH"

echo "Running verifier..."
./scripts/verify_bundle.sh "$ZIPPATH"

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "Integration test: verification succeeded"
else
  echo "Integration test: verification failed (exit=$EXIT_CODE)" >&2
fi

exit $EXIT_CODE
