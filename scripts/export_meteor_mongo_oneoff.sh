#!/usr/bin/env bash
set -euo pipefail
PORT=3002
OUT=exports/meteor_mongo_export_$(date +%Y%m%d-%H%M%S).tar.gz
mkdir -p exports
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
COLS=$(mongosh --port $PORT --quiet --eval "JSON.stringify(db.getSiblingDB('meteor').getCollectionNames())")
COLS=$(echo "$COLS" | sed -e 's/^\[//' -e 's/\]$//' -e "s/\"//g")
IFS=, read -ra COLARR <<< "$COLS"
for c in "${COLARR[@]}"; do
  ctrim=$(echo "$c" | xargs)
  if [ -z "$ctrim" ]; then continue; fi
  outf="$TMPDIR/${ctrim}.jsonl.gz"
  mongosh --port $PORT --quiet --eval "db.getSiblingDB('meteor').getCollection(\"${ctrim}\").find().forEach(doc => { print(JSON.stringify(doc)) })" | gzip -9 > "$outf"
  echo "wrote $outf"
done
# create tar
pushd "$TMPDIR" >/dev/null
tar -czf "../$OUT" ./*.jsonl.gz
popd >/dev/null
mv "$TMPDIR/../$OUT" ./exports/ || true
if [ -f "./exports/$(basename $OUT)" ]; then
  echo "Export created: ./exports/$(basename $OUT)"
else
  echo "Export file creation failed" >&2
  exit 1
fi
