```markdown
# Topogram (topogram-standard-upgraded)

Topogram turns messy event and relationship data into interactive network+map visualizations for exploration and publishing. We now support multiple network visualization implementations (eg. Cytoscape, Sigma/Reagraph variants) and multiple GeoMap implementations (MapLibre, Leaflet-based layers, and experimental Cesium integrations). Since 2025 we've focused on making ingestion reliable and safe (an easy-to-use Builder UI, strict import quotas, and a waitlist to avoid overload), while finishing the Meteor 3 migration and tightening GeoMap <-> Cytoscape integration so maps and networks behave as a single, consistent exploration surface.

See `RECENT_PROGRESS.md` for a short summary of the latest UI, export, and docs consolidation work (week ending 2025-10-30).

This README summarizes recent development activity (last ~3 weeks) across branches. It focuses on UI selection sync, GeoMap/Cytoscape integration, CSV import/export, charts, timeline improvements, and Meteor 3 migration work.

## Quick switch between network renderers

You can switch the network implementation at runtime:

- URL query: append `?graph=cy`, `?graph=sigma`, or `?graph=reagraph` to the page URL.
- In code: `imports/client/ui/components/network/GraphWrapper.jsx` accepts an `impl` prop (`'cy' | 'sigma' | 'reagraph'`); when omitted it reads `?graph`.

Adapters expose a Cytoscape-like API (select/unselect, nodes/edges/elements, fit/zoom/center/animate, layout events) so SelectionPanel, Charts, and GeoMap stay in sync across implementations.

## MapApp Builder — build portable mini map+network apps

The `mapappbuilder/` workspace contains everything needed to export a single Topogram as
a self-contained static presentation that can be served anywhere (CDN, static host, or
file server). Each exported bundle includes the serialized dataset, a configurable
presentation shell, and the runtime UMD libraries required to render network and map
views offline.

Key files and quick workflow:

- `mapappbuilder/config.schema.json` — JSON Schema for the bundle configuration.
- `mapappbuilder/presentation-template/` — HTML+JS template copied into each export.
- `mapappbuilder/.sandboxapp/` — local test harness mirroring the template for QA.
- `mapappbuilder/package.sh <output.zip>` — packaging helper that injects `config.json`
  and `data/topogram.json`, preserves `lib/` and zips the presentation.

Quick test flow:

```bash
cd mapappbuilder
./sync_sandboxapp.sh            # copy presentation-template → .sandboxapp/presentation
./.sandboxapp/start_server.sh   # serve sandbox on http://localhost:3024 (defaults to Reagraph)
./package.sh ./exported-presentation.zip
```

See `docs/mapappbuilder/README.md` and `docs/mapappbuilder/DEPENDENCY_GRAPH.md` for a full
workflow, renderer notes, and the dependency diagram that explains how templates,
libs, and packaging interact.

## Renderers and adapters

- Cytoscape (legacy, full feature set) — retains plugins like `cytoscape-cola` and the stylesheet DSL.
- Sigma v3 + Graphology (new) — clean adapter rewrite with:
  - Edge labels (text and emoji), label visibility tuned; size/weight mapping.
  - Parallel edges and self-loops rendered as curves when `@sigma/edge-curve` is present; arrowheads when `enlightement = 'arrow'` or `arrow = true`.
  - Selection parity (`on('select'|'unselect')`, `.select(id)`, `.unselect(id)`), timeline-friendly `hidden` attributes and camera helpers.
- Reagraph (React-first) — available in MapApp Builder and optionally in-app behind the same adapter contract.

See also: `docs/ARCHITECTURE.md` and `docs/SELECTIONS.md`.

```markdown
# Topogram (topogram-standard-upgraded)

This README summarizes recent development activity (last ~3 weeks) across branches. It focuses on UI selection sync, GeoMap/Cytoscape integration, CSV import/export, charts, timeline improvements, and Meteor 3 migration work.

## Overview of recent changes (last 3 weeks)

Summary of notable commits (titles and context):

- GeoMap selection and clickability fixes (branch: `selectviageomap` / merged to `main`) — multiple commits:
  - `GeoMap: toggle selection via ui.selectedElements instead of requiring cy` — make map selection work even when `cy` isn't passed.
  - `GeoMap: add invisible hit-area CircleMarker for small nodes` — improve clickability for small markers.
  - `GeoMap: make hit-area markers interactive (fillOpacity) for more reliable clicks` — ensure Leaflet reliably dispatches clicks.
  - `GeoMap: ensure geoNodes carry viz id (data.id) matching Cytoscape` — align map node IDs with Cytoscape ids.
  - `GeoMap: pass canonical node/edge json (group + data.id) to selection handlers` — ensure parent receives canonical JSON.
  - `GeoMap: ensure node json has no source/target fields to avoid misclassification as edges` — remove stray edge-like fields on node JSON.

