```markdown
Sigma.js + Graphology migration analysis

Goal
- Replace Cytoscape (and react-cytoscapejs) with Sigma.js + Graphology across the app gradually and safely.
- Provide an adapter strategy so existing components keep working during an incremental migration.

Why Sigma.js + Graphology?
- Sigma.js is a performant, React-friendly graph renderer that can use WebGL (via the WebGL renderer) to render large graphs efficiently in the browser.
- Graphology is a well-designed graph data structure library that pairs with Sigma.js; it provides a mutable/immutable graph API and utilities for graph traversal, analysis, and IO.
- Together they cover both the data model (Graphology) and rendering (Sigma), making them a solid alternative to Cytoscape for many interactive graph UIs.

Summary of current Cytoscape usage (brief)
- Heavy use in `imports/ui/pages/TopogramDetail.jsx` for building elements, styles, layout, selection, timeline-driven hide/show via class toggles, fit/zoom, and event wiring.
- Local wrapper `imports/client/ui/components/network/Cytoscape.jsx` and `Network.jsx` are consumers; many other UI components expect a `cy` instance or call `cy.*`.

High-level migration implications
- API mismatch: Cytoscape's imperative `cy` object and stylesheet DSL differ from Sigma/Graphology. Existing code that directly manipulates `cy` needs adaptation.
- Layouts: Cytoscape uses plugins like cola. For Sigma.js, layouts are external (compute positions with webcola, d3-force, or Graphology-layout libs) and then passed to Sigma as fixed positions.
- Plugins/features: Cytoscape-specific plugins (edgehandles, cxtmenu, cola) don't map 1:1. Reimplement features with DOM overlays, Sigma plugins, or custom code.
- Styling: Cytoscape stylesheet must be translated to Sigma node/edge attributes and renderers. Sigma supports custom renderers for nodes and edges (canvas/WebGL) and has style properties for colors/sizes.
- Selection & events: Sigma provides event callbacks; Graphology stores the graph model. Replace `cy.on` usages with Sigma event handlers and Graphology queries.

Files and code areas to update (non-exhaustive)
- `imports/ui/pages/TopogramDetail.jsx` — element building, layout, timeline filtering, cyRef operations, CSV export integration, selection mirroring. Biggest chunk.
- `imports/client/ui/components/network/Cytoscape.jsx` — wrapper to be replaced with `SigmaWrapper` or a pluggable `GraphWrapper` that can mount either implementation.
- `imports/client/ui/components/network/Network.jsx` — consumer using cy for interactive behaviors; adapt to Sigma event callbacks and Graphology APIs.
- Selection-related components and any other code that expect `ui.cy` or call `cy.*`.

Recommended migration strategy (incremental, low-risk)
1) Introduce an adapter layer (SigmaAdapter) that implements a small subset of the `cy` imperative API used by the app.
   - Implement a thin adapter object exposing methods: getInstance(), on(event, selector, handler), off(event, handler), fit(), resize(), zoom(level), center(), nodes(), edges(), add(elements), remove(elements), select(id), unselect(id), elements(), filter(selector).
   - Where a method cannot map cleanly (e.g., complex Cytoscape selectors), implement a best-effort fallback using Graphology queries and log a warning.
2) Create `GraphWrapper.jsx` that can mount Cytoscape or Sigma behind a prop/feature flag.
   - For Sigma path: create a `SigmaWrapper` component that accepts elements, layout, style maps, and a `cyCallback` prop; internally it builds a Graphology graph, computes / applies positions, mounts Sigma, and calls `cyCallback(adapter)` with the SigmaAdapter.
   - Keep the existing `Cytoscape.jsx` implementation available as the fallback; the `GraphWrapper` will choose implementation based on a prop or runtime flag.
3) Implement element translation utilities
   - `cyElementsToGraphology(elements)` — converts Cytoscape element array (data + position) into a Graphology graph and returns node/edge attribute maps.
   - `graphologyToSigma(graph)` — if needed, helpers to produce Sigma-compatible node/edge attribute arrays.
4) Layouts
   - Use webcola or d3-force or Graphology's layout packages to compute positions. For large graphs compute layouts in a Web Worker and then apply positions to the Graphology graph before mounting Sigma.
   - For `preset` layouts (existing positions), pass positions through directly.
5) Timeline and visibility
   - Instead of toggling Cytoscape classes, keep a `visible` attribute on nodes/edges in Graphology and instruct Sigma renderers to skip rendering invisible elements. This minimizes re-renders if the renderer supports efficient visibility toggling.
   - If performance problems appear, implement a CSS layer or a GPU-based visibility mask.
6) Interactions
   - Box selection: Implement an overlay rectangle during pointer drag and perform spatial hit-testing against node bounding boxes (using positions and node radii) to compute selected nodes. Expose the same `select` semantics via the adapter.
   - Dragging nodes: Sigma supports dragging via plugins; incorporate `sigma/plugins/dragNodes` or implement pointer-based drag handlers that update positions in Graphology and call Sigma refresh.
   - Edge handles / drawing edges: Reimplement as an overlay, or defer this feature until after core migration.
7) Global `ui.cy` state
   - Preserve `updateUI('cy', adapter)` behavior by storing the adapter object instead of a raw Cytoscape instance. This keeps other components functioning until they're ported.

Detailed technical mapping
- Elements/data model
  - Cytoscape: elements = [{ data: {...}, position: {x,y} }, ...]
  - Graphology/Sigma: graph.addNode(id, { ...attrs, x, y }) and graph.addEdge(source, target, { ...attrs })
  - Translation function should preserve data fields used by the app (label, weight, color, time-range meta fields).

- Styling and node/edge renderers
  - Translate Cytoscape stylesheet logic into node/edge attributes like size, color, label, opacity.
  - Use Sigma custom node renderers when needed (for complex shapes or multi-line labels). Sigma supports both canvas (fast) and WebGL (via extensions) renderers.

- Layouts and physics
  - Compute physics/layout using: webcola (cola.js), d3-force, or Graphology layout modules (graphology-layout-forceatlas2 for ForceAtlas2), depending on feature parity and performance.
  - If the app relies on cola-specific options, consider using webcola directly to match behavior.

- Event & selection mapping
  - Replace `cy.on('select', ...)` with Sigma event listeners such as `sigma.on('clickNode', handler)` and Graphology updates.
  - For API parity, implement adapter methods that translate selectors and selection queries into Graphology queries (e.g., filter by attribute value).

Performance considerations
- Sigma + WebGL is performant for many thousands of nodes; however the rendering cost depends on custom renderers and per-frame updates.
- Graphology manipulations are fast; compute-heavy tasks (layout) should be offloaded to Web Workers.
- Avoid full graph re-creation on each timeline tick: update only node/edge `visible` attributes and call Sigma refresh.

Testing & verification plan
- Unit tests: element translation, normalizeWeight, selector -> Graphology filters.
- Visual A/B: add a query param or feature flag to toggle `impl=reagraph|sigma|cytoscape` and compare behavior on `TopogramDetail`.
- Performance benchmarks: measure render time and interaction FPS for representative graph sizes.

Rollout plan (incremental):
1. Add `GraphWrapper` and `SigmaAdapter` + element translation utilities; wire feature flag.
2. Test `TopogramDetail` behind flag, validate timeline visibility, selection, fit/zoom, CSV export.
3. Port other `Network` consumers; remove Cytoscape fallback once coverage complete.

Risks and mitigations
- Loss of plugin behaviors: keep Cytoscape fallback and port plugins incrementally.
- Performance regressions for large graphs: offload layout and expensive computations to Web Workers; use Sigma WebGL renderer.
- Styling mismatches: build a small visual regression test suite to catch differences.

Estimated effort
- Adapter & wrapper + translation utilities + demo page: 1-3 developer-days
- Port `TopogramDetail` fully: 3-7 developer-days depending on layout and interactions
- App-wide migration: several developer-weeks

Next steps I can take now
- Implement a minimal `GraphWrapper` and `SigmaAdapter` on the `Reagraph` branch that supports: mount Sigma from Graphology graph, expose a `cy`-like adapter with getInstance/on/off/fit/select/unselect/nodes/edges, and a `cyCallback` prop so existing code can keep receiving an adapter.
- Or implement translation utilities first (`cyElementsToGraphology`) and small unit tests.

Would you like me to implement the minimal `GraphWrapper` + `SigmaAdapter` now on the `Reagraph` branch so we can toggle implementations behind a flag?

``` 
