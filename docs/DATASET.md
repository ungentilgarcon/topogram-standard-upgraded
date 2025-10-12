# Dataset and collection schemas

This document summarises the main collections (Topograms, Nodes, Edges) and the CSV export format used by the application.

## Collections

All collections live under `imports/api/*` and are validated with `SimpleSchema` (shimmed to `simpl-schema`).

### Topograms

Fields (Topograms.schema):

- `title` (String) — human readable title of the topogram.
- `slug` (String) — safe short name.
- `sharedPublic` (Boolean) — whether the topogram is publicly visible.
- `description` (String, optional) — description text.
- `userId` (String, optional) — Meteor user id (RegEx.Id).
- `createdAt` (Date) — creation timestamp.

### Nodes

Nodes are graph nodes used by Cytoscape and GeoMap.

Schema highlights (Nodes.schema):

- `topogramId` (String, RegEx.Id) — reference to a Topogram `_id`.
- `data` (Object) — user-visible fields stored under `data`.
  - `data.id` (String) — cytoscape node id (auto-generated if missing: `node-<random>`).
  - `data.name` (String, optional)
  - `data.starred` (Boolean, optional)
  - `data.start`, `data.end` (Date, optional)
  - `data.lat`, `data.lng` (Number, optional)
  - `data.weight` (Number, optional)
  - `data.color` (String, optional)
  - `data.group` (String, optional)
  - `data.notes` (String, optional)
- `group` (String) — defaults to `'nodes'`.
- `position` — `{ x, y }` (Numbers) used by Cytoscape layout.
- `owner`, `updatedAt`, `createdAt` — metadata.

### Edges

Edges connect nodes; fields live under `data` similarly.

Schema highlights (Edges.schema):

- `topogramId` (String, RegEx.Id)
- `data.id` (String, optional) — edge id (auto `edge-<random>` if missing)
- `data.source` (String) — source node's `data.id` (should match a Nodes.data.id)
- `data.target` (String) — target node's `data.id`
- `data.name`, `data.starred`, `data.start`, `data.end`, `data.weight`, `data.color`, `data.group`, `data.notes` — optional fields mirroring nodes
- `group` = `'edges'` by default
- `owner`, `updatedAt`, `createdAt`

## CSV Export format

The app exports CSVs in a canonical layout used by the ImportCsvModal and other scripts. Exported CSV contains:

- A first line with the (sanitised) Title used for the export.
- A blank line.
- A header row describing exported fields.
- Then one row per node/edge (nodes first, then edges), fields include `group`, `id`, `name`, `start`, `end`, `weight`, `color`, `notes`, `lat`, `lng`, and more depending on fields present.

Example (pseudo-CSV):

"My Topogram Export"

group,id,name,start,end,weight,color,notes,lat,lng,...
nodes,node-1,Paris,2017-01-01,2018-01-01,5,#ff0000,"Capital city",48.8566,2.3522,...
edges,edge-1,link,2017-05-01,2017-05-02,1,#0000ff,"Between nodes",,,source:node-1,target:node-2

Notes:
- Filenames are sanitised: non-alphanumerics replaced with dashes and filename truncated to ~100 chars.
- Lines use CRLF (\r\n) for maximum cross-platform CSV import compatibility.