- Selection panel and export (branch: `exporttopotocsv` / merged to `main`):
  - `SelectionPanel: add Export CSV for selected nodes/edges with customizable title` — export selected elements as CSV matching ImportCsvModal layout.
  - `SelectionPanel: wire show/hide toggle and parent-controlled mounting; persist selectionPanelPinned in localStorage` — settings toggle, persistent pin state, parent-controlled mounting so popup close works.
  - Several `export:` commits improving filename sanitization, CRLF usage, and title sanitization.

- Charts and selection integration (branch: `chartsandselection` / merged):
  - `charts: highlight edge donut slice when selected` and related commits — charts now reflect selection and drive Cytoscape selection/unselection.
  - `cytoscape: add selected styles for nodes and edges` — visual improvements.

- Popup and UI behavior
  - Multiple fixes and improvements to `Popup` to make pop-out, close handling, drag/stop behavior, and light theme consistent.

- CSV import and server
  - `CSV import: robust node id mapping, edge label/color persistence, job error logging; fix async collection calls` and server worker registration.
  - `SelectionPanel: add Export CSV for selected nodes/edges with customizable title` — export selected elements as CSV matching ImportCsvModal layout.

- Timeline and UI wiring
  - Timeline play/pause/step controls, slider persistence, timeline filtering, and timeline UI wiring into TopogramDetail.

## Files and components touched

- `imports/ui/components/geoMap/*` (GeoMap, GeoNodes, GeoEdges) — selection handling, interactive hit areas, JSON canonicalization.
- `imports/ui/components/SelectionPanel/SelectionPanel.jsx` — Export CSV UI; export logic reusing Topogram CSV format.
- `imports/ui/pages/TopogramDetail.jsx` — glue between Cytoscape, GeoMap, SelectionPanel, Charts; ensures `data.id` alignment, selection state, timeline filtering.
- `imports/ui/components/charts/*` — updates to reflect selection and drive cytoscape selection.
- `imports/client/helpers` & server endpoints for CSV import/export.
- `imports/ui/components/common/Popup.jsx` — popout/close improvements.

## Recent edits (2025-10-13)

- Emoji & edge-relationship support:
  - CSV import now accepts an `emoji` (or `em`/`icon`) column for both nodes and edges. The importer normalizes LibreOffice-encoded segments, extracts up to 3 grapheme-cluster emojis, and stores them on documents (`node.data.emoji`, `edge.data.relationshipEmoji`).
  - Network UI: added selectors to choose how node labels and edge relationship labels are displayed (Name | Emoji | Both for nodes; Text | Emoji | Both for edges). Labels update immediately in the network view without remounting Cytoscape.
  - GeoMap: midpoint relationship labels follow the selected edge label mode and can show emoji, text, or both. Chevrons remain a global drawing convention and per-edge arrowheads (CSV `enlightement = 'arrow'`) are respected.
  - Sample CSV: the sample now includes multi-emoji examples and the download is prefixed with a UTF-8 BOM so LibreOffice and Excel detect UTF-8 and show emoji correctly. A short note appears in the import dialog describing this.
  - Branch: changes were developed on branch `edgerelationshipasemoji` and pushed for review.

## Upgrade branches (migration / Meteor 3 prep)

Additional commits on upgrade/migration branches that were part of the Meteor 3 port and preparatory work. The branches include `upgrade/m3-port`, `upgrade/m3-prep`, and `topogram-m3-migration`.

- `upgrade/m3-port` (examples from recent commits)
  - `fix(sanitize): clamp numeric node/edge fields on ingest + add migration to sanitize existing docs` — data sanitization and migration scripts to clean legacy numeric fields when importing under Meteor 3.
  - `feat(router): add /t/:id route, Home list with links, and detail view` — scaffolding for routes, publications and methods (topograms/nodes/edges).
  - `chore: scaffold Meteor 3 app with upgraded stack deps and dev scripts` — initial Meteor 3 scaffolding.

... (truncated for brevity) ...

Generated: 2025-10-12

```

## Recent updates (last week)

Highlights from the last week of work (oct 13–20, 2025):

- feat(import): Added a Builder UI to assemble imports from multiple CSV/JSON sources, preview nodes and edges, map columns (including data.notes and data.extra), choose merge mode (Replace / Add), and produce a server-compatible CSV that enqueues the existing import worker (commit: adf0ed9).
- server(import): Enforced operational import limits and a waitlist to prevent overloads — 1MB upload (non-admin), per-import caps (nodes 100 / edges 200 for non-admins), per-user daily topogram cap (20), global daily topogram cap (200), and a concurrent-import cap (10) with a queued waitlist that auto-promotes when slots free.

... (truncated) ...

Generated: 2025-10-20

```
