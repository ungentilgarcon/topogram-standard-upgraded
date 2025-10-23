#!/usr/bin/env bash
set -euo pipefail
# Export all collections from the local Meteor MongoDB into JSONL files and tar.gz them.
# Usage: ./scripts/export_meteor_mongo.sh [--out exports/meteor_mongo_export.tar.gz]

OUTDIR=exports
OUTNAME="meteor_mongo_export_$(date +%Y%m%d-%H%M%S).tar.gz"
ARG1="${1-}"
if [ "$ARG1" = "--out" ]; then
  shift || true
  ARG2="${1-}"
  if [ -n "$ARG2" ]; then
    OUTNAME="$ARG2"
  fi
fi
mkdir -p "$OUTDIR"

# Find mongod listening port by process name; prefer 127.0.0.1.
MONGOD_PORT=""
# parse ss output
while IFS= read -r line; do
  # lines like: LISTEN 0 4096 127.0.0.1:3002 0.0.0.0:* users:("mongod",pid=139833,fd=13)
  if echo "$line" | grep -q "mongod"; then
    # extract addr:port
    addrport=$(echo "$line" | awk '{print $4}')
    port=${addrport##*:}
    if [[ "$addrport" =~ 127\.0\.0\.1: ]]; then
      MONGOD_PORT="$port"
      break
    elif [ -z "$MONGOD_PORT" ]; then
      MONGOD_PORT="$port"
    fi
  fi
done < <(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null || true)

if [ -z "$MONGOD_PORT" ]; then
  echo "Could not find mongod listening port via ss/netstat. Falling back to Meteor port +1 or 3002."
  METEOR_PORT_FILE=.meteor/local/db/METEOR-PORT
  if [ -f "$METEOR_PORT_FILE" ]; then
    METP=$(cat "$METEOR_PORT_FILE" 2>/dev/null || true)
    if [[ "$METP" =~ ^[0-9]+$ ]]; then
      MONGOD_PORT=$((METP+1))
    fi
  fi
  if [ -z "$MONGOD_PORT" ]; then
    MONGOD_PORT=3002
  fi
fi

echo "Using mongod port: $MONGOD_PORT"

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh not found in PATH. Please install mongosh (MongoDB Shell) or run this on the server where mongosh is available. Aborting." >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# get list of collections
# Target the 'meteor' database explicitly (Meteor local DB uses that name)
COLS_JSON=$(mongosh --port "$MONGOD_PORT" --quiet --eval "JSON.stringify(db.getSiblingDB('meteor').getCollectionNames())")
if [ -z "$COLS_JSON" ] || [ "$COLS_JSON" = "null" ]; then
  echo "Failed to fetch collection names from mongod on port $MONGOD_PORT" >&2
  exit 1
fi
# parse JSON array into bash array
# remove leading/trailing [ ] and split on ,
COLS=$(echo "$COLS_JSON" | sed -e 's/^\[//' -e 's/\]$//' -e "s/\"//g")
IFS=, read -ra COL_ARR <<< "$COLS"

echo "Collections to export: ${COL_ARR[*]}"

for coll in "${COL_ARR[@]}"; do
  coll_trim=$(echo "$coll" | xargs)
  if [ -z "$coll_trim" ]; then continue; fi
  outf="$TMPDIR/${coll_trim}.jsonl"
  echo "Exporting collection $coll_trim -> $outf"
  # Print one JSON document per line
  mongosh --port "$MONGOD_PORT" --quiet --eval "db.getSiblingDB('meteor').getCollection(\"${coll_trim}\").find().forEach(doc => { print(JSON.stringify(doc)) })" > "$outf"
  # gzip to save space
  gzip -9 "$outf"
done

# create tar.gz with the gzipped jsonl files (ensure files exist)
pushd "$TMPDIR" >/dev/null
shopt -s nullglob
files=(./*.jsonl.gz)
if [ ${#files[@]} -eq 0 ]; then
  echo "No exported files found; aborting tar creation." >&2
  exit 1
fi
tar -czf "$OUTDIR/$OUTNAME" "${files[@]}"
popd >/dev/null

# Decide final output path
if [[ "$OUTNAME" = /* ]]; then
  FINAL_OUT="$OUTNAME"
else
  FINAL_OUT="$OUTDIR/$OUTNAME"
fi

echo "Creating archive $FINAL_OUT"
mkdir -p "$(dirname "$FINAL_OUT")"
tar -czf "$FINAL_OUT" "${files[@]}"

echo "Export created: $FINAL_OUT"

echo
cat <<'EOF'
Import into a Docker MongoDB container (example):
# Copy archive into host or use a volume. Example runs mongoimport for each collection.
mkdir -p /tmp/meteor_dump && tar -xzf exports/your_archive.tar.gz -C /tmp/meteor_dump
# Then run mongoimport (adjust host/port/db as needed):
# If your Docker MongoDB is listening on host port 27017:
for f in /tmp/meteor_dump/*.jsonl.gz; do
  coll=$(basename "$f" .jsonl.gz)
  gunzip -c "$f" | docker run --rm -i mongo:6.0 mongoimport --host host.docker.internal --port 27017 --db meteor --collection "$coll" --drop --jsonArray=false
done
EOF
