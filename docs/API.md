# API, endpoints, and adapter notes

Where to find server-side integration points:

- Collections: `imports/api/*` — Topograms, Nodes, Edges, Comments. Schemas and attachSchema calls live here.
- Publications: `imports/api/*/server/publications.js` (or similar) — these publish controlled subsets of data to the client.
- Methods & endpoints: `imports/api/*/methods.js` and `imports/endpoints/*.js` — server-side methods for import/export, CSV endpoints and JSON routes.
- Server startup: `imports/startup/server/*` — indexes, seed scripts, collection shims.

Common entrypoints:

- `imports/endpoints/api-jsonroutes.js` — JSON REST-like endpoints for exporting/importing or public read access.
- CSV import/export helpers live under `imports/server` or `imports/endpoints` depending on the branch.

If you need to add a new endpoint:

1. Add a handler in `imports/endpoints/` or a Meteor method in `imports/api/<collection>/methods.js`.
2. Add tests in `imports/endpoints/*.test.js` or `tests/`.
3. If the endpoint returns or modifies persisted data, update the collection schema and add a migration in `imports/startup/server/` if needed.

### Export bundles (MapApp Builder)

- Exporting a Topogram bundle is performed outside the Meteor runtime. The server is
	responsible for writing two JSON files that satisfy `mapappbuilder/config.schema.json` and
	the expected dataset shape (`presentation/data/topogram.json`).
- The writer can reuse existing publications/methods to gather data, but no additional
	Meteor-specific API is required by the builder itself.
- See `mapappbuilder/README.md` for the complete packaging workflow and renderer adapters that
	consume the exported JSON.

## New on branch `implementing_debian_graphs`

### Publications

- `Meteor.publish('topograms.paginated', { folder?, noFolder?, page = 1, limit = 200 })`
	- Returns topograms sorted by `createdAt: -1`, with pagination via `limit` and `skip`.
	- When `folder` is provided, only items in that folder are returned.
	- When `noFolder` is truthy, only items with no folder are returned (folder missing, `null`, or empty string).

### Methods

- `Meteor.call('topograms.count', { folder?, noFolder? }) -> Number`
	- Returns the total count of topograms matching the same filters used by the publication.
	- Uses `rawCollection().countDocuments` where available for accuracy on Meteor 3.

- `Meteor.call('topograms.folderCounts') -> Array<{ name: string, count: number }>`
	- Aggregation pipeline groups by `folder` (excluding `null`/missing) and returns a sorted array of folder names with counts.

### Client usage example (Home page)

```js
// Non-foldered list: 200 per page
const ready = useSubscribe('topograms.paginated', { noFolder: true, page, limit: 200 })
const tops = useFind(() => Topograms.find({}, { sort: { createdAt: -1 } }))

// Count for main pager (non-foldered only)
Meteor.call('topograms.count', { noFolder: true }, (_, total) => setTotal(total))

// Folder contents: 50 per page
const folderReady = useSubscribe('topograms.paginated', { folder: name, page, limit: 50 })
const items = useFind(() => Topograms.find({ folder: name }, { sort: { createdAt: -1 } }))

// Counts per folder for the sidebar
Meteor.call('topograms.folderCounts', (_, list) => setFolderList(list))
```

### Import script (outside Meteor)

The Debian ingestion workflow uses `scripts/import_topograms_folder.py` which shells to `mongosh` for inserts. Key flags:

```
--dir <path>            # required — folder containing .topogram.csv/.topogram.xlsx/.topogram.ods files
--folder <label>        # optional — explicit folder label (defaults to directory name)
--clean-folder <label>  # optional — delete all docs for a folder before import
--commit                # perform writes (omit to dry-run)
--limit N               # import at most N files
--mongo-url <url>       # mongodb://localhost:27017/meteor by default
--port <number>         # alternate to mongo-url, e.g., 27017
```

The script normalizes direction fields and ensures edge arrowheads are present when declared in the CSV (`enlightement = 'arrow'`). For spreadsheets (`.xlsx`, `.ods`), it will parse the first sheet by default, or, if present, dedicated sheets named `Nodes` and `Edges`.

### Import UI (inside Meteor)

- The user-facing import modal accepts CSV, XLSX, and ODS. Non-CSV files are uploaded directly and parsed server-side. CSV is lightly validated client-side.
- Server import job detects the format by file extension and parses with Papa Parse (CSV) or SheetJS (XLSX/ODS). If an XLSX/ODS has `Nodes` and `Edges` sheets, both are ingested; otherwise the first sheet is treated as a unified rows table (edges are rows with `source`/`target`).

---

## Client adapter API (Cytoscape-like)

For renderer parity, network adapters implement a small Cytoscape-like imperative API. This lets `TopogramDetail`, Charts, and GeoMap work identically across Cytoscape, Sigma, and Reagraph.

Surface used by the app:

- Lifecycle & camera: `fit()`, `resize()`, `zoom(level?)`, `center()`, `animate({ zoom, center, duration })`, `destroy()`
- Events: `on(event, handler)` and `on(event, selector, handler)` for `'select'|'unselect'` at minimum; `off`, `once`
- Collections: `nodes()`, `edges()`, `elements()` — each returns a collection-like object `{ length, forEach, map, filter }` of wrappers with `id()`, `data(k?)`, `json()`, `select()`, `unselect()`, `hasClass()`, `addClass()`, `removeClass()` where relevant
- Simple selectors: `$(':selected')`, `$('node')`, `$('edge')`, `$('node[id="..."]')`, `$('edge[id="..."]')`, and `$('edge[source="s"][target="t"]')`
- Direct selection: `select(id)`, `unselect(id)`, and `unselectAll()` (optional)
- Layout: `layout(layoutObj).run(); .on('layoutstop', cb)`

Event shapes:

- Selection handlers receive `{ type: 'select'|'unselect', target: { id } }` (nodes) or `{ type, target: { id, source, target } }` (edges)

Timeline:

- The timeline marks `hidden` on nodes/edges. Adapters must preserve attributes and refresh visuals; they should not drop elements.

See `imports/client/ui/components/network/GraphWrapper.jsx` and `docs/SELECTIONS.md` for the contract and a validation checklist.
