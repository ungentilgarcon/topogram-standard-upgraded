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
  // Reagraph is bundled locally with its peer dependencies via `lib/reagraph.umd.js`

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
  // options: { preferCdn: boolean }
  async function ensureGlobal(globalName, localFilename, cdnUrl, options = {}) {
    const preferCdn = !!options.preferCdn
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

  // Ensure a minimal process shim exists so UMD bundles referencing process.env don't crash in browsers
  function ensureProcessShim(){
    const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : undefined)
    if (!globalScope) return
    if (!globalScope.process) {
      globalScope.process = { env: { NODE_ENV: 'production' } }
      return
    }
    if (!globalScope.process.env) {
      globalScope.process.env = {}
    }
    if (typeof globalScope.process.env.NODE_ENV === 'undefined') {
      globalScope.process.env.NODE_ENV = 'production'
    }
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
      //const reagraphJsLocal = `${localBase}/reagraph.umd.js`


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
      // Reagraph standalone bundle (includes peer dependencies)
      promises.push((async () => {
        try {
          ensureProcessShim()
          const loaded = await ensureGlobal('reagraph', 'reagraph.umd.js')
          if (!loaded) console.warn('Reagraph bundle was not found locally; run the presentation-template build step.')
          return loaded
        } catch (e) {
          console.warn('Failed to load reagraph bundle', e)
          return false
        }
      })())

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
      // other map plugins (maplibre, cesium) are intentionally not added here
    }

    // Network plugin implementations
    const networkPlugins = {
      cytoscape: async function(el, nodesLocal, edgesLocal, cfg) {
        if (!el) return
        if (typeof cytoscape === 'undefined') throw new Error('cytoscape not available')

        // Convert nodes/edges into Cytoscape elements (support nested .data)
        const elements = []
        for (const n of nodesLocal) {
          const nid = (n.id != null) ? String(n.id) : (n._id != null ? String(n._id) : (n.data && n.data.id != null ? String(n.data.id) : String(Math.random())))
          const nodeData = Object.assign({ id: nid }, (n.data && typeof n.data === 'object') ? n.data : n)
          elements.push({ data: nodeData })
        }
        for (const e of edgesLocal) {
          const src = e.from || e.source || (e.data && e.data.source)
          const tgt = e.to || e.target || (e.data && e.data.target)
          const eid = e._id || (e.data && e.data._id) || `${src || 's'}-${tgt || 't'}`
          const label = (e.label || (e.data && e.data.label) || '')
          const data = { id: eid, source: src, target: tgt, label }
          elements.push({ data })
        }

        // Build style & label helpers from config (port of Topogram's Cytoscape rules)
        const netOpts = (cfg && cfg.networkOptions) || {}
        const labeling = (cfg && cfg.labeling) || {}

        // helper: simple numeric mapping (replacement for mapData used in main app)
        function mapRange(value, dmin, dmax, rmin, rmax) {
          const v = parseFloat(value)
          if (!Number.isFinite(v) || dmax === dmin) return (rmin + rmax) / 2
          const t = (v - dmin) / (dmax - dmin)
          return rmin + t * (rmax - rmin)
        }

        // compute min/max weights for nodes and edges
        const nodeWeights = elements.filter(el=>el.data && el.data.weight != null && el.data.group !== undefined).map(el=>parseFloat(el.data.weight)||0)
        const edgeWeights = elements.filter(el=>el.data && el.data.weight != null && (el.data.source || el.data.target)).map(el=>parseFloat(el.data.weight)||0)
        const minW = nodeWeights.length ? Math.min(...nodeWeights) : 1
        const maxW = nodeWeights.length ? Math.max(...nodeWeights) : 1
        const minEW = edgeWeights.length ? Math.min(...edgeWeights) : 1
        const maxEW = edgeWeights.length ? Math.max(...edgeWeights) : 1

        // emoji truncation (rough grapheme-aware via Array.from)
        function takeEmoji(str, max) {
          if (!str || typeof str !== 'string') return null
          const parts = Array.from(str)
          if (parts.length <= max) return str
          return parts.slice(0, max).join('')
        }

        // compute per-node _vizLabel and per-edge _relVizLabel
        const nodeLabelMode = (labeling && labeling.nodeLabelMode) || 'both'
        const edgeLabelMode = (labeling && labeling.edgeLabelMode) || 'both'
        const maxEmoji = (labeling && labeling.maxEmojiPerLabel) || 3

        elements.forEach(el => {
          if (!el.data) return
          // nodes
          if (!el.data.source && !el.data.target) {
            const d = el.data
            const name = d.label || d.name || d.title || ''
            const emoji = d.emoji || null
            let viz = ''
            if (nodeLabelMode === 'emoji') {
              viz = emoji ? takeEmoji(emoji, maxEmoji) : ''
            } else if (nodeLabelMode === 'name') {
              viz = String(name || '')
            } else { // both
              if (emoji && name) viz = `${takeEmoji(emoji, maxEmoji)} ${String(name)}`
              else viz = emoji ? takeEmoji(emoji, maxEmoji) : String(name || '')
            }
            d._vizLabel = viz
          } else {
            // edges
            const d = el.data
            const relText = d.label || d.relationship || d.name || ''
            const relEmoji = d.relationshipEmoji || d.emoji || null
            let relViz = ''
            if (edgeLabelMode === 'emoji') relViz = relEmoji ? takeEmoji(relEmoji, maxEmoji) : ''
            else if (edgeLabelMode === 'text') relViz = String(relText || '')
            else if (edgeLabelMode === 'none') relViz = ''
            else { // both
              if (relEmoji && relText) relViz = `${takeEmoji(relEmoji, maxEmoji)} ${String(relText)}`
              else relViz = relEmoji ? takeEmoji(relEmoji, maxEmoji) : String(relText || '')
            }
            d._relVizLabel = relViz
          }
        })

        // Base stylesheet (avoid mapData expressions — we'll set computed numeric styles per-element)
        const style = [
          { selector: 'node', style: { 'label': 'data(_vizLabel)', 'background-color': '#666', 'text-valign': 'center', 'color': '#fff', 'text-outline-width': 2, 'text-outline-color': '#000' } },
          { selector: 'node[emoji]', style: { 'label': 'data(emoji)', 'text-outline-width': 0 } },
          { selector: 'edge', style: { 'label': 'data(_relVizLabel)', 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'curve-style': 'bezier' } },
        ]

        // Initialize cytoscape
        el.innerHTML = ''
        const cy = cytoscape({ container: el, elements, style, layout: { name: 'preset' } })

        // Apply per-node visual mapping from config keys (sizes/colors/font)
        const nodeSizeField = netOpts.nodeSizeField
        const nodeColorField = netOpts.nodeColorField
        const showNodeEmoji = netOpts.showNodeEmoji
  // compute font-size mapping for node labels (use weight or default)
  const titleSize = (netOpts && netOpts.titleSize) || 12
        cy.nodes().forEach(node => {
          const data = node.data()
          // size mapping
          let size = null
          if (nodeSizeField && data[nodeSizeField] != null) {
            size = Math.max(4, parseFloat(data[nodeSizeField]) || 4)
          } else if (data.weight != null) {
            size = Math.max(4, mapRange(data.weight, minW, maxW, 12, 48))
          } else {
            size = 12
          }
          node.style('width', size)
          node.style('height', size)

          // color mapping
          if (nodeColorField && data[nodeColorField] != null) {
            node.style('background-color', String(data[nodeColorField]))
          } else if (data.color) {
            node.style('background-color', String(data.color))
          }

          // label / emoji
          if (showNodeEmoji && data.emoji) {
            node.data('label', takeEmoji(String(data.emoji), maxEmoji))
            // make emoji larger when node is big
            const fsz = Math.max(12, Math.round(mapRange(data.weight != null ? data.weight : (data[nodeSizeField]||0), minW, maxW, Math.max(16, titleSize), 48)))
            node.style('font-size', fsz)
          } else if (data._vizLabel != null) {
            node.data('label', String(data._vizLabel))
            const fsz = Math.max(10, Math.round(mapRange(data.weight != null ? data.weight : (data[nodeSizeField]||0), minW, maxW, titleSize, Math.max(titleSize, 24))))
            node.style('font-size', fsz)
          }
        })

        // Apply per-edge visual mapping
        // compute parallel edge groups (source-target normalized) to provide _parallelIndex/_parallelCount
        const groups = {}
        cy.edges().forEach(edge => {
          const d = edge.data()
          const a = String(d.source)
          const b = String(d.target)
          const key = a < b ? `${a}|${b}` : `${b}|${a}`
          groups[key] = groups[key] || []
          groups[key].push(edge)
        })

        // apply per-edge styles including control-point-step-size and text-margin-y
        Object.keys(groups).forEach(k => {
          const list = groups[k]
          const count = list.length
          list.forEach((edge, idx) => {
            const d = edge.data()
            const w = d.weight != null ? parseFloat(d.weight) : 1
            const width = Math.max(1, mapRange(w, minEW, maxEW, 1, 6))
            edge.style('width', width)
            if (d.color) edge.style('line-color', String(d.color))
            if (d.color) edge.style('target-arrow-color', String(d.color))
            if (d._relVizLabel != null) edge.data('label', String(d._relVizLabel))

            // compute control point step size and text margin based on parallel index
            const step = Math.round(mapRange(idx, 0, Math.max(1, count-1), 10, 40))
            const tmy = Math.round(mapRange(idx, 0, Math.max(1, count-1), -18, 18))
            try { edge.style('control-point-step-size', step) } catch(e) {}
            try { edge.style('text-margin-y', tmy) } catch(e) {}
          })
        })

        // run requested layout
        if (netOpts.initialLayout) {
          try { cy.layout({ name: netOpts.initialLayout }).run() } catch (e) { /* ignore */ }
        } else {
          try { cy.layout({ name: 'cose' }).run() } catch (e) { /* ignore */ }
        }
      },
      sigma: async function(el, nodesLocal, edgesLocal, cfg) {
        if (!el) return
        if (typeof sigma === 'undefined' && typeof window.sigma === 'undefined') throw new Error('sigma not available')
        el.innerHTML = ''
        try {
          const container = document.createElement('div')
          container.style.width = '100%'
          container.style.height = '100%'
          el.appendChild(container)
          const graph = { nodes: [], edges: [] }
          nodesLocal.forEach(n => {
            graph.nodes.push({
              id: String(n.id || n._id || Math.random()),
              label: n.label || n.name || n.title,
              x: Math.random(),
              y: Math.random(),
              size: Math.max(1, parseFloat(readField(n, 'weight') || 4)),
              color: readField(n, 'color') || '#666'
            })
          })
          edgesLocal.forEach((e, idx) => {
            graph.edges.push({
              id: String(e._id || idx),
              source: String(e.from || e.source || (e.data && e.data.source)),
              target: String(e.to || e.target || (e.data && e.data.target)),
              size: Math.max(1, parseFloat(readField(e, 'weight') || 1)),
              color: readField(e, 'color') || '#999'
            })
          })
          const Sigma = window.sigma || sigma
          try { new Sigma({ graph, container }) } catch (e) { console.warn('sigma render failed', e) }
        } catch (e) { console.warn('sigma plugin failed', e) }
      },
      reagraph: async function(el, nodesLocal, edgesLocal, cfg) {
        if (!el) return
        if (typeof reagraph === 'undefined' && typeof window.reagraph === 'undefined') throw new Error('reagraph not available')
        el.innerHTML = ''
        try {
          const container = document.createElement('div')
          container.style.width = '100%'
          container.style.height = '100%'
          el.appendChild(container)
          const data = {
            nodes: nodesLocal.map(n => ({ id: String(n.id || n._id || Math.random()), ...((n.data && n.data) || n) })),
            edges: edgesLocal.map(e => ({
              id: String(e._id || Math.random()),
              source: e.from || e.source || (e.data && e.data.source),
              target: e.to || e.target || (e.data && e.data.target),
              weight: readField(e, 'weight')
            }))
          }
          try { if (window.reagraph && window.reagraph.render) window.reagraph.render(container, data) } catch (e) { console.warn('reagraph render failed', e) }
        } catch (e) { console.warn('reagraph plugin failed', e) }
      }
    }

    // Allow query-params to override renderer choices for quick sandbox testing
    // e.g. ?network=sigma&geomap=leaflet
    function getQueryParam(name) {
      try {
        const params = new URLSearchParams(window.location.search)
        return params.get(name)
      } catch (e) { return null }
    }

    const qpNetwork = getQueryParam('network') || getQueryParam('net') || null
    const qpGeo = getQueryParam('geomap') || getQueryParam('map') || getQueryParam('mapRenderer') || null

    // Determine which plugins to use (allow explicit config override and query params)
    const mapRenderer = (qpGeo) || (config && config.mapRenderer) || (hasGeo ? 'leaflet' : null)
    const networkRenderer = (qpNetwork) || (config && config.networkRenderer) || 'cytoscape'

      // Initialize map plugin (if any) and ensure required globals
    if (mapRenderer) {
      const plugin = mapPlugins[mapRenderer]
      if (plugin) {
        try {
          // attempt to ensure Leaflet global when using leaflet
          if (mapRenderer === 'leaflet') {
            await ensureGlobal('L', 'leaflet.js', (CDNS.leaflet && CDNS.leaflet.js) || null)
          } else if (mapRenderer === 'maplibre') {
            // maplibre exposes maplibregl or maplibre
            await ensureGlobal('maplibregl', 'maplibre-gl.js', (CDNS.maplibre && CDNS.maplibre.js) || null)
            await ensureGlobal('maplibre', 'maplibre-gl.js', (CDNS.maplibre && CDNS.maplibre.js) || null)
          } else if (mapRenderer === 'cesium') {
            // Ensure Cesium loads its Widgets/Assets from the local lib path
            try { window.CESIUM_BASE_URL = LIB_BASE + '/' } catch(e) {}
            await ensureGlobal('Cesium', 'cesium.js', (CDNS.cesium && CDNS.cesium.js) || null)
          }
          await plugin(mapEl, nodes, edges, config)
        } catch (e) {
          console.warn('Map plugin failed', e)
          if (mapEl) mapEl.innerText = 'Map failed to initialize.'
        }
      } else {
        if (mapEl) mapEl.innerText = `Map renderer '${mapRenderer}' not available.`
      }
    } else {
      if (mapEl) mapEl.innerText = 'No geo coordinates found or map renderer not configured.'
    }

    // Initialize network plugin
    const netPlugin = networkPlugins[networkRenderer]
    if (netPlugin) {
      try {
        // ensure cytoscape is loaded when chosen
        if (networkRenderer === 'cytoscape') {
          const ok = await ensureGlobal('cytoscape', 'cytoscape.min.js', (CDNS.cytoscape && CDNS.cytoscape.js) || null)
          if (!ok) throw new Error('cytoscape not available')
        }
        if (networkRenderer === 'sigma') {
          // try local sigma or CDN
          const ok = await ensureGlobal('sigma', 'sigma.min.js', (CDNS.sigma && CDNS.sigma.js) || null)
          if (!ok && typeof window.sigma === 'undefined') throw new Error('sigma not available')
        }
        if (networkRenderer === 'reagraph') {
          const ok = await ensureGlobal('reagraph', 'reagraph.umd.js')
          if (!ok || typeof window.reagraph === 'undefined') throw new Error('reagraph standalone bundle not available')
        }
        await netPlugin(netEl, nodes, edges, config)
      } catch (e) {
        console.warn('Network plugin failed', e)
        if (netEl) netEl.innerText = 'Network failed to initialize.'
      }
    } else {
      if (netEl) netEl.innerText = `Network renderer '${networkRenderer}' not available.`
    }
  }

  // Run loader: load libs, fetch config and data, then init
  tryLoadAll()
    .catch(err => {
      // libs failed to load; still attempt to fetch data and init gracefully
      console.warn('Some libraries failed to load from CDN:', err)
    })
    .then(()=> Promise.all([
      fetch('config.json').then(r=>r.ok? r.json().catch(()=>null) : null).catch(()=>null),
      fetch('data/topogram.json').then(r=>r.ok? r.json().catch(()=>null) : null).catch(()=>null)
    ]))
    .then(([cfg, data])=>{
      if (!data){
        showError('Failed to load data/topogram.json')
        return
      }
      // Data may be wrapped or flat; prefer top-level nodes/edges
      const payload = data.nodes || data.edges ? data : (data.topogram ? data.topogram : data)
      initMapAndNetwork(payload, cfg || {})
    })
    .catch(err => {
      console.error('Loader error', err)
      showError('An unexpected error occurred while loading the presentation.')
    })
})();
