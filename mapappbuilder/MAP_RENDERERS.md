# Map renderers (exported presentation)

This document explains how the exported presentation loader (`mapappbuilder/.sandboxapp/presentation/app.js`) loads and uses map renderers: Leaflet, MapLibre and Cesium.

## Loader location
- `mapappbuilder/.sandboxapp/presentation/app.js`

## Loading strategy
- The loader computes `LIB_BASE` (presentation/lib) relative to the script and tries local files first, then CDN fallbacks.
- `ensureGlobal(globalName, localFilename, cdnUrl)` is used to make a library available. It:
  1. Checks `window[globalName]`.
  2. Attempts to load `${LIB_BASE}/${localFilename}`.
  3. Falls back to the provided CDN URL.

Default CDNs in the loader (editable):
- Leaflet CSS/JS: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` and `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
- MapLibre GL JS/CSS: `https://unpkg.com/maplibre-gl@2.6.2/dist/maplibre-gl.js` and corresponding CSS
- Cesium: `https://unpkg.com/cesium/Build/Cesium/Cesium.js`

## Which renderer is chosen
- Query params can override: `?geomap=leaflet` or `?geomap=maplibre` or `?geomap=cesium` (also `map` or `mapRenderer`).
- Else `config.mapRenderer` is used.
- If not specified and nodes contain geo coords the loader defaults to `leaflet`.

## Leaflet (call signature & behavior)

- Entry point: `mapPlugins.leaflet(el, nodesLocal, edgesLocal, cfg)`
- Preconditions:
  - Requires `L` global (Leaflet). The loader ensures `L` via `ensureGlobal('L', 'leaflet.js', CDNS.leaflet.js)`.
  - `el` is the DOM element to host the map.
- What it does:
  - Creates a map: `const map = L.map(el).setView([0,0], 2)` and adds OpenStreetMap tile layer.
  - Adapts marker icon base paths by checking `LIB_BASE + '/images'` and adjusting `L.Icon.Default.prototype.options`.
  - Computes node locations by reading `lat/lon` candidates via `readField(n, 'lat', 'latitude', 'y')` and `readField(n, 'lon', 'lng', 'longitude', 'x')`.
  - Adds circle markers for nodes with geo coords via `L.circleMarker([lat, lon], { radius, color, ... })` and binds popups with labels.
  - Draws edges as polylines when both endpoints have geo coords, computing width via edge weights.
  - If markers exist, fits bounds: `map.fitBounds(group.getBounds().pad(0.2))`.

## MapLibre (call signature & behavior)

- Entry point: `mapPlugins.maplibre(el, nodesLocal, edgesLocal, cfg)`
- Preconditions:
  - Requires `maplibregl` or `maplibre` global. Loader attempts both via `ensureGlobal('maplibregl', 'maplibre-gl.js', CDNS.maplibre.js)` and `ensureGlobal('maplibre', ...)`.
- What it does:
  - Creates a MapLibre GL map in a container div with style `https://demotiles.maplibre.org/style.json`.
  - On `map.on('load')` constructs a GeoJSON FeatureCollection from nodes with valid lat/lon and adds it as a source.
  - Adds a circle layer `map.addLayer({ id: 'nodes-layer', type: 'circle', source: 'nodes', paint: { 'circle-radius': 6, 'circle-color': '#666' } })`.
  - Note: it tries to be defensive if older MapLibre builds expose slightly different APIs.

## Cesium (call signature & behavior)

- Entry point: `mapPlugins.cesium(el, nodesLocal, edgesLocal, cfg)`
- Preconditions:
  - Requires `Cesium` or `CesiumJS` global. The loader sets `window.CESIUM_BASE_URL = LIB_BASE + '/'` before loading Cesium so relative assets resolve locally.
- What it does:
  - Creates a Cesium `Viewer` in a container element.
  - If `Ces.Ion.defaultAccessToken` is available it may configure `createWorldTerrain`; otherwise it uses a basic viewer.
  - Adds point entities for nodes that have lat/lon using `viewer.entities.add({ position: Ces.Cartesian3.fromDegrees(lon, lat), point: { pixelSize, color } })`.

## Data handling notes (shared)
- The loader uses helper `readField(obj, ...candidates)` to support both flat fields and nested `data` objects (i.e., `node.data.lat` or `node.lat`).
- Node identification: nodes may have `id`, `_id`, or nested `data.id`; the loader normalizes where needed.

## Practical tips
- To test map renderers quickly, use query params: `?geomap=leaflet`, `?geomap=maplibre`, or `?geomap=cesium`.
- To include a specific UMD for a renderer put it in `presentation/lib/` with the expected filename (e.g., `leaflet.js`, `maplibre-gl.js`, `cesium.js`) and the loader will prefer the local copy.
- When modifying map rendering logic, edit `mapPlugins.<name>` in `app.js`.

---

File created to make future edits easier. I can also add quick patches to:
- expose the Leaflet `map` instance as `window._lastMap` for debugging, or
- add a small HTML snippet that toggles renderers via query params.
