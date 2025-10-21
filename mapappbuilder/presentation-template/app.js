// Loader for exported presentation (Leaflet + Cytoscape)
// This script dynamically loads required libraries from CDNs, fetches
// /config.json and /data/topogram.json and initializes the map + network.

(function(){
	const CDNS = {
		leaflet: {
			css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
			js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
		},
		cytoscape: {
			js: 'https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js'
		}
	}
	// Additional optional renderers
	CDNS.maplibre = { css: 'https://unpkg.com/maplibre-gl@2.6.2/dist/maplibre-gl.css', js: 'https://unpkg.com/maplibre-gl@2.6.2/dist/maplibre-gl.js' }
	CDNS.cesium = { js: 'https://unpkg.com/cesium/Build/Cesium/Cesium.js' }
	CDNS.sigma = { js: 'https://unpkg.com/sigma@2.3.0/build/sigma.min.js' }
	CDNS.reagraph = { js: 'https://unpkg.com/reagraph@1.5.0/dist/reagraph.min.js' }

	function loadScript(url){
		return new Promise((resolve,reject)=>{
			const s = document.createElement('script')
			s.src = url
			s.async = true
			s.onload = () => resolve()
			s.onerror = (e) => reject(new Error('Failed to load '+url))
			document.head.appendChild(s)
		})
	}

	// determine a base path for presentation/lib relative to this script
	const LIB_BASE = (function(){
		try {
			const script = document.currentScript || (function(){
				const s = document.getElementsByTagName('script')
				return s && s.length ? s[s.length-1] : null
			})()
			if (script && script.src) {
				const src = script.src
				const idx = src.lastIndexOf('/')
				if (idx !== -1) return src.substring(0, idx) + '/lib'
			}
		} catch (e) {}
		return 'presentation/lib'
	})()

	// Try to ensure a global is available by loading local file from
	// <LIB_BASE>/<filename> or falling back to the provided CDN URL.
		// ensureGlobal tries to make a global available by loading local file and/or CDN.
		// options: { preferCdn: boolean, skipLocal: boolean }
		async function ensureGlobal(globalName, localFilename, cdnUrl, options = {}) {
			const preferCdn = !!options.preferCdn
			const skipLocal = !!options.skipLocal
		if (typeof window !== 'undefined' && window[globalName]) return true
		const localUrl = `${LIB_BASE}/${localFilename}`
		// If preferCdn is true, try CDN first, then local
			if (preferCdn && cdnUrl) {
			try {
				await loadScript(cdnUrl)
				if (window[globalName]) return true
			} catch (e) {
				// ignore and try local next
			}
		}
			if (skipLocal) return false
			try {
			await loadScript(localUrl)
			if (window[globalName]) return true
		} catch (e) {
			// ignore and try CDN next
		}
		if (!preferCdn && cdnUrl) {
			try {
				await loadScript(cdnUrl)
				if (window[globalName]) return true
			} catch (e) {}
		}
		return false
	}

	function loadCss(url){
		return new Promise((resolve,reject)=>{
			const l = document.createElement('link')
			l.rel = 'stylesheet'
			l.href = url
			l.onload = () => resolve()
			l.onerror = () => reject(new Error('Failed to load css '+url))
			document.head.appendChild(l)
		})
	}

		function tryLoadAll(){
		// Prefer local copies in presentation/lib if available, otherwise fall
		// back to CDN. We try to load leaflet.css, leaflet.js and cytoscape.js
		const promises = []
	const localBase = LIB_BASE
		function localExists(url){
			// Fast existence check via fetch HEAD is not universally supported; try GET but don't fail if 404
			return fetch(url, { method: 'GET' }).then(r => r.ok).catch(() => false)
		}

		const tryLoad = async () => {
			const leafletCssLocal = `${localBase}/leaflet.css`
			const leafletJsLocal = `${localBase}/leaflet.js`
			const cytoJsLocal = `${localBase}/cytoscape.min.js`
			const maplibreCssLocal = `${localBase}/maplibre-gl.css`
			const maplibreJsLocal = `${localBase}/maplibre-gl.js`
			const cesiumJsLocal = `${localBase}/cesium.js`
			const sigmaJsLocal = `${localBase}/sigma.min.js`
			const reagraphJsLocal = `${localBase}/reagraph.min.js`

			if (await localExists(leafletCssLocal)) {
				promises.push(loadCss(leafletCssLocal))
			} else if (CDNS.leaflet.css) {
				promises.push(loadCss(CDNS.leaflet.css))
			}

			if (await localExists(leafletJsLocal)) {
				promises.push(loadScript(leafletJsLocal))
			} else if (CDNS.leaflet.js) {
				promises.push(loadScript(CDNS.leaflet.js))
			}

			// MapLibre
			if (await localExists(maplibreCssLocal)) {
				promises.push(loadCss(maplibreCssLocal))
			} else if (CDNS.maplibre && CDNS.maplibre.css) {
				promises.push(loadCss(CDNS.maplibre.css))
			}
			if (await localExists(maplibreJsLocal)) {
				promises.push(loadScript(maplibreJsLocal))
			} else if (CDNS.maplibre && CDNS.maplibre.js) {
				promises.push(loadScript(CDNS.maplibre.js).catch(()=>{}))
			}

			// Cesium (optional)
			if (await localExists(cesiumJsLocal)) {
				promises.push(loadScript(cesiumJsLocal))
			} else if (CDNS.cesium && CDNS.cesium.js) {
				promises.push(loadScript(CDNS.cesium.js).catch(()=>{}))
			}

			// Sigma and Reagraph (optional)
			if (await localExists(sigmaJsLocal)) {
				promises.push(loadScript(sigmaJsLocal))
			} else if (CDNS.sigma && CDNS.sigma.js) {
				promises.push(loadScript(CDNS.sigma.js).catch(()=>{}))
			}
			// For reagraph we prefer the CDN version by default (some environments serve a CDN-friendly build)
			if (CDNS.reagraph && CDNS.reagraph.js) {
				// attempt to load CDN first but do not fail hard if it 404s; fall back to local
				promises.push((async ()=>{
					try {
						// prefer CDN: try it first with ensureGlobal(preferCdn=true)
						const ok = await ensureGlobal('reagraph', 'reagraph.min.js', CDNS.reagraph.js, { preferCdn: true })
						return ok
					} catch(e){ return false }
				})())
			} else if (await localExists(reagraphJsLocal)) {
				promises.push(loadScript(reagraphJsLocal))
			}

			// try cytoscape local copy as well (optional)
			if (await localExists(cytoJsLocal)) {
				promises.push(loadScript(cytoJsLocal))
			} else if (CDNS.cytoscape && CDNS.cytoscape.js) {
				// don't block on cytoscape if not needed; load it so plugin sees it
				promises.push(loadScript(CDNS.cytoscape.js).catch(()=>{}))
			}

			return Promise.all(promises)
		}

		return tryLoad()
	}

	function showError(msg){
		console.error(msg)
		const root = document.getElementById('app') || document.body
		const el = document.createElement('div')
		el.style.background = '#ffefef'
		el.style.color = '#900'
		el.style.padding = '8px'
		el.style.margin = '8px'
		el.textContent = msg
		root.insertBefore(el, root.firstChild)
	}

	async function initMapAndNetwork(data, config) {
		const mapEl = document.getElementById('map')
		const netEl = document.getElementById('network')

		const nodes = Array.isArray(data.nodes) ? data.nodes : []
		const edges = Array.isArray(data.edges) ? data.edges : []

		// Robust geo-detection helper
		function parseCoord(v) {
			if (v === null || v === undefined) return NaN
			const num = parseFloat(v)
			return Number.isFinite(num) ? num : NaN
		}

		// Helper to read a field from an object or from its `.data` subobject
		function readField(obj, ...candidates) {
			if (!obj) return undefined
			for (const k of candidates) {
				if (obj[k] !== undefined) return obj[k]
			}
			if (obj.data && typeof obj.data === 'object') {
				for (const k of candidates) {
					if (obj.data[k] !== undefined) return obj.data[k]
				}
			}
			return undefined
		}

		const hasGeo = nodes.some(n => {
			const lat = parseCoord(readField(n, 'lat', 'latitude', 'y'))
			const lon = parseCoord(readField(n, 'lon', 'lng', 'longitude', 'x'))
			return !Number.isNaN(lat) && !Number.isNaN(lon)
		})

		// Map plugin implementations
		const mapPlugins = {
	leaflet: async function(el, nodesLocal, edgesLocal, cfg) {
				if (!el) return
				if (typeof L === 'undefined') throw new Error('Leaflet not available')
				el.innerHTML = ''
				const map = L.map(el).setView([0,0],2)
				L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map)

				// prefer bundled images for legacy icon paths but we will use circle markers by default
				try {
					(async ()=>{
						const imgBase = LIB_BASE + '/images'
						let useBase = imgBase
						try {
							const r = await fetch(imgBase + '/marker-icon.png', { method: 'GET' })
							if (!r.ok) useBase = 'https://unpkg.com/leaflet@1.9.4/dist/images'
						} catch(e) { useBase = 'https://unpkg.com/leaflet@1.9.4/dist/images' }
						try {
							if (L && L.Icon && L.Icon.Default && L.Icon.Default.prototype && L.Icon.Default.prototype.options) {
								L.Icon.Default.prototype.options.iconUrl = useBase + '/marker-icon.png'
								L.Icon.Default.prototype.options.iconRetinaUrl = useBase + '/marker-icon-2x.png'
								L.Icon.Default.prototype.options.shadowUrl = useBase + '/marker-shadow.png'
							}
						} catch(e){}
					})()
				} catch(e){}

				// compute node weight ranges to map to circle radii
				const netOpts = (cfg && cfg.networkOptions) || {}
				const nodeSizeField = netOpts.nodeSizeField
				const nodeColorField = netOpts.nodeColorField

				const nodeWeights = nodesLocal.map(n => {
					const w = readField(n, 'weight')
					return (w != null) ? (parseFloat(w) || 0) : null
				}).filter(v => v != null)
				const minW = nodeWeights.length ? Math.min(...nodeWeights) : 1
				const maxW = nodeWeights.length ? Math.max(...nodeWeights) : 1

				function mapRange(value, dmin, dmax, rmin, rmax) {
					const v = parseFloat(value)
					if (!Number.isFinite(v) || dmax === dmin) return (rmin + rmax) / 2
					const t = (v - dmin) / (dmax - dmin)
					return rmin + t * (rmax - rmin)
				}

				// build quick id->latlng map for edges
				const idToLatLng = {}
				nodesLocal.forEach(n => {
					// collect possible id variants and map them to the same lat/lng
					const candidates = []
					if (n.id != null) candidates.push(String(n.id))
					if (n._id != null) candidates.push(String(n._id))
					if (n.data && n.data.id != null) candidates.push(String(n.data.id))
					if (n.data && n.data._id != null) candidates.push(String(n.data._id))
					// also include any `key` or `nodeId` like fields if present
					if (n.data && n.data.nodeId != null) candidates.push(String(n.data.nodeId))
					if (n.data && n.data.key != null) candidates.push(String(n.data.key))
					const lat = parseCoord(readField(n, 'lat', 'latitude', 'y'))
					const lon = parseCoord(readField(n, 'lon', 'lng', 'longitude', 'x'))
					if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
						const latlon = [lat, lon]
						candidates.forEach(id => { if (id) idToLatLng[id] = latlon })
					}
				})

				const markers = []
				nodesLocal.forEach(n => {
					const lat = parseCoord(readField(n, 'lat', 'latitude', 'y'))
					const lon = parseCoord(readField(n, 'lon', 'lng', 'longitude', 'x'))
					if (!Number.isNaN(lat) && !Number.isNaN(lon)){
						// determine radius using nodeSizeField or weight
						let radius = 6
						const dataSize = nodeSizeField ? readField(n, nodeSizeField) : undefined
						if (dataSize != null) radius = Math.max(2, parseFloat(dataSize) || 2)
						else {
							const w = readField(n, 'weight')
							if (w != null) radius = Math.max(3, mapRange(w, minW, maxW, 6, 24))
						}
						// color
						let fillColor = '#666'
						const colorVal = nodeColorField ? readField(n, nodeColorField) : undefined
						if (colorVal != null) fillColor = String(colorVal)
						else if (readField(n, 'color')) fillColor = String(readField(n, 'color'))

						const circle = L.circleMarker([lat, lon], { radius: radius, color: '#222', weight: 1, fillColor: fillColor, fillOpacity: 0.9 })
						const title = (n.label || n.name || n.title || ('node '+(n.id||n._id||'')))
						circle.bindPopup(String(title))
						circle.addTo(map)
						markers.push(circle)
					}
				})

				// draw edges as polylines when both endpoints have geo coords
				const edgeWeights = edgesLocal && Array.isArray(edgesLocal) ? edgesLocal.map(e => {
					const w = readField(e, 'weight')
					return (w != null) ? (parseFloat(w) || 0) : null
				}).filter(v => v != null) : []
				const minEW = edgeWeights.length ? Math.min(...edgeWeights) : 1
				const maxEW = edgeWeights.length ? Math.max(...edgeWeights) : 1

				if (edgesLocal && Array.isArray(edgesLocal)) {
					let drawn = 0
					const unmatched = []
					edgesLocal.forEach((e, idx) => {
						// use readField to support nested .data.source/.data.target
						const srcVal = readField(e, 'from', 'source')
						const tgtVal = readField(e, 'to', 'target')
						if (!srcVal || !tgtVal) {
							// try alternative keys (some exports use source/target inside data)
						}
						const a = idToLatLng[String(srcVal)]
						const b = idToLatLng[String(tgtVal)]
						if (!a || !b) {
							unmatched.push({ edge: e, idx, src: srcVal, tgt: tgtVal })
							return
						}
						const dcolor = readField(e, 'color') || (e.data && e.data.color) || '#999'
						const w = readField(e, 'weight') != null ? parseFloat(readField(e, 'weight')) : 1
						const width = Math.max(1, mapRange(w, minEW, maxEW, 1, 6))
						const line = L.polyline([a, b], { color: String(dcolor), weight: width, opacity: 0.7 })
						line.addTo(map)
						drawn++
						// optional: bind a tooltip with relationship label if present
						const relLabel = readField(e, 'label') || readField(e, 'relationship') || ''
						if (relLabel) {
							const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2]
							const tooltip = L.tooltip({ permanent: false, direction: 'center', className: 'edge-label' })
							tooltip.setLatLng(mid).setContent(String(relLabel))
							map.addLayer(tooltip)
						}
					})
					if (unmatched.length) {
						console.info('Leaflet: edges present but endpoints missing geo coords or node ids. drawn=', drawn, 'unmatched=', unmatched.length)
						// print a few unmatched samples to help debugging
						console.info('Leaflet unmatched samples:', unmatched.slice(0,5))
					} else {
						console.info('Leaflet: drawn edges=', drawn)
					}
				}

				if (markers.length) {
					const group = L.featureGroup(markers)
					map.fitBounds(group.getBounds().pad(0.2))
				}
				}
	,maplibre: async function(el, nodesLocal, edgesLocal, cfg) {
					if (!el) return
					if (typeof maplibregl === 'undefined' && typeof maplibre === 'undefined') throw new Error('MapLibre not available')
					el.innerHTML = ''
					// Minimal MapLibre GL usage: create a map and add GeoJSON circle layers
					try {
						const container = document.createElement('div')
						container.style.width = '100%'
						container.style.height = '100%'
						el.appendChild(container)
						const MapLib = window.maplibregl || window.maplibre
						const map = new MapLib.Map({ container: container, style: 'https://demotiles.maplibre.org/style.json', center: [0,0], zoom: 2 })
						map.on('load', () => {
							const features = []
							nodesLocal.forEach(n => {
								const lat = parseCoord(readField(n, 'lat', 'latitude', 'y'))
								const lon = parseCoord(readField(n, 'lon', 'lng', 'longitude', 'x'))
								if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
									features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id: n.id || n._id || (n.data&&n.data.id), label: n.label||n.name||n.title } })
								}
							})
								// add a GeoJSON source with the features, then add a circle layer
								try {
									const geojson = { type: 'FeatureCollection', features: features }
									if (!map.getSource || !map.addSource) {
										// older maplibre builds may expose different API
										// fall back to not drawing if source API unavailable
									} else {
										map.addSource('nodes', { type: 'geojson', data: geojson })
										map.addLayer({ id: 'nodes-layer', type: 'circle', source: 'nodes', paint: { 'circle-radius': 6, 'circle-color': '#666' } })
									}
								} catch(e) { console.warn('maplibre plugin layer add failed', e) }
						})
					} catch(e) { console.warn('maplibre plugin failed', e) }
				}
	,cesium: async function(el, nodesLocal, edgesLocal, cfg) {
					if (!el) return
					if (typeof Cesium === 'undefined' && typeof CesiumJS === 'undefined') throw new Error('Cesium not available')
					el.innerHTML = ''
					try {
						const container = document.createElement('div')
						container.style.width = '100%'
						container.style.height = '100%'
						el.appendChild(container)
						const Ces = window.Cesium || window.CesiumJS
						// avoid Cesium Ion default-access-token warning in sandbox by setting a harmless default
						try { if (Ces && Ces.Ion && typeof Ces.Ion.defaultAccessToken !== 'undefined') {
								// leave token empty for sandbox; only call createWorldTerrain if token present
								if (!Ces.Ion.defaultAccessToken) {
									// no token: don't use Ion terrain provider
								}
							}
						} catch(e) {}
						// Set the base URL to ensure Cesium's Widgets/Assets resolve locally
						try { if (Ces && Ces.buildModuleUrl) Ces.buildModuleUrl('', LIB_BASE + '/') } catch(e) {}
						const terrainProvider = (Ces && Ces.Ion && Ces.Ion.defaultAccessToken) ? (Ces.createWorldTerrain ? Ces.createWorldTerrain() : undefined) : undefined
						const viewer = new Ces.Viewer(container, { terrainProvider })
						nodesLocal.forEach(n => {
							const lat = parseCoord(readField(n, 'lat', 'latitude', 'y'))
							const lon = parseCoord(readField(n, 'lon', 'lng', 'longitude', 'x'))
							if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
								viewer.entities.add({ position: Ces.Cartesian3.fromDegrees(lon, lat), point: { pixelSize: 8, color: Ces.Color.fromCssColorString(n.data && n.data.color ? String(n.data.color) : '#666') } })
							}
						})
					} catch(e) { console.warn('cesium plugin failed', e) }
				}
	,sigma: async function(el, nodesLocal, edgesLocal, cfg) {
				if (!el) return
				if (typeof sigma === 'undefined' && typeof window.sigma === 'undefined') throw new Error('sigma not available')
				el.innerHTML = ''
				try {
					const container = document.createElement('div')
					container.style.width = '100%'
					container.style.height = '100%'
					el.appendChild(container)
					const graph = { nodes: [], edges: [] }
					nodesLocal.forEach(n => { graph.nodes.push({ id: String(n.id||n._id||Math.random()), label: n.label||n.name||n.title, x: Math.random(), y: Math.random(), size: Math.max(1, parseFloat(readField(n,'weight')||4)), color: readField(n,'color')||'#666' }) })
					edgesLocal.forEach((e, idx) => { graph.edges.push({ id: String(e._id||idx), source: String(e.from||e.source||(e.data&&e.data.source)), target: String(e.to||e.target||(e.data&&e.data.target)), size: Math.max(1, parseFloat(readField(e,'weight')||1)), color: readField(e,'color')||'#999' }) })
					const Sigma = window.sigma || sigma
					try { new Sigma({ graph, container }) } catch(e) { console.warn('sigma render failed', e) }
				} catch(e){ console.warn('sigma plugin failed', e) }
			}
	,reagraph: async function(el, nodesLocal, edgesLocal, cfg) {
				if (!el) return
				if (typeof reagraph === 'undefined' && typeof window.reagraph === 'undefined') throw new Error('reagraph not available')
				el.innerHTML = ''
				try {
					const container = document.createElement('div')
					container.style.width = '100%'
					container.style.height = '100%'
					el.appendChild(container)
					const data = { nodes: nodesLocal.map(n => ({ id: String(n.id||n._id||Math.random()), ...((n.data&&n.data)||n) })), edges: edgesLocal.map(e => ({ id: String(e._id||Math.random()), source: e.from||e.source||(e.data&&e.data.source), target: e.to||e.target||(e.data&&e.data.target), weight: readField(e,'weight') })) }
					try { if (window.reagraph && window.reagraph.render) window.reagraph.render(container, data) } catch(e){ console.warn('reagraph render failed', e) }
				} catch(e){ console.warn('reagraph plugin failed', e) }
					}
			// other map plugins (maplibre, cesium) are intentionally not added here
		}

		// Network plugin implementations
		const networkPlugins = {
			cytoscape: async function(el, nodesLocal, edgesLocal, cfg) {
				if (!el) return
				if (typeof cytoscape === 'undefined') throw new Error('cytoscape not available')
