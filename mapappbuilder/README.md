# MapApp Builder — skeleton

Purpose

This folder contains a minimal skeleton for the `mapappbuilder` feature: a way for an admin to export a single Topogram into a self-contained, deployable single-app bundle. The bundle is configured by a JSON file and contains:

- exported Topogram data (nodes, edges, metadata)
- a small presentation page (static HTML/CSS/JS or a tiny React shell)
- a renderer choice (network renderer and geomap renderer)
- optional extra assets (images, styles)

This skeleton provides:

- a JSON Schema for the bundle configuration (`config.schema.json`)
- a sample configuration (`sample.config.json`)
- a simple `package.sh` script that assembles a zip with placeholders
- a tiny presentation template in `presentation-template/`

Next steps

- Wire a server-side method `topogram.exportBundle(topogramId, config)` that exports DB documents and writes them into the bundle directory before packaging.
- Add a small UI on the main page that lets the admin pick a Topogram and download the packaged app (or push it to a build server).
- Replace the presentation template with your preferred React/Static app scaffold.

Notes

This skeleton deliberately avoids any DB/server logic. It focuses on the file structure and configuration so we can iterate on the UX and packaging workflow safely.
