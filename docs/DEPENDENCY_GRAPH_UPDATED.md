# Dependency graph — updated

This file documents the main internal and external dependencies in the Topogram repository as of the recent documentation sweep (2025-10-25).

The goal is to show which sub-systems depend on which libraries and internal modules, to help maintainers reason about upgrades (Sigma/Graphology, Reagraph, mapappbuilder, etc.).

High-level components

- client/
  - UI entry and React components (GraphWrapper, selection UI, pages)
- imports/client/ui/components/network/
  - Graph adapters:
    - ReagraphAdapter (local SVG shim)
    - SigmaAdapter (Graphology + Sigma.js wrapper)
    - legacy Cytoscape-like adapters (older implementations)
  - Shared utilities: SelectionManager, layout worker runner
- mapappbuilder/
  - Custom map app scaffolding and presentation template
- server/
  - Meteor server-side methods and jobs
- scripts/
  - Build, export and migration helper scripts

Third-party libraries (key runtime packages)

- sigma (Sigma.js v3)
  - Used by `SigmaAdapter` for fast WebGL rendering.
  - Relies on `graphology` for the underlying graph model.
- graphology
  - Graph model used by the Sigma adapter and some utilities.
- @sigma/edge-curve (optional)
  - Optional Sigma program used to render curved/parallel edges and arrowheads.
- reagraph (local shim / optional dependency)
  - Reagraph is provided as a local adapter/shim (`ReagraphAdapter.js`) in this repo to allow SVG rendering and emoji-safe labels.
- meteor / npm deps
  - Meteor runtime for server/client build and packaging.

Key dependency relationships (simple ASCII graph)

client/GraphWrapper
  -> chooses adapter: ReagraphAdapter | SigmaAdapter | legacy

ReagraphAdapter (local SVG)
  -> uses: DOM/SVG, foreignObject for emoji labels
  -> provides: Cytoscape-like API surface (mount, on/off, select/unselect, nodes/edges/elements, layout)

SigmaAdapter
  -> depends on: graphology (graph), sigma (renderer)
  -> optionally uses: @sigma/edge-curve (curves/arrowheads)
  -> provides: same Cytoscape-like API surface as ReagraphAdapter
  -> notes: must set numeric `size` on edges for picking, set `label` and `forceLabel` for labels

SelectionManager
  <- used by adapters to surface selection changes to the rest of the UI (charts, panels, geomap)

Layouts
  -> layout workers are run in a separate worker blob (both Reagraph and Sigma adapters use worker-based force layouts)

Scripts and packaging
  -> `mapappbuilder/package.sh` and build scripts create UMD bundles for embeddable builds.

CSV/sample outputs
  - `samples/dependency_graph_main.csv` and `samples/dependency_graph_mapappbuilder.csv` exist as lightweight adjacency lists for tooling and visualization.

Notes, recommendations and next steps

- Sigma emoji labels: Sigma's default label drawing is canvas-based; emoji glyph fidelity can vary by platform. The Reagraph adapter uses an SVG `foreignObject` fallback to guarantee emoji rendering. When rewriting `SigmaAdapter`, choose one of:
  1) rely on Sigma's canvas labels for text and implement an overlay (HTML layer) only when emoji are present; or
  2) draw emoji via an HTML overlay for all edge labels (safer but more complex to keep positioned during zoom/rotation).

- Keep `SelectionManager` parity when updating adapters. Adapters must emit `select`/`unselect` events with the expected payload shape.

- Consider generating a machine-readable adjacency CSV from the present Markdown file (the repository already contains `samples/dependency_graph_*.csv`) as part of the documentation CI so that tools can render an interactive graph.

File created: `docs/DEPENDENCY_GRAPH_UPDATED.md` — please review and, if desired, we can replace `docs/DEPENDENCY_GRAPH.md` with this content or merge changes into the original file.
