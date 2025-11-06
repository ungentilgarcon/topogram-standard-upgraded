# Better Layout Plan (renderer-specific)

This document outlines how to add more graph layouts per renderer without implementing them yet. The MapAppBuilder folder is intentionally excluded; this plan applies only to the core Topogram UI (imports/**, client/**).

## Goals
- Offer a clear set of additional layouts per renderer (Cytoscape, Sigma/graphology, Reagraph).
- Surface only layouts supported by the currently selected renderer in the side panel.
- Unify the way a layout is requested and finished so Selection/Details continue working.
- Do not change selection, chips, or detail card behaviors.

## High-level contract
- Input: { name: string, options?: object } where name is renderer-specific layout id.
- Output: Renderer runs layout and emits a layoutstop-style event when done; view is re-centered/fit as appropriate.
- Error modes: Unknown layout name → noop with a console.warn; missing deps → noop; long-running layouts should be cancelable when a new layout is requested.
- Success criteria: Nodes receive stable positions, selection intact, no crashes on empty/large graphs.

## Side panel integration
- The layout dropdown reads current renderer (cy | sigma | reagraph) from GraphWrapper props/state.
- It uses a registry per renderer to populate available choices.
- When a layout is chosen, GraphWrapper calls `adapter.layout({ name, ...options }).run()` if available.
- Disable/gray out the dropdown if adapter lacks a `layout()` API.

## Cytoscape renderer
- Built-ins: grid, circle, concentric, breadthfirst, cose, cola (plugin), fcose (plugin).
- Plan:
  - Support built-ins by passing a spec directly to cy.layout(spec)
  - For extensions (cola/fcose), detect plugin availability once at mount and cache flags.
  - Normalize names in UI registry:
    - "grid", "circle", "concentric", "breadthfirst", "cose"
    - Optional: "fcose" (if plugin present), "cola" (if plugin present)
  - Options passthrough: iterations, nodeSpacing, animate=false by default for large graphs.
  - Completion: `layout.run(); layout.on('layoutstop', ...)` then `fit()`.

Edge cases:
- Empty graph: skip and console.debug.
- Extremely large graphs: force animate=false; provide max iterations; guard against browser jank.
- Nodes with preset positions: respect `preset` layout.

## Sigma/graphology renderer
- Layout sources: graphology-layout (random, circular), graphology-layout-forceatlas2, graphology-layout-noverlap.
- Plan:
  - Registry names: "random", "circular", "forceatlas2", "noverlap".
  - Implementation strategy: run computation in a Web Worker (already used pattern), update node data.x/y, then trigger a re-render.
  - Expose minimal options: iterations/maxSimulationTime, gravity, scalingRatio (fa2), margin (noverlap).
  - Large graphs: downshift iterations and/or sampling; avoid blocking main thread.

Edge cases:
- Missing graphology-layout packages: detect once; show only installed choices.
- Pre-existing positions: fa2 should start from current positions for stability.
- Interruptibility: if a new layout is requested, cancel the worker and ignore its result.

## Reagraph renderer (RealReagraph only)
- Reagraph provides layoutProvider types (e.g., forceatlas2, circular2d, concentric2d, radialOut2d, nooverlap, forceDirected2d, treeTd2d where available).
- Plan:
  - Map Topogram layout names to Reagraph types:
    - grid → nooverlap (approximate),
    - circle/circular → circular2d,
    - concentric → concentric2d,
    - breadthfirst/tree → treeTd2d (if provided),
    - force/cola/cose → forceDirected2d (or forceatlas2 as default),
    - preset/custom → keep positions or run FA2 minimally.
  - Adapter already computes `layout` via layoutProvider; extend the map only.
  - Options: iterations scaled by graph size; keep animated=false for heavy graphs.
  - Completion: render triggers once layout props applied; then call fit/center if provided.

Edge cases:
- Missing layoutProvider return: fallback to current positions and log.
- Very large graphs: increase iterations modestly but avoid locking UI; rely on Reagraph’s efficient pipeline.
- Export consistency: positions used for exports should reflect last applied layout.

## Layout registries (renderer → choices)
- cy: [grid, circle, concentric, breadthfirst, cose, (fcose?), (cola?)]
- sigma: [random, circular, forceatlas2, noverlap]
- reagraph: [forceatlas2, circular2d, concentric2d, radialOut2d, nooverlap, forceDirected2d, (treeTd2d?)]

Show only available entries at runtime based on installed plugins/libs. Use a lightweight detector per renderer at mount to set flags.

## Minimal adapter API expectations
- adapter.layout({ name, ...opts }).run();
- adapter.layout(...).on('layoutstop', cb) optional – call cb after positions applied.
- adapter.fit() and/or adapter.center() recommended after layout.

## Testing strategy (when implemented)
- Happy path: small graph, choose each layout per renderer, expect nodes to move and `layoutstop` to fire.
- Edge: empty elements → no errors.
- Edge: repeated layout switches quickly → last choice wins, no crashes.
- Edge: large graph (5k nodes, 10k edges) → completes in reasonable time with animate=false.

## Notes
- The lightweight SVG implementation of Reagraph has been removed from all code paths; only RealReagraph is used at runtime. The legacy file will be deleted in a follow-up cleanup once confirmed unused in all environments.
