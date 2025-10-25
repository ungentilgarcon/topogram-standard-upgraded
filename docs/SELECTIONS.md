# Selection behavior (nodes & edges) — audit

This document summarizes how node/edge selection worked in the original Topogram main-line code (behavior observed in `TopogramDetail.jsx`, `TopogramGeoMap`, `Charts`, `SelectionPanel`, and related components). It explains how selection is represented, how various panels interact with selection, timeline implications, and recommended fixes/notes for the `multinetworkviewers` branch adapters.

## Canonical representation of selected elements

- Selected elements (nodes and edges) are represented as plain element JSON objects (Cytoscape-style) and kept in React state: `TopogramDetail` stores `selectedElements` (array).
- Each selected element JSON typically has the shape:
  - Node: `{ group: 'nodes', data: { id: '<vizId>', ...other fields... }, _id: '<mongoId>' }`
  - Edge: `{ group: 'edges', data: { id: '<edgeIdOrPair>', source: '<srcVizId>', target: '<tgtVizId>', ... }, _id: '<mongoEdgeId>' }`
- `TopogramDetail` exposes helpers used by other panels:
  - `selectElement(json)` — attempts to select the element in the active `cy` instance (if present) and falls back to pushing the element into `selectedElements` state.
  - `unselectElement(json)` — attempts to unselect in `cy` and falls back to removing it from state.
  - These helpers prefer Cytoscape queries and selection APIs, e.g. `cy.filter("node[id='xxx']").select()` or `cy.$("edge[source=\"s\"][target=\"t\"]").select()`.

## Cytoscape view (network)

- When `cy` is the renderer (react-cytoscapejs / cytoscape):
  - `TopogramDetail` attaches event listeners on `cy` when the instance is set:
    - `cy.on('select', 'node, edge', onSelect)` — onSelect reads `cy.$(':selected').toArray()` and mirrors selection to `selectedElements` in React state.
    - `cy.on('unselect', 'node, edge', onUnselect)` — does the same after an unselect event.
  - `selectElement` attempts to find the element by id (`node[id='...']` or `edge[id='...']`) and call `.select()` on the Cytoscape element so Cytoscape's select handler can mirror the full set.
  - The application relies on Cytoscape's `:selected` selector in many places (e.g., snapshotting) and uses `el.json()` to get canonical element JSON.
  - Stylesheet rules use `node:selected` and `edge:selected` selectors for visual highlight; selection also drives the SelectionPanel contents.

## GeoMap (Leaflet) view

- `TopogramGeoMap` forwards `selectElement` and `unselectElement` functions to the `GeoMap` component and expects the GeoMap to call them with element JSON shaped like Cytoscape element JSON.
- `GeoMap` (and child components `GeoNodes`, `GeoEdges`) implement `handleClickGeoElement` which toggles selection by consulting `this.props.ui.selectedElements` (the current React selection state), computing `isSelected`, and invoking either `selectElement(json)` or `unselectElement(json)` accordingly.
- GeoMap therefore uses React's `selectedElements` as the source of truth for selection and relies on TopogramDetail helpers to carry selection into `cy` (when `cy` is present) or into the shared React state.

## Timeline interactions (filtering / hidden classes)

- `TopogramDetail` maintains `timelineUI.valueRange` and, on change, toggles a `hidden` class on nodes/edges in `cy` to reflect visibility.
- The timeline effect:
  - Computes an `activeRange` from `timelineUI.valueRange` and `hasTimeInfo`.
  - Computes how many nodes would be visible; if zero, it aborts to avoid hiding everything.
  - It adds/removes the class `hidden` on nodes/edges (`node.addClass('hidden')` or `node.removeClass('hidden')`). The stylesheet uses `node.hidden`/`edge.hidden` to hide visually while preserving elements and interactivity-disabled via `events: 'no'`.
  - After node visibility toggle it updates `lastVisibleCountRef` and schedules a `resize()`/`fit()` on the Cytoscape instance if visible count changed.
  - It also contains logic to ensure edges follow node visibility (edges hidden when endpoints are hidden), and it ensures nodes incident to visible edges are un-hidden (post-process).
