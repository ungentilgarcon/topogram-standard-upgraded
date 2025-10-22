## Topogram architecture

This document explains the major subsystems and how they interact.

Overview:

- Platform: Meteor (server + client bundle) with React UI components.
- Data storage: MongoDB collections (`Topograms`, `Nodes`, `Edges`, `Comments`, `Meteor.users`).
- Visualization: Cytoscape (network view) + Leaflet/react-leaflet (geographic view) inside the main Meteor client. Charts are rendered with Recharts. The export workflow (`mapappbuilder/`) can additionally render the same data via Reagraph/Sigma when running as a static bundle.
- State: Lightweight Redux store for UI; `cy` (Cytoscape instance) is used as the canonical network model for in-memory graph operations.

Major components:

- imports/api/*
  - Collections, schema validation (SimpleSchema / simpl-schema shim), publications and methods.

- imports/ui/pages/TopogramDetail.jsx
  - The main integration point: mounts Cytoscape network, GeoMap (Leaflet), Charts and Side panels (SelectionPanel, Timeline). Keeps UI state in sync and wires selection events between map, charts and network.

- imports/ui/components/
  - geoMap/* — `GeoMap.jsx`, `GeoNodes.jsx`, `GeoEdges.jsx` — map drawing, hit-area handling and map->ui selection canonicalization.
  - SelectionPanel/* — shows selected nodes/edges and includes export functionality.
  - charts/* — charts that reflect selection and can dispatch selection actions.
  - common/Popup.jsx — popup/pop-out panel helper (used by Charts and SelectionPanel for floating windows).

- imports/startup/server/*
  - Server startup logic, DB indexes and seed scripts.

Design notes and decisions:

- Canonical selection model: Cytoscape is treated as authoritative for network state. Map and charts dispatch canonical JSON objects ({ group: 'nodes'|'edges', data: { id } }) to selection handlers so the parent can reconcile with `cy` and DB objects.
- Persisted UI flags: small flags (panel pins etc.) are stored in `localStorage` under keys like `topo.selectionPanelPinned`.
- CSV import/export: the project standardises on a 20-field CSV layout (see `DATASET.md`) with strict filename/title sanitization.

Where to start reading the code

1. `imports/pages/TopogramDetail.jsx` — main wiring and updateUI handler patterns.
2. `imports/components/geoMap/*` — how the map translates clicks into canonical selection events.
3. `imports/components/SelectionPanel/*` — export CSV and selection UI.
4. `imports/api/*` — collections and schema files for the dataset structure.

## MapApp Builder (exported bundles)

The `mapappbuilder/` directory hosts the tooling that turns a single Topogram into a static
presentation bundle. Key characteristics:

- Uses the same JSON dataset produced by the Meteor app (`nodes`, `edges`, metadata).
- Provides loader adapters for Cytoscape, Sigma and Reagraph (network) plus Leaflet,
  MapLibre and Cesium (geomap). The adapters normalise node/edge data so renderers behave
  consistently with the in-app experience.
- Ships React 19, Reagraph and Graphology as local UMD builds so exported bundles can run
  offline. The loader falls back to CDN copies only when a local file is absent.
- Exposes documentation and scripts next to the builder:
  - `mapappbuilder/README.md` — workflow, dependency graph and packaging guidance.
  - `mapappbuilder/MAP_RENDERERS.md` / `NETWORK_RENDERERS.md` — renderer-specific notes.
  - `.sandboxapp/` — runnable sandbox used to validate bundles via a static HTTP server.
- Configuration is validated against `mapappbuilder/config.schema.json`; `sample.config.json`
  documents the expected shape.

The Meteor app remains the place where datasets are created, curated and exported. The builder
is intentionally decoupled so we can iterate on presentation features without touching the
core client/server stack.
