```markdown
Reagraph migration analysis

Status (2025-10-25)

- Adapters: `GraphWrapper.jsx` now mounts a lazy reagraph adapter facade (`graphAdapters/reagraphAdapter.js`) delegating to `reagraph/ReagraphAdapter.js`, a lightweight shim exposing a Cytoscape-like surface (`on/off`, `select/unselect`, `nodes/edges/elements`, `layout`, camera helpers).
- Parity: Selection and timeline visibility parity validated against the in-app flow (SelectionPanel, Charts, GeoMap). The shim uses SVG for edges/nodes and HTML foreignObject labels for emoji fidelity.
- MapApp Builder: Reagraph remains the primary network renderer for exported bundles with local UMD libs; loader favors local `presentation/lib/reagraph.*.js` before CDNs.

Goal
- Replace Cytoscape (and react-cytoscapejs) with Reagraph across the app gradually and safely.
- Provide an adapter strategy so existing components keep working during an incremental migration.

Summary of current Cytoscape usage
- Files referencing Cytoscape (directly or via wrapper):
  - imports/ui/pages/TopogramDetail.jsx — heavy use: builds elements, stylesheet, layouts, mounts CytoscapeComponent, manipulates cyRef for selection, events, fit/resize, animations, and timeline-driven hide/show via class toggles.
  - imports/client/ui/components/network/Cytoscape.jsx — a local wrapper component (older project) used by other Network components.
  - imports/client/ui/components/network/Network.jsx — React class that uses the local wrapper and relies on cy API for event wiring, selection, layout and style manipulations.
  - other pages/components under imports/client/ui/components/** and imports/client/ui/pages/** — several components assume a `cy` instance in UI state or call into `cy.*` directly (e.g., legend, selection, charts, TopogramViewComponent variants). Grep results show many references in the codebase (see below for exact list).
  - Third-party Cytoscape plugins used: cytoscape-cola (layout), several local plugins under vendor (edgehandles, cxtmenu, etc.) referenced in project or packaged in vendor libs.

What Reagraph is (short)
- Reagraph is a React-first graph visualization library that renders with DOM or Canvas and has a different API from Cytoscape. It focuses on React patterns and is not a drop-in replacement for Cytoscape's imperative instance-based API (cy.*).
- Reagraph often expects declarative `nodes` and `edges` props and exposes callback props for selection, layout, and zoom events rather than a central imperative `cy` with methods like `.fit()`, `.layout()`, `.nodes()`, `.edges()`, `.on()`.

High-level migration implications
- API mismatch: Cytoscape provides a mutable graph model and a rich imperative API for selecting, querying, styling and modifying graph elements. Reagraph is more declarative and React-driven. Code that manipulates `cy` directly must be adapted to use Reagraph's props and callbacks.
- Plugin loss: cytoscape-cola or other plugins (edge-handles, cxtmenu) won't work with Reagraph. Need to find Reagraph equivalents or re-implement behaviors (layout, context menus, edge handles) differently.
- Styles: Cytoscape stylesheet DSL is different; Reagraph uses React components/styles for nodes and edges. The existing stylesheet code must be translated into style maps/components.
- Performance: Cytoscape is optimized for large graphs via WebGL / Canvas rendering (via extensions). Reagraph's performance characteristics differ; for large graphs, Reagraph may require virtualization or Web Worker computations. Need performance testing with representative datasets.
- Events & selection: Current code relies on cy events (select/unselect, box selection). Reagraph uses callbacks; selection mirror logic needs rework.

Files and code areas to update (non-exhaustive)
- `imports/ui/pages/TopogramDetail.jsx` — mount points and all cyRef operations, safeFit/doFit/doZoom/doReset/doFixView, timeline filtering (use of cy.nodes()/cy.edges()), selection mirroring, debug diagnostics that call cy methods, and the `elements/layout/stylesheet` memo that constructs Cytoscape-specific `elements` and styles. This is the largest chunk of work.
- `imports/client/ui/components/network/Cytoscape.jsx` — wrapper will need to be replaced with a `Reagraph` wrapper or made to expose the same minimal API surface for the rest of the app.
- `imports/client/ui/components/network/Network.jsx` — uses wrapper as a child and uses cy instance for interactive behaviors (click/drag/selection events). Rework to use Reagraph callbacks and props.
- Selection-related components: `SelectionPanel`, `Charts`, `Legend` and other components that access `ui.cy` directly or assume cytoscape selection methods.
- Utility code and reducers that stored `cy` or expected `cy` in UI state: search for `updateUI('cy', ...)`, `ui.cy` reads, `cy.` calls — will need updates/replacements.

... (truncated for brevity) ...

Would you like me to implement a minimal `GraphWrapper` component that can mount either Cytoscape or Reagraph and provide a small adapter instance for the rest of the code to keep working while migration proceeds?
```