- For non-Cytoscape adapters (e.g. Sigma), `TopogramDetail` delegates timeline visibility application to an adapter-specific function `applyTimelineToSigmaAdapter(adapter, vr, hasTimeInfo)` which sets `hidden` attributes on graph nodes/edges in the adapter's underlying data model and calls `renderer.refresh()`.

## Charts and selection

- `Charts` receives `ui` (which includes `cy`, `selectedElements`, and the `updateUI` helper) and implements selection helpers:
  - `selectElement(el)` — marks `el.data.selected = true`, tries to `cy.filter(sel).select()` and calls `updateUI('selectedElements', [...ui.selectedElements, el])`.
  - `unselectElement(el)` — sets `el.data.selected = false`, tries to `cy.filter(sel).unselect()` then updates `selectedElements` via `updateUI`.
  - `_toggleBatch(elements)` — bulk-select/unselect elements; uses `cy.filter(sel).select()` / `.unselect()` if possible, else falls back to setting data.
- Charts assumes `cy` supports `filter(...).select()` and that after calling `.select()` the Cytoscape select event handler will mirror selection into React state (so Charts updates `selectedElements` by calling `updateUI`).

## SelectionPanel

- `SelectionPanel` receives `selectedElements` plus `onUnselect` and `onClear` handlers. It is purely a UI list + CSV exporter; it doesn't mutate selection itself except through those handlers.
- Buttons call `onUnselect(el)` or `onClear()` which call back into TopogramDetail to unselect via Cytoscape or via state fallback.

## Event names and shapes used by panels

- Cytoscape events: `select`, `unselect` (attached on `'node, edge'` selector). TopogramDetail's handlers read `cy.$(':selected')` and mirror the selection.
- Adapter-level events: The custom adapters (Sigma and Reagraph in the branch) emulate a small Cytoscape-like API by exposing `on('select', handler)` and `on('unselect', handler)` where handler is invoked with an object like `{ type: 'select'|'unselect', target: { id: '<id>' } }`.
- `selectElement` / `unselectElement` expect a JSON element matching Cytoscape-style `el.json()` output and will attempt to call `cy.filter(...)` and `.select()` / `.unselect()` on it. If `cy` is an adapter (Sigma/Reagraph) they will invoke adapter methods like `adapter.select(id)` / `adapter.unselect(id)` if supported.

## Known constraints & invariants enforced on main

1. The code prefers Cytoscape as the authoritative source of truth for selection: when `cy` is present, `selectElement` and `unselectElement` call Cytoscape APIs so Cytoscape event handlers mirror selection into React state. The adapters must provide the same event semantics for parity.
2. The timeline uses class toggling (`hidden`) rather than removing elements so selection and element identity remain stable during playback.
3. GeoMap toggles selection using the TopogramDetail helpers and inspects `ui.selectedElements` as the source of truth for whether a node/edge is selected.
4. Charts also mutates selection by calling `cy.filter(...).select()` and `updateUI('selectedElements', ...)` — it expects `updateUI` to persist the selected set.

## Root causes when selection breaks (observed on the branch)

From the current `multinetworkviewers` branch work we observed:
- Selection toggling may be undone immediately if click handlers do not `stopPropagation()` and a background click handler clears selection.
- Adapters that toggle Graphology attributes (e.g. set / remove `selected`) must emit `select`/`unselect` events comparable to Cytoscape so higher-level code (TopogramDetail, Charts, GeoMap) can observe selection changes.
- The timeline logic for Sigma/Reagraph delegates to adapter-specific code; if the adapter does not correctly set or preserve `hidden` attributes on nodes/edges, timeline filtering can appear broken.

## Recommendations for parity with main

