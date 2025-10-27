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

Search results (important matches)
- `TopogramDetail.jsx` — heavy usage
- `imports/client/ui/components/network/Cytoscape.jsx` — wrapper implementation
- `imports/client/ui/components/network/Network.jsx` — higher-level network component
- Several `TopogramViewComponent*` and variants (screenshot helpers) that assume Cytoscape
- `.meteor/local` compiled files contain many references (these are built artifacts, ignore for edits)

Migration strategy — incremental, low-risk approach
1. Introduce an adapter layer (ReagraphAdapter) that implements a small subset of the `cy` imperative API used by the app, mapping calls into Reagraph declarative operations where possible.
   - Provide a thin wrapper object with methods: getInstance(), on(event, selector, handler), off(event, handler), fit(), resize(), zoom(level), center(), nodes(), edges(), add(elements), remove(elements), select(id), unselect(id), elements(), filter(selector) — not all of these will map cleanly to Reagraph; where impossible, implement fallbacks or no-ops with warnings and plan the upstream code replacement.
   - Implement `ReagraphWrapper` React component that accepts the same props as the current `Cytoscape.jsx` wrapper (elements prop, layout, stylesheet, cy callback) and internally mounts Reagraph and calls `cyCallback` with an adapter object implementing the above API.
   - This allows most of the app to continue calling `cy.*` while we slowly shift consumers to Reagraph-native APIs.

2. Replace the local `Cytoscape.jsx` wrapper with `GraphWrapper.jsx` that can mount either Cytoscape (legacy) or Reagraph (new) behind a feature flag or prop. Start with ReagraphAdapter as a best-effort shim. Keep the old Cytoscape wrapper around for a toggle.

3. Migrate critical pages/components incrementally
   - Start with pages that use `CytoscapeComponent` directly like `TopogramDetail.jsx`. Replace the CytoscapeComponent usage with the `GraphWrapper` that mounts Reagraph and provides `cyRef`-like adapter object. This will let the rest of the code continue to work while we test behavior.
   - For features that require plugins (cola layout), consider: (a) implement layout in JS (compute positions beforehand with a library like webcola or cola.js and pass positions to Reagraph), or (b) keep Cytoscape for layouts initially and only replace rendering with Reagraph after positions are computed.

4. Remove `cy`-dependent code progressively
   - As a component is ported to Reagraph, replace direct cy calls with Reagraph-friendly patterns: update `selectedElements` via event callbacks, use Reagraph props for element visibility instead of toggling classes, pass style functions to Reagraph nodes/edges.

5. Final cleanup
   - Remove Cytoscape dependencies and polyfills/plugins once all consumers migrated.
   - Re-run performance tests and adjust.

Detailed technical considerations and mapping
- Elements model
  - Cytoscape uses element objects: { data: { id, ... }, position: { x, y } }
  - Reagraph expects arrays of nodes/edges like { id, label, size, x, y } and custom renderers for node/edge visuals.
  - Build a translation function: cyElementsToReagraph({ elements }) that splits nodes/edges, flattens data fields, and maps styles to node/edge properties.

- Layouts
  - Current layouts: 'preset' (position present) and 'cola' (via cytoscape-cola plugin). Options included nodeSpacing, avoidOverlap, randomize, maxSimulationTime.
  - Options:
    - Use the cola algorithm library (webcola) directly in the browser or in a Web Worker to compute node positions. After positions are ready, pass them as fixed x/y props to Reagraph.
    - Or use other layout libraries (d3-force) to compute positions. Both webcola and d3-force are viable.
    - For initial migration, you can compute a layout once and pass `positions` to Reagraph; subsequent interactive layouts (dragging) will need event wiring.

- Interactions (selection, box-select, drag)
  - Cytoscape provides box selection and additive selection modes, drag behaviors (`grab`, `free`, `drag` events). Reagraph can support pointer interactions via event handlers; if missing, implement box selection layer using an overlay that captures drag area and computes hit testing against nodes (using bounds and node positions).
  - Edge handles (interactive edge drawing) requires additional work; consider deferring or reimplementing with a small overlay and pointer events.

- Styling
  - Translate Cytoscape style rules into React renderers. For nodes: background-color, label text, size mapping from weight -> mapData(weight, minW, maxW, 12, 60). Implement size mapping in node props.
  - Edge styles: width, color, arrowheads (Reagraph supports SVG/CSS arrowheads if using SVG renderer), label on edges requires custom edge renderers.

- Timeline visibility & performance
  - Currently timeline toggles classes (`hidden`) on nodes/edges to hide them without remounting. Reagraph rendering model may re-render nodes when props change — ensure to avoid full remounts by keeping keys stable and only toggling `visible` flags.
  - If Reagraph re-renders are expensive for large graphs, implement per-element CSS opacity toggles via classes on a wrapping SVG/Canvas layer or use virtualization.

- Global state `ui.cy`
  - Several places in the app store the `cy` object in UI state. With the adapter, we can mimic `ui.cy` by storing the adapter handle. During migration, ensure `updateUI('cy', adapter)` remains available.

Testing and verification plan
- Unit tests: For pure helpers (element translation, weight normalization), create unit tests to confirm behavior.
- Visual smoke tests: Navigate to TopogramDetail page and compare rendering with Cytoscape vs Reagraph wrapper (use feature toggle). Confirm interactions: fit, zoom, pan, selection, timeline hide/show, export CSV, charts reflect selection.
- Performance tests: load a large graph (> 1k nodes) and measure frame rate and memory usage for interactions.

Rollout plan
1. Implement adapter and `GraphWrapper` allowing runtime selection of `impl: 'cytoscape' | 'reagraph'` via a top-level feature flag or URL query param.
2. Enable `reagraph` for a single page (`TopogramDetail`) behind the flag and run QA.
3. Migrate additional components and remove Cytoscape once full coverage is achieved.

Risks and mitigations
- Large effort: Reimplementing layouts/interactions can be non-trivial. Mitigation: keep Cytoscape available as fallback and migrate incrementally.
- Performance regressions: Mitigation: benchmark and consider web workers for layout + virtualization for rendering.
- Plugin parity: Some Cytoscape plugins may not have equivalents. Mitigation: either reimplement features or keep Cytoscape for specific functionality until replacements exist.

Estimated effort
- Adapter + wrapper + element translation + small demo page: 1-3 developer-days
- Full migration of `TopogramDetail` (incl. timeline, selection, charts integration): 3-7 developer-days depending on layout/interaction complexity
- Full migration across app: several weeks depending on feature parity and testing

Next steps I can take
- Create a `GraphWrapper` component that can mount Cytoscape or Reagraph and provide an adapter instance. I can implement a minimal adapter mapping used-by-app methods (fit, zoom, on, off, select/unselect, nodes/edges/list) so we can toggle implementations quickly.
- Or implement element translation utilities (`cyElementsToReagraph`) and a Reagraph renderer example for `TopogramDetail`.

Would you like me to implement a minimal `GraphWrapper` adapter now on the `Reagraph` branch so we can test switching implementations behind a flag?