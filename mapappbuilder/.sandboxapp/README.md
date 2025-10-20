Sandbox app for quick testing
=================================

Purpose
-------
This folder provides a tiny workflow to quickly test the `presentation-template` without re-importing bundles into the main app. It copies the current `presentation-template` into `sandboxapp/presentation` and serves it via a simple static HTTP server.

Usage
-----
1. Sync the template into the sandbox:

```bash
cd mapappbuilder
./sync_sandboxapp.sh
```

2. Start the static server (default port 3024):

```bash
cd mapappbuilder
./sandboxapp/start_server.sh 3024
```

3. Open http://localhost:3024 in your browser and use the developer console for logs.

Notes
-----
- The `sync_sandboxapp.sh` script uses `rsync` to mirror the template. Ensure `rsync` is installed.
- The server script uses Python's `http.server` (python3) or `SimpleHTTPServer` (python2) as fallback.
- Re-run `./sync_sandboxapp.sh` after you edit `presentation-template` to refresh the sandbox.
