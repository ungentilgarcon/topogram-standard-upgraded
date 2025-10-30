````markdown
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

... (truncated) ...

Would you like me to implement the minimal `GraphWrapper` + `SigmaAdapter` now on the `Reagraph` branch so we can toggle implementations behind a flag?

````
