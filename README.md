# Topogram

Topogram turns raw event, dependency, and relationship spreadsheets into interactive network + map explorations you can browse, administer, and export. The project now runs on Meteor 3 with a React front-end, exposes multiple interchangeable renderers (Cytoscape, Sigma, Reagraph), and lets you deliver finished stories through the MapApp Builder static exporter.

## Highlights (November 2025)
- **About this map everywhere** – Topogram documents now persist `graph_desc` from imports. Cards on the Home page and the Topogram detail side panel expose an _About_ dialog that renders the Markdown safely so analysts can surface context without leaving the app.
- **Home page folder administration** – Admin users can create folders, move maps between folders, and delete folders with a two-step confirmation (either drop metadata or cascade-delete maps). Folder headers display compact counts, an inline green folder icon, and tidy action buttons.
- **Denormalised statistics** – `nodeCount` and `edgeCount` are stored with each Topogram. Import jobs write the counts, node/edge create & delete methods keep them up to date, and a server backfill script populates legacy documents at startup so the UI never has to count elements on the fly.
- **Card readability overhaul** – Home cards and folder cards use the new “elevated + clean” style (soft border, gentle hover lift, left accent). Typography, spacing, and pagination controls were tightened to show 33% more information per view without losing legibility.
- **Builder & import ergonomics** – CSV/XLSX/ODS ingestion, emoji and relationship-label handling, and waitlisted import controls remain available. Exports reuse the same schema and can now be packaged into static bundles through MapApp Builder.
- **Renderer parity** – Selection stays synchronised across Cytoscape, Sigma, Reagraph, MapLibre, Leaflet, and Cesium adapters. Timeline controls, legends, charts, and selection exports all speak a shared adapter contract.

## Feature tour

### Multi-surface visualisation
- Switch network renderers on the fly (`?graph=cy|sigma|reagraph`) or through the in-app selector. Each adapter exposes a Cytoscape-like API (select / unselect / fit / animate) so charts, selection panel, and timelines behave consistently.
- Geo visualisations use Leaflet by default, but MapLibre and Cesium adapters are available for dense or 3D storytelling. Relationship labels, emojis, arrowheads, and selection state mirror the network view.
- The Side Panel centralises layer toggles, renderer selectors, export actions, and the new About dialog.

### Imports, data and governance
- Builder UI maps columns to Topogram fields, enqueues server-side jobs, and enforces quotas. CSV, XLSX, and ODS are supported, including multi-sheet (“Nodes” + “Edges”) workbooks.
- Node and edge emojis (up to three grapheme clusters) and relationship emojis are normalised during import and respected by every renderer.
- Folders organise large installations. Admin-only methods (`topograms.createFolder`, `topogram.moveToFolder`, `topograms.deleteFolderMeta`, `topogram.deleteFolder`) power the Home page tools and audit logging.

### Exporting and sharing
- **CSV exports** mirror the import schema for full datasets or current selections.
- **MapApp Builder** (the `mapappbuilder/` workspace) packages a single Topogram into a static bundle with configurable presentation chrome, renderer presets, and bundled assets (Sigma/Reagraph, MapLibre, Cesium). See [`mapappbuilder/README.md`](mapappbuilder/README.md) for the workflow.
- **PNG/SVG** exports capture the current network state, preserving emojis, labels, and arrowheads. Reagraph falls back to a deterministic 2D render for consistent imagery.

## Getting started
1. Follow [`docs/QUICKSTART.md`](docs/QUICKSTART.md) to install Meteor, dependencies, and start the dev server.
2. Import a sample from [`samples/`](samples/) using the Builder UI.
3. Open the generated Topogram, explore the network/map views, try the About dialog, move the map into a folder, and verify node / edge counts on the Home page.

## Documentation map
| Topic | Where to read |
| --- | --- |
| Architecture, adapters, data flow | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Collections & field reference | [`docs/DATASET.md`](docs/DATASET.md) |
| API (publications, methods, adapter APIs) | [`docs/API.md`](docs/API.md) |
| Selection contract & renderer notes | [`docs/SELECTIONS.md`](docs/SELECTIONS.md) |
| Dependency graphs & code maps | [`docs/DEPENDENCY_GRAPH.md`](docs/DEPENDENCY_GRAPH.md), [`docs/DEPENDENCY_GRAPH_BUILDER.md`](docs/DEPENDENCY_GRAPH_BUILDER.md) |
| Weekly progress snapshots | [`docs/RECENT_PROGRESS.md`](docs/RECENT_PROGRESS.md) |
| Contribution workflow | [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| Builder & export templates | [`mapappbuilder/README.md`](mapappbuilder/README.md), [`docs/mapappbuilder/README.md`](docs/mapappbuilder/README.md) |

## Changelog and history
- `CHANGELOG.md` now summarises recent releases and feature themes.
- `docs/CHANGELOG_FULL.md` lists every commit (including merged branches) since the project’s inception, generated directly from `git log --reverse`.

## Contributing & support
- Read [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for branch strategy, linting, and the pre-push hook.
- File issues or ideas in the repository tracker. If you add a renderer or importer, document the contract in `docs/ARCHITECTURE.md` and reference it from the README table above.

Happy graphing!
