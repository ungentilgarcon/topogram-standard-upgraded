Integration: export + verify helper

This folder includes a small helper script `integration_export_and_verify.sh` that calls the project's DDP export helper (`scripts/run_export_ddp.js`) to trigger the server-side exporter and then runs `scripts/verify_bundle.sh` on the produced zip.

Usage:

```bash
./scripts/integration_export_and_verify.sh <topogramId> [config.json]
```

Notes:
- The script expects the export helper to print the exported filename. It attempts several common locations to locate the produced zip (`/tmp/topogram-exports`, current working dir).
- You can also run the exporter separately and pass the zip path to `scripts/verify_bundle.sh` directly.
