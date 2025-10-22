# Network renderers (exported presentation)

This document collects how the exported presentation (in `mapappbuilder/.sandboxapp/presentation/app.js`) loads and calls the network renderers (Cytoscape, Sigma, Reagraph). Keep this file next to the `mapappbuilder` folder so you can edit the presentation loader or adapter easily.

## Where the loader lives
- `mapappbuilder/.sandboxapp/presentation/app.js` — main loader for exported presentations. It:
  - loads optional libraries from `presentation/lib/` first, then CDN fallbacks;
  - provides `mapPlugins` and `networkPlugins` objects that implement each renderer;
  - chooses which renderer via query params or `config.json`.

## Loading strategy (helper functions)
- `LIB_BASE` is computed relative to the running script and points to `presentation/lib`.
- `ensureGlobal(globalName, localFilename, cdnUrl)` tries:
  1. `window[globalName]` already present → done.
  2. Load `${LIB_BASE}/${localFilename}` (local)
  3. Load `cdnUrl` fallback
  Returns `true` if the global becomes available.

CDNs used by default in the loader (editable in the file):
- Cytoscape: `https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js`
- Sigma: `https://unpkg.com/sigma@2.3.0/build/sigma.min.js`
- Reagraph (bundled default for presentations): `https://unpkg.com/reagraph@4.30.5/dist/index.umd.js` or local UMD `lib/reagraph.umd.js`

## Which renderer is chosen
- Query param override: `?network=sigma` or `?network=cytoscape` (also `net` or `network` params)
- Else `config.networkRenderer`
- Else default `'cytoscape'`

## Cytoscape usage (call signature and flow)

- Entry: `networkPlugins.cytoscape(el, nodesLocal, edgesLocal, cfg)`
- Preconditions:
  - Throws if `typeof cytoscape === 'undefined'`.
- Data normalization (what the loader creates for Cytoscape elements):
  - Node id computed from `n.id`, `n._id`, or `n.data.id`, else a random id.
  - Node data: `Object.assign({ id: nid }, (n.data && typeof n.data === 'object') ? n.data : n)`
  - Edge data: `id` (from `_id` or generated), `source`, `target`, `label`
  - Elements array: `[{ data: nodeData }, { data: edgeData }, ...]`
- Instantiation:
  - `const cy = cytoscape({ container: el, elements, style, layout: { name: 'preset' } })`
- Styling & visual mapping (applied after `cy` initialization):
  - Node size: `nodeSizeField` or `weight` → `node.style('width', size)`/`height`
  - Node color: `nodeColorField` or `data.color` → `node.style('background-color', value)`
  - Node label: uses precomputed `data._vizLabel` or emoji logic → `node.data('label', ...)`
  - Edge width/color/label: applied via `edge.style('width', ...)`, `edge.style('line-color', ...)`, `edge.data('label', ...)`
  - Parallel-edge handling: groups edges by normalized source|target and set `control-point-step-size`/`text-margin-y` per edge
- Layouts:
  - Uses `netOpts.initialLayout` if present, else falls back to `{ name: 'cose' }` (wrapped in try/catch).

## Sigma usage (call signature and flow)

- Entry: `networkPlugins.sigma(el, nodesLocal, edgesLocal, cfg)`
- Preconditions:
  - Throws if `sigma` global is missing
- Data normalization for Sigma:
  - Builds `graph = { nodes: [], edges: [] }`
  - Nodes: `{ id, label, x: Math.random(), y: Math.random(), size, color }`
  - Edges: `{ id, source, target, size, color }`
  - Note: positions (x,y) are random by default; if you want deterministic layout, use coordinates from node data or run a layout plugin
- Instantiation:
  - `const Sigma = window.sigma || sigma`
  - `new Sigma({ graph, container })`
- Notes:
  - Minimal styling is applied; extend after instantiation or supply extended node/edge properties

## Reagraph (GraphCanvas bridge)

- Entry: `networkPlugins.reagraph(el, nodesLocal, edgesLocal, cfg)`.
- Loader resolves the bundle in the following order:
  1. `window.reagraph` (preferred) — set when the UMD exports a top-level object with
     `GraphCanvas`.
  2. `window.reagraphBundle` — some UMD builds namespace the exports under this object.
  3. `bundle.default` — when the bundle uses an ESM-style default export.
- React/graphology dependencies are also shipped locally. The loader exposes them back onto
  `window.React`, `window.ReactDOM(Client)`, `window.graphology` when absent so the rest of
  the page can interop.
- Graph creation:
  - Tries to instantiate `new GraphCtor({ multi: true, allowSelfLoops: true })` when
    `graphology` is bundled.
  - Calls `reagraph.buildGraph(graph, nodes, edges)`; if the constructor failed it falls back
    to `buildGraph(null, ...)` so Reagraph can create its internal store.
- Layout:
  - Uses `networkOptions.layoutType` and `networkOptions.layoutIterations` with a safe
    fallback to `forceDirected2d`.
  - Logs `[reagraph] render inputs prepared` with the chosen layout and node/edge counts to
    make debugging easier.
- Rendering:
  - Creates a React element via `React.createElement(reagraph.GraphCanvas, { graph, layout,
    nodes, edges, ...options })`.
  - Prefers `createRoot(container)` (React 18/19) and falls back to legacy
    `ReactDOM.render(...)` if necessary.
  - Stores an `_reagraphCleanup` handle on the DOM element so hot-swapping renderers unmounts
    cleanly.
- Data payload: the normalised `nodes`/`edges` arrays remain available on the props and match
  what the Cytoscape adapter receives. Node size, colour and label hints mirror the main app.

## Practical tips / edit checklist
- To test alternate renderers quickly, use query params: `?network=sigma&geomap=leaflet`.
- To add a bundled version of a renderer, put its UMD file into `presentation/lib/` with the expected name (`cytoscape.min.js`, `sigma.min.js`, `reagraph.umd.js`) — the loader will try local first.
- To modify style/label logic for Cytoscape: edit `networkPlugins.cytoscape` in `app.js` — adjust `style` array and the `cy.nodes().forEach`/`cy.edges().forEach` mappings.
- To debug Cytoscape interactively: add a debug line after creation, e.g. `window._lastCy = cy`.

## Quick snippets (what the loader does, simplified)

Cyto init (simplified):

```js
const elements = normalize(nodesLocal, edgesLocal)
const cy = cytoscape({ container: el, elements, style, layout: { name: 'preset' } })
// apply per-node/edge styles
cy.layout({ name: 'cose' }).run()
```

Sigma init (simplified):

```js
const graph = { nodes: nodesLocal.map(...), edges: edgesLocal.map(...) }
new sigma({ graph, container })
```

---

File created to make future edits easier. If you want, I can:
- add a small patch that exposes `cy` to `window` for debugging, or
- create a variant of the loader that prefers a local UMD `lib/reagraph.umd.js`.
