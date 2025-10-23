# Changelog

All notable changes for recent development (last ~3 weeks). This file summarizes commits merged across branches and the migration work for Meteor 3.

## [implementing_debian_graphs] - 2025-10-23

Pagination, Debian import workflow, and folder ergonomics.

### Home pagination and folder behavior
- Added a paginated publication `topograms.paginated` with support for an optional `{ folder }` filter and a `{ noFolder: true }` filter.
- The Home page now shows only non-foldered topograms in the main list and paginates them at 200/page. Folder contents do not inflate the main page count when collapsed.
- Inside each folder, a dedicated section subscribes to the same paginated publication filtered by folder and paginates at 50/page.
- New server methods:
	- `topograms.count({ folder?, noFolder? })` — returns a total matching the filter, implemented with `rawCollection().countDocuments` for Meteor 3 reliability.
	- `topograms.folderCounts()` — returns `{ name, count }[]` via an aggregation pipeline (distinct+count fallback).
- Registered the new methods at server startup so client calls work immediately after a restart.

### Import script rebuild (Debian datasets)
- Rewrote `scripts/import_topograms_folder.py` to support:
	- `--dir` (required): directory containing `.topogram.csv` files to import.
	- `--clean-folder <label>`: deletes all existing Topograms/Nodes/Edges in that folder before import.
	- `--folder <label>`: label assigned to all imports from the directory (defaults to the directory name).
	- `--limit N`: import at most N topograms.
	- `--commit`: perform writes (omit for dry-run).
	- `--mongo-url` or `--port`: explicit Mongo target; defaults to `mongodb://localhost:27017/meteor`.
- Fixed embedded `mongosh` JavaScript templates inside Python f-strings by escaping braces so the script compiles and runs.
- Normalized edge direction fields and ensured `enlightement = 'arrow'` is set when required so arrows render correctly.

### UI polish
- Removed legacy client-only cap of 200 items; all caps are now server-driven.
- Added minimal pagination controls and CSS; folder cards no longer stretch awkwardly.
- Export dialog: added basic defaults and sanitization helper used for bundle ids.

### Notes
- Requires a Meteor server restart to pick up new publications and methods after pulling this branch.
- Home debug panel shows subscription readiness and the number of non-folder items currently in the client cache.


## [Unreleased] - 2025-10-12

### GeoMap / Selection
- GeoMap selection made independent of Cytoscape (`ui.selectedElements`) so map selection works even when `cy` isn't available.
- Added invisible larger hit areas for small node markers to improve clickability.
- Made hit-area markers explicitly interactive (fillOpacity) for reliable Leaflet click events.
- Ensured geo nodes carry the same visualization id (`data.id`) as Cytoscape nodes so selection resolves correctly.
- GeoMap now builds canonical JSON objects for nodes and edges (includes `group` and `data.id`) and strips stray `source`/`target` from node JSON to avoid misclassification.

### Selection panel & CSV export
- Added `SelectionPanel` Export CSV: exports selected nodes and edges using the same 20-field CSV layout as topogram exports; allows a custom title and sanitized filename.
- Persisted selection panel pinned state in `localStorage` and made mounting controlled by the parent to ensure popup close behaviour works correctly.

### Charts & Cytoscape integration
- Charts reflect selection and can drive Cytoscape selection/unselection (edge donut slice highlighting, numeric weight fallback for matching).
- Cytoscape styles updated to emphasize selected nodes and edges.

### Popup and UI
- Numerous fixes to the `Popup` component: popout handling, robust close handlers, light theme support, and stop-drag-on-close behaviour.

### CSV import / server
- Robust CSV import with improved node id mapping, edge label/color persistence, job error logging, and server-side worker registration.

### Timeline & UI wiring
- Timeline improvements: play/pause/next/stop with speed multiplier, slider persistence, value-range filtering, and TimeLine UI integration.

### Migration / Meteor 3 upgrade branches
- `upgrade/m3-port` — scaffolding for Meteor 3, routing (`/t/:id`), and data sanitization (clamp numeric node/edge fields on ingest; migration to sanitize legacy docs).
- `upgrade/m3-prep` — migration plan and developer environment scaffolding; contains upstream historic Topogram commits preserved during prep.
- `topogram-m3-migration` — client-side adjustments for Meteor 3 (Cytoscape presets, color & weight normalization, layout selector, title-size UI), plus timeline and UI wiring for migration.

### Recent (branch: arrowed-links)

- Geo: jitter midpoint labels to reduce overlap; Cytoscape parallel-edge styling and propagate edge fields (186553e)
- Geo: increase midpoint label offsets and jitter to reduce overlap (d2ab429)
- Geo: alternate midpoint label placement above/below edge and reduce distance (efd9298)
- Geo: use map.project/unproject for pixel-space midpoint label placement; pass map ref to GeoEdges (fadde57)
- Geo: pixel-space tangent/normal offsets and longitudinal jitter for midpoint labels (2aebb63)
- Geo: increase pixel-space label separation (larger normal offset, more jitter) (c0e079d)
- Geo: pass ui and map refs to GeoEdges/GeoNodes so UI toggles affect map layers (865cbf3)

### Recent edits (emoji & edge-relationship support) - 2025-10-13

- CSV import: support for emoji fields on nodes and edges. Importer now normalizes emoji input (handles LibreOffice +...- segments), extracts up to 3 grapheme clusters and stores them as UTF-8 strings on documents (`node.data.emoji`, `edge.data.relationshipEmoji`).
- Network: added UI controls to choose node label mode (Name | Emoji | Both) and edge relationship label mode (Text | Emoji | Both). Cytoscape elements include computed display fields (`data._vizLabel` for nodes, `data._relVizLabel` for edges) and a runtime updater updates labels immediately when selectors change.
- GeoMap: midpoint relationship labels and chevrons respect the new edge relationship label mode and will show emoji/text/both according to UI. Per-edge semantic arrowheads (CSV `enlightement` field canonicalized to `arrow`) still apply. Midpoint label placement improvements (pixel-space offsets, jitter, slotting) remain in effect.
- Sample CSV: sample file now includes multi-emoji examples and the download is prefixed with a UTF-8 BOM to improve LibreOffice/Excel detection of UTF-8 so emoji display correctly.
- Branch: these edits were developed on branch `edgerelationshipasemoji` and pushed for review.


## Notes
- If you still encounter nodes being misclassified as edges in selection, capture the node's `data.id`/_id and a screenshot for tracing; the code now passes canonical JSON but legacy data shapes may still cause corner cases.

---

Generated: 2025-10-12
