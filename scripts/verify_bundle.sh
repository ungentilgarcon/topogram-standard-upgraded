#!/usr/bin/env bash
set -euo pipefail
ZIPPATH=${1:-}
if [ -z "$ZIPPATH" ]; then
  echo "Usage: $0 /path/to/bundle.zip" >&2
  exit 2
fi
if [ ! -f "$ZIPPATH" ]; then
  echo "Bundle not found: $ZIPPATH" >&2
  exit 3
fi
TMPDIR=$(mktemp -d)
echo "Unpacking to $TMPDIR"
unzip -q "$ZIPPATH" -d "$TMPDIR"
echo "Contents:"
unzip -l "$ZIPPATH" | sed -n '1,200p'

# locate node and npm (use absolute paths to avoid non-interactive PATH issues)
NODE_CMD=$(command -v node || true)
NPM_CMD=$(command -v npm || true)
if [ -z "$NODE_CMD" ]; then
  # common nvm location
  if [ -d "$HOME/.nvm/versions/node" ]; then
    NODE_CMD=$(ls -d "$HOME/.nvm/versions/node"/*/bin/node 2>/dev/null | sed -n '1p' || true)
  fi
fi
if [ -z "$NPM_CMD" ]; then
  if [ -d "$HOME/.nvm/versions/node" ]; then
    NPM_CMD=$(ls -d "$HOME/.nvm/versions/node"/*/bin/npm 2>/dev/null | sed -n '1p' || true)
  fi
fi
echo "Using node: ${NODE_CMD:-(not found)} npm: ${NPM_CMD:-(not found)}"

# Find directory that contains server.js
BASEDIR=""
if [ -f "$TMPDIR/server.js" ]; then
  BASEDIR="$TMPDIR"
else
  # search for server.js in first-level subdirs
  for d in "$TMPDIR"/*/ ; do
    if [ -f "${d}server.js" ]; then
      BASEDIR="$d"
      break
    fi
  done
fi

if [ -z "$BASEDIR" ]; then
  echo "No server.js in bundle; cannot run verification server." >&2
  rm -rf "$TMPDIR"
  exit 5
fi

echo "Using bundle dir: $BASEDIR"
pushd "$BASEDIR" >/dev/null

echo "Starting server..."
if [ -f package.json ]; then
  echo "Installing production dependencies"
  if [ -n "$NPM_CMD" ]; then
    # Prefer npm ci for reproducible installs, fallback to npm install
    if "$NPM_CMD" ci --production > npm_install.log 2>&1; then
      echo "npm ci succeeded"
    else
      echo "npm ci failed; attempting fallback install of express only"
      if "$NPM_CMD" install --no-audit --no-fund --no-save --omit=dev express@^4.18.2 > npm_install.log 2>&1; then
        echo "fallback npm install succeeded"
      else
        echo "npm install fallback failed; showing npm_install.log" >&2
        tail -n 200 npm_install.log || true
      fi
    fi
  else
    echo "npm not found; skipping dependency install" >&2
  fi
fi

if [ -n "$NODE_CMD" ]; then
  "$NODE_CMD" server.js > server.log 2>&1 &
  PID=$!
else
  echo "node not found; cannot start server" >&2
  rm -rf "$TMPDIR"
  exit 6
fi
sleep 2

echo "--- server.log (head) ---"
head -n 40 server.log || true

# Try to fetch /data/topogram.json
OK=0
for i in 1 2 3 4 5; do
  if curl -sS -f "http://localhost:3000/data/topogram.json" -o /tmp/verify_topogram.json; then
    OK=1
    break
  fi
  sleep 1
done

if [ "$OK" -ne 1 ]; then
  echo "Failed to fetch /data/topogram.json" >&2
  tail -n 200 server.log || true
  kill $PID || true
  popd >/dev/null
  rm -rf "$TMPDIR"
  exit 4
fi

echo "/data/topogram.json fetched. Preview:"
head -c 400 /tmp/verify_topogram.json || true

echo "Killing server PID $PID"
kill $PID || true
popd >/dev/null
rm -rf "$TMPDIR"
echo "Verification complete: OK"
exit 0