1. Adapter API contract (must implement all of these):
   - impl: string (e.g. 'sigma' or 'reagraph')
   - on(event, selectorOrHandler, handler?) — supports `select` and `unselect` events. Handlers should be called with an object: `{ type: 'select'|'unselect', target: { id: '<id>' } }` and the adapter should also support `on('select', handler)` without selector argument.
   - nodes(), edges(), elements() — provide collections that can be filtered, have `.forEach`, `.map`, `.filter` and wrapper elements exposing `id()`, `data()`, `json()`, `select()`, `unselect()`, `hasClass()`, `addClass()` and `removeClass()` where relevant.
   - select(id), unselect(id) — immediate selection APIs that update internal state and emit events; adapters should also call renderer refresh (or equivalent) so visuals update.
   - layout().run() — run layout and call `on('layoutstop', cb)` when done.
   - fit(), zoom(), center(), animate() — camera APIs used by Topogram controls.
   - destroy() — cleanup DOM and event handlers.

2. Selection event parity:
   - When a selection change happens (by click, programmatic .select/unselect or timeline adapter code), adapters must emit `select`/`unselect` events and call any registered handlers. Handlers should be invoked with the same event shape TopogramDetail expects so its `onSelect`/`onUnselect` mirror logic (reading `:selected`) continues to work or is replaced by handler-provided events.
   - Always refresh the renderer after attribute changes so visual state matches internal state.

3. GeoMap and charts:
   - Both inspect `ui.selectedElements` for current selection and call `selectElement` / `unselectElement` to toggle selection. Ensure adapter `select(id)`/`unselect(id)` updates `selectedElements` via adapter events or TopogramDetail fallback paths.

4. Timeline filtering:
   - The timeline should set a minimal `hidden` attribute on nodes/edges in adapters (not replace or drop attributes). Adapters must preserve `start`/`end`/`time` attributes so timeline checks can read them.
   - For Graphology-based adapters ensure `graph.setNodeAttribute(id,'hidden',true)` and `graph.removeNodeAttribute(id,'hidden')` are used and that `renderer.refresh()` is called after batch changes.

5. Small UX fixes to avoid accidental deselects:
   - For DOM-based adapters, stopPropagation on node/edge click handlers so a background click handler doesn't immediately clear the selection.
   - Emit select/unselect events after the state change, not before.

## Checklist to validate parity (test plan)
- [ ] With Cytoscape: select a node; confirm SelectionPanel shows it; click map node — SelectionPanel updates; timeline hides nodes — selection persists for visible nodes.
- [ ] With Sigma adapter: select node; visuals update; SelectionPanel updates; timeline filtering hides nodes via adapter (no attributes lost); clicking background clears selection and does not immediately undo node selection.
- [ ] With Reagraph adapter: same checks as Sigma.
- [ ] Charts: clicking donut/sparkline items selects nodes in the graph and updates SelectionPanel.

Status (2025-10-25)

- Sigma adapter: clean rewrite landed; edge labels (text/emoji) rendered on canvas with size/weight mapping; curved edges and arrowheads supported when `@sigma/edge-curve` is available; selection mirrors to SelectionManager and emits `select`/`unselect`.
- Reagraph adapter: lightweight parity shim in `reagraph/ReagraphAdapter.js` implements the same surface for the static bundles and optional in-app use.

## Notes & references
- `TopogramDetail.jsx` is the canonical integration point — it builds element JSON, applies timeline filtering, and mirrors selection.
- `GeoMap` expects `selectElement`/`unselectElement` helpers and uses `ui.selectedElements` as the source of truth.
- `Charts` mutates `cy` and calls `updateUI('selectedElements', ...)` to keep the React state in sync.

If you want, I can now:
- Create a small unit/test harness that simulates click/select flows against the adapters and asserts emitted events and `selectedElements` updates.
- Implement additional adapter fixes to ensure exact event shapes and renderer refreshes (I already applied fixes earlier to reduce the selection issues).

---
Generated on 2025-10-15 — extracted from `TopogramDetail.jsx`, `TopogramGeoMap.jsx`, `Charts.jsx`, `SelectionPanel.jsx`, `GeoMap.jsx` in the repository at HEAD.
