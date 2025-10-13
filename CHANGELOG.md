# Changelog

All notable changes for recent development (last ~3 weeks). This file summarizes commits merged across branches and the migration work for Meteor 3.

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
