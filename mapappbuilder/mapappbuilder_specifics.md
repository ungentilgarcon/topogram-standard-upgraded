We are in the `mapappbuilder` branch of Topogram. This folder packages the artefacts that
turn a Topogram dataset into a standalone static application. Use these notes as a quick
orientation before modifying the builder.

Key points:

- **No Meteor runtime.** Everything under `mapappbuilder/` is plain Node/JS tooling plus a
	static presentation template. Keep it framework-agnostic so bundles stay lightweight.
- **Presentation assets live in two places:**
	- `presentation-template/` — source template copied into exported bundles.
	- `.sandboxapp/presentation/` — a synced copy used for local testing. Run
		`./sync_sandboxapp.sh` after editing the template.
- **Renderer adapters:** `mapappbuilder/.sandboxapp/presentation/app.js` hosts the loader
	that normalises nodes/edges and instantiates map/network plugins. Every renderer (Cytoscape,
	Sigma, Reagraph, Leaflet, MapLibre, Cesium) is documented in
	`NETWORK_RENDERERS.md` and `MAP_RENDERERS.md`. Update these notes whenever adapter logic
	changes.
- **Bundled dependencies:** UMD builds for React 19, Reagraph, graphology, Cytoscape, Sigma,
	Leaflet, MapLibre and Cesium sit under `presentation-template/lib/`. When you upgrade a
	dependency, update the copies in both the template and the sandbox.
- **Configuration contract:** `config.schema.json` defines what the exporter must write.
	`sample.config.json` demonstrates the supported fields. Any breaking change to the schema
	should include a migration note here and in the README.
- **Packaging:** `package.sh` expects `presentation/config.json` and
	`presentation/data/topogram.json` to exist. It zips the template in-place; no build system
	is invoked. Scripts interacting with it should copy their artefacts into `presentation/`
	before running the package step.
- **Testing:** `.sandboxapp/start_server.sh` launches a static server bound to port 3024 by
	default. Use query parameters (`?network=reagraph&geomap=leaflet`) to toggle renderers at
	runtime while debugging.

Keep the builder focused: do not import Meteor client code or server-side helpers here.
Instead, export JSON from the main app and drop it into the builder.
