# API, endpoints and publications

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
