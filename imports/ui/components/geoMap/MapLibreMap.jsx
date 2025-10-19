import React from 'react'
import PropTypes from 'prop-types'

// Minimal MapLibre adapter. Uses dynamic require so the app doesn't hard-fail
// when maplibre isn't installed. If maplibre is present, create a basic map
// and place simple DOM markers for nodes. This is intentionally lightweight —
// a later iteration can add deck.gl overlays and advanced picking.

export default class MapLibreMap extends React.Component {
  constructor(props) {
    super(props)
    this.map = null
    this.container = React.createRef()
    this._markers = []
    // nonce to make image names unique per update (avoids sprite/name collisions)
    this._emojiNonce = 0
    // store canvases by image name so we can re-register them if style reloads
    this._registeredEmojiImages = new Map()
  }

  // Return an emoji-like string for a node if present in known fields
  _getNodeEmoji(n) {
    try {
      if (!n) return null
      const d = n.data || {}
      if (d.emoji) return String(d.emoji)
      if (d.em) return String(d.em)
      if (d.icon) return String(d.icon)
      // fallback: sometimes a small _vizLabel contains the emoji
      if (d._vizLabel && typeof d._vizLabel === 'string') {
        const s = String(d._vizLabel).trim()
        if (s && s.length <= 4 && /[^a-zA-Z0-9 ]/.test(s)) return s
      }
    } catch (e) {}
    return null
  }

  // Render an emoji into a PNG data URL for use as an <img> marker.
  _emojiToDataUrl(emoji, sizePx = 64, color = '#111') {
    try {
      const cvs = document.createElement('canvas')
      cvs.width = sizePx; cvs.height = sizePx
      const ctx = cvs.getContext && cvs.getContext('2d')
      if (!ctx) return null
      // clear
      ctx.clearRect(0,0,sizePx,sizePx)
      // draw a subtle white halo by stroking text
      const fontPx = Math.round(sizePx * 0.7)
      ctx.font = `${fontPx}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(4, Math.round(fontPx / 8))
      ctx.strokeStyle = '#ffffff'
      try { ctx.strokeText(emoji, sizePx/2, sizePx/2) } catch (e) {}
      ctx.fillStyle = color || '#111'
      try { ctx.fillText(emoji, sizePx/2, sizePx/2) } catch (e) {}
      return cvs.toDataURL('image/png')
    } catch (e) { return null }
  }

  // Return a canvas with the emoji drawn; useful to get ImageData synchronously
  _emojiCanvas(emoji, sizePx = 64, color = '#111') {
    try {
      const cvs = document.createElement('canvas')
      cvs.width = sizePx; cvs.height = sizePx
      const ctx = cvs.getContext && cvs.getContext('2d')
      if (!ctx) return null
      ctx.clearRect(0,0,sizePx,sizePx)
      const fontPx = Math.round(sizePx * 0.7)
      ctx.font = `${fontPx}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(4, Math.round(fontPx / 8))
      ctx.strokeStyle = '#ffffff'
      try { ctx.strokeText(emoji, sizePx/2, sizePx/2) } catch (e) {}
      ctx.fillStyle = color || '#111'
      try { ctx.fillText(emoji, sizePx/2, sizePx/2) } catch (e) {}
      return cvs
    } catch (e) { return null }
  }

  // Try to register a canvas as a MapLibre image using several fallbacks.
  // Returns a Promise resolving to the final registered image name, or null.
  _registerCanvasAsImage(nameBase, cvs) {
    return new Promise((resolve) => {
      try {
        if (!this.map || !cvs) return resolve(null)
        // assign a nonce for uniqueness
        this._emojiNonce = (this._emojiNonce || 0) + 1
        const uniqueName = `${nameBase}~${this._emojiNonce}`
        const setRegistered = (registeredName) => {
          try { this._registeredEmojiImages.set(registeredName, cvs) } catch (e) {}
          resolve(registeredName)
        }
        // helper to test hasImage after add
        const testAndResolve = (n) => {
          try {
            if (this.map.hasImage && this.map.hasImage(n)) return setRegistered(n)
          } catch (e) {}
          resolve(null)
        }
        // Strategy 1: create ImageBitmap then add
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(cvs).then((bm) => {
            try {
              this.map.addImage(uniqueName, bm)
            } catch (err) {
              // ignore; try next method
            }
            testAndResolve(uniqueName)
          }).catch(() => {
            // fallback to canvas addImage
            try {
              this.map.addImage(uniqueName, cvs, { pixelRatio: 1 })
            } catch (err) {}
            testAndResolve(uniqueName)
          })
          return
        }
        // Strategy 2: try canvas directly
        try {
          this.map.addImage(uniqueName, cvs, { pixelRatio: 1 })
        } catch (err) {
          // fall through to Image fallback
        }
        if (this.map.hasImage && this.map.hasImage(uniqueName)) return setRegistered(uniqueName)
        // Strategy 3: Image fallback from dataURL
        try {
          const dataUrl = cvs.toDataURL('image/png')
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            try { this.map.addImage(uniqueName, img) } catch (err) {}
            testAndResolve(uniqueName)
          }
          img.onerror = () => { resolve(null) }
          img.src = dataUrl
        } catch (e) { resolve(null) }
      } catch (e) { resolve(null) }
    })
  }

  componentDidMount() {
    // Dynamic import avoids bundling ESM-only modules into Meteor's client
    // bootstrap which can introduce `import.meta` into the bundle. Only
    // attempt to load on the client at runtime.
    if (typeof window === 'undefined') return
    import('maplibre-gl').then((mod) => {
      try {
        const maplibregl = (mod && (mod.default || mod))
        this._maplibregl = maplibregl
        const el = this.container.current
        this.map = new maplibregl.Map({
          container: el,
          style: this.props.style || 'https://demotiles.maplibre.org/style.json',
          center: this.props.center || [0, 0],
          zoom: typeof this.props.zoom === 'number' ? this.props.zoom : 2
        })
        // create simple status badge for runtime debugging
        try {
          this._statusEl = document.createElement('div')
          this._statusEl.setAttribute('data-maplibre-status', '1')
          this._statusEl.style.position = 'absolute'
          this._statusEl.style.right = '8px'
          this._statusEl.style.top = '8px'
          this._statusEl.style.background = 'rgba(0,0,0,0.6)'
          this._statusEl.style.color = '#fff'
          this._statusEl.style.padding = '4px 8px'
          this._statusEl.style.borderRadius = '4px'
          this._statusEl.style.zIndex = '1100'
          this._statusEl.style.fontSize = '12px'
          this._statusEl.innerText = 'MapLibre: init'
          try { if (this.container && this.container.current) this.container.current.appendChild(this._statusEl) } catch (e) {}
          // inject a small stylesheet for emoji marker positioning so img markers
          // render above map tiles and are centered correctly
          try {
            if (!document.querySelector('style[data-maplibre-emoji-css]')) {
              const s = document.createElement('style')
              s.setAttribute('data-maplibre-emoji-css', '1')
              s.innerHTML = `
                .maplibre-emoji-marker { position: relative; display: inline-block; }
                .maplibre-emoji-marker img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2000; pointer-events: auto; }
              `
              try { document.head.appendChild(s) } catch (e) { document.body.appendChild(s) }
            }
          } catch (e) {}
        } catch (e) {}
        this.map.on('load', () => { this._renderMarkers(); this._updateNodesLayer(); this._updateEdgesLayer(); try { if (this._statusEl) this._statusEl.innerText = 'MapLibre: loaded' } catch (e) {} })
        // re-register our generated canvas images if the style reloads and clears images
        this._styleDataHandler = () => {
          try {
            if (!this.map || !this._registeredEmojiImages) return
            this._registeredEmojiImages.forEach((cvs, name) => {
              try {
                if (this.map.hasImage && this.map.hasImage(name)) return
                try {
                  // prefer ImageBitmap where available
                  if (typeof createImageBitmap === 'function') {
                    createImageBitmap(cvs).then((bm) => {
                      try { this.map.addImage(name, bm) } catch (ee) { console.warn('MapLibreMap: re-addImage(bitmap) failed', name, ee) }
                    }).catch((ee) => {
                      try { this.map.addImage(name, cvs, { pixelRatio: 1 }) } catch (e2) { console.warn('MapLibreMap: re-addImage(canvas) failed', name, e2) }
                    })
                  } else {
                    try { this.map.addImage(name, cvs, { pixelRatio: 1 }) } catch (ee) { console.warn('MapLibreMap: re-addImage failed', name, ee) }
                  }
                } catch (ee) { console.warn('MapLibreMap: re-addImage error', name, ee) }
              } catch (e) {}
            })
          } catch (e) {}
        }
        // re-register a specific missing image when style requests it
        this._styleImageMissingHandler = (ev) => {
          try {
            const name = ev && ev.id
            if (!name) return
            // try exact match first
            let cvs = (this._registeredEmojiImages && this._registeredEmojiImages.get(name)) || null
            // if not found, try to locate a stored canvas whose registered key
            // contains the requested base name (we register with a nonce suffix)
            if (!cvs && this._registeredEmojiImages) {
              try {
                for (const [k, v] of this._registeredEmojiImages.entries()) {
                  if (String(k).indexOf(name) === 0 || String(k).indexOf(name) > 0) { cvs = v; break }
                }
              } catch (ee) {}
            }
            if (!cvs) return
            try {
              if (typeof createImageBitmap === 'function') {
                createImageBitmap(cvs).then((bm) => { try { this.map.addImage(name, bm) } catch (err) { console.warn('MapLibreMap: addImage on styleimagemissing failed (bitmap)', name, err) } })
              } else {
                try { this.map.addImage(name, cvs, { pixelRatio: 1 }) } catch (err) { console.warn('MapLibreMap: addImage on styleimagemissing failed', name, err) }
              }
            } catch (err) { console.warn('MapLibreMap: styleimagemissing re-add failed', name, err) }
          } catch (e) {}
        }
        try { this.map.on && this.map.on('styleimagemissing', this._styleImageMissingHandler) } catch (e) {}
        try { this.map.on && this.map.on('styledata', this._styleDataHandler) } catch (e) {}
        this.map.on('error', (err) => { console.warn('MapLibreMap: map error', err); try { if (this._statusEl) this._statusEl.innerText = 'MapLibre: error' } catch (e) {} })
      } catch (err) { console.warn('MapLibreMap: init error', err) }
    }).catch((err) => {
      // module not present or failed to load
      console.warn('MapLibreMap: dynamic import failed', err)
      // Try CDN UMD fallback: load maplibre-gl UMD and a default CSS if available
      this._loadMapLibreFromCdn().then((maplibregl) => {
        this._maplibregl = maplibregl || (typeof window !== 'undefined' ? window.maplibregl : null)
        try {
          const el = this.container.current
          this.map = new this._maplibregl.Map({ container: el, style: this.props.style || 'https://demotiles.maplibre.org/style.json', center: this.props.center || [0,0], zoom: typeof this.props.zoom === 'number' ? this.props.zoom : 2 })
          try { this._statusEl = document.createElement('div'); this._statusEl.setAttribute('data-maplibre-status','1'); this._statusEl.style.position='absolute'; this._statusEl.style.right='8px'; this._statusEl.style.top='8px'; this._statusEl.style.background='rgba(0,0,0,0.6)'; this._statusEl.style.color='#fff'; this._statusEl.style.padding='4px 8px'; this._statusEl.style.borderRadius='4px'; this._statusEl.style.zIndex='1100'; this._statusEl.style.fontSize='12px'; this._statusEl.innerText='MapLibre: init'; try{ if(this.container&&this.container.current) this.container.current.appendChild(this._statusEl)}catch(e){} } catch(e){}
          this.map.on('load', () => { this._renderMarkers(); this._updateNodesLayer(); this._updateEdgesLayer(); try { if (this._statusEl) this._statusEl.innerText = 'MapLibre: loaded' } catch (e) {} })
          this.map.on('error', (err) => { console.warn('MapLibreMap: map error', err); try { if (this._statusEl) this._statusEl.innerText = 'MapLibre: error' } catch (e) {} })
        } catch (e) { console.warn('MapLibreMap: init after CDN load failed', e) }
      }).catch((e) => { console.warn('MapLibreMap: CDN fallback failed', e) })
    })
  }

  _loadMapLibreFromCdn() {
    return new Promise((resolve, reject) => {
      try {
        if (typeof window === 'undefined') return reject(new Error('no-window'))
        if (window.maplibregl) return resolve(window.maplibregl)
        const cssHref = 'https://unpkg.com/maplibre-gl/dist/maplibre-gl.css'
        if (!document.querySelector('link[data-maplibre-cdn]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'; link.href = cssHref; link.setAttribute('data-maplibre-cdn', '1'); document.head.appendChild(link)
        }
        if (document.querySelector('script[data-maplibre-cdn]')) {
          const waitFor = () => { if (window.maplibregl) resolve(window.maplibregl); else setTimeout(waitFor, 200) }
          waitFor(); return
        }
        const s = document.createElement('script')
        s.src = 'https://unpkg.com/maplibre-gl/dist/maplibre-gl.js'
        s.async = true; s.setAttribute('data-maplibre-cdn', '1')
        s.onload = () => { if (window.maplibregl) resolve(window.maplibregl); else reject(new Error('maplibre loaded but window.maplibregl missing')) }
        s.onerror = () => reject(new Error('maplibre script load failed'))
        document.body.appendChild(s)
      } catch (e) { reject(e) }
    })
  }

  componentDidUpdate(prevProps) {
    // re-render markers when nodes/edges change
    if (this.props.nodes !== prevProps.nodes || this.props.edges !== prevProps.edges) {
      this._clearMarkers(); this._renderMarkers(); this._updateNodesLayer(); this._updateEdgesLayer()
    }
  }

  componentWillUnmount() {
    this._clearMarkers()
    try {
      if (this.map) {
        try { if (this.map.getLayer && this.map.getLayer('geo-edges-line')) this.map.removeLayer('geo-edges-line') } catch (e) {}
        try { if (this.map.getSource && this.map.getSource('geo-edges')) this.map.removeSource('geo-edges') } catch (e) {}
        try { if (this.map.getLayer && this.map.getLayer('geo-nodes-circle')) this.map.removeLayer('geo-nodes-circle') } catch (e) {}
        try { if (this.map.getSource && this.map.getSource('geo-nodes')) this.map.removeSource('geo-nodes') } catch (e) {}
        try { if (this.map.remove) this.map.remove() } catch (e) {}
      }
    } catch (e) {}
    try {
      if (this.map && this._styleDataHandler) {
        try { this.map.off && this.map.off('styledata', this._styleDataHandler) } catch (e) {}
        this._styleDataHandler = null
      }
    } catch (e) {}
    try { if (this._registeredEmojiImages && this._registeredEmojiImages.clear) this._registeredEmojiImages.clear() } catch (e) {}
  }

  _clearMarkers() {
    try { this._markers.forEach(m => { try { m.remove() } catch (e) {} }) } catch (e) {}
    this._markers = []
  }

  _renderMarkers() {
  if (!this.map) return
  const maplibregl = this._maplibregl || (typeof window !== 'undefined' ? (window.maplibregl || null) : null)
    const { nodes } = this.props
    try {
      (nodes || []).forEach((n, i) => {
        try {
          const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
          const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
          if (!isFinite(lat) || !isFinite(lng)) return
          const el = document.createElement('div')
          // compute visual radius like Leaflet GeoNodes
          const visualRadius = (n && n.data && n.data.weight) ? ((n.data.weight > 100) ? 167 : (n.data.weight * 5)) : 3
          const hitRadius = Math.max(visualRadius, 10)
          // Emoji handling: detect emoji via helper and force-show when present
          const nodeEmoji = this._getNodeEmoji(n)
          const emojiEnabled = nodeEmoji ? true : ((this.props.ui && typeof this.props.ui.emojiVisible !== 'undefined') ? !!this.props.ui.emojiVisible : true)
          const hasEmoji = emojiEnabled && !!nodeEmoji
          // Skip creating DOM markers for emoji nodes — MapLibre symbol layer
          // will render them more reliably. We still keep them in the nodes
          // array so _updateNodesLayer can create a symbol source.
          if (hasEmoji) {
            // still add a lightweight placeholder for counting, but skip DOM Marker
            const marker = { __emojiPlaceholder: true }
            this._markers.push(marker)
            return
          }

          // size the DOM marker to match Leaflet visual radius (radius->pixels)
          const sizePx = Math.max(2, Math.round(visualRadius * 2))
          el.style.width = `${sizePx}px`
          el.style.height = `${sizePx}px`
          el.style.borderRadius = '50%'
          // accept color from various shapes used across adapters
          const rawColor = (n && n.data && n.data.color) || (n && n.attrs && n.attrs.color) || (n && n.color) || '#1f2937'
          el.style.background = rawColor
          el.style.border = '1px solid #fff'
          el.style.boxSizing = 'border-box'
          el.style.cursor = 'pointer'
          el.title = (n && n.data && (n.data._vizLabel || n.data.label || '')) || ''
          el.addEventListener('click', (ev) => {
            ev.stopPropagation(); try { this.props.handleClickGeoElement && this.props.handleClickGeoElement({ group: 'node', el: n }) } catch (e) {}
          })
          const marker = new maplibregl.Marker(el).setLngLat([lng, lat]).addTo(this.map)
          this._markers.push(marker)
          // After adding, ensure the actual element used by MapLibre is styled
          try {
            const actual = marker && marker.getElement && marker.getElement()
            if (actual) {
              // ensure it's absolutely positioned and on top
              actual.style.position = actual.style.position || 'absolute'
              actual.style.zIndex = '9999'
              actual.style.pointerEvents = 'auto'
              // if we inserted an <img> inside, make sure it is absolutely centered and above
              try {
                const img = actual.querySelector && actual.querySelector('img.maplibre-emoji-marker')
                if (img) {
                  img.style.position = 'absolute'
                  img.style.left = '50%'
                  img.style.top = '50%'
                  img.style.transform = 'translate(-50%, -50%)'
                  img.style.zIndex = '10000'
                  img.style.display = 'block'
                }
              } catch (e) {}
              // debug: log presence
              try {
                const hasImg = !!(actual.querySelector && actual.querySelector('img.maplibre-emoji-marker'))
                const hasAttr = !!(actual.getAttribute && actual.getAttribute('data-emoji-marker'))
                const text = (actual.innerText || actual.textContent || '').trim()
                console.info('MapLibreMap: marker element after add', { hasImg, hasAttr, text })
              } catch (e) {}
            }
          } catch (e) {}
        } catch (e) {}
      })
      try {
        // count how many markers contained emoji vs plain circles. Prefer
        // checking for our img marker element; fallback to attribute/text.
        const emojiCount = this._markers.filter(m => {
          try {
            const el = m && m.getElement && m.getElement()
            if (!el) return false
            // check descendants for our emoji img
            if (el.querySelector && el.querySelector('img.maplibre-emoji-marker')) return true
            if (el.getAttribute && el.getAttribute('data-emoji-marker')) return true
            const text = (el.innerText || el.textContent || '')
            return String(text).trim().length > 0
          } catch (e) { return false }
        }).length
        console.info('MapLibreMap: markers created', this._markers.length, 'emoji:', emojiCount)
        if (this._statusEl) {
          this._statusEl.innerText = `MapLibre: loaded • nodes:${this._markers.length} emoji:${emojiCount}`
          try { this._statusEl._emojiCount = emojiCount } catch (e) {}
        }
        // debug: list first 10 nodes with emoji candidate values
        try {
          const candidates = (this.props.nodes || []).map((nd, idx) => ({ idx, emoji: this._getNodeEmoji(nd) })).filter(x => x.emoji).slice(0,10)
          if (candidates && candidates.length) console.info('MapLibreMap: sample emoji nodes', candidates)
        } catch (e) {}
      } catch (e) {}
    } catch (e) { console.warn('MapLibreMap: marker render failed', e) }
  }

      _updateEdgesLayer() {
        try {
          if (!this.map) return
          const edges = this.props.edges || []
          const features = (edges || []).map((e, i) => {
            if (!e || !e.coords || e.coords.length !== 2) return null
            const [[lat1, lng1], [lat2, lng2]] = e.coords
            const a1 = Number(lat1); const o1 = Number(lng1); const a2 = Number(lat2); const o2 = Number(lng2)
            if (!isFinite(a1) || !isFinite(o1) || !isFinite(a2) || !isFinite(o2)) return null
            return {
              type: 'Feature',
              properties: { color: (e && e.data && e.data.color) || '#9f7aea', weight: (e && e.data && e.data.weight) || 2 },
              geometry: { type: 'LineString', coordinates: [ [o1, a1], [o2, a2] ] }
            }
          }).filter(Boolean)
          const geo = { type: 'FeatureCollection', features }
          // Add or update source
          if (this.map.getSource && this.map.getSource('geo-edges')) {
            try { this.map.getSource('geo-edges').setData(geo) } catch (e) {}
          } else {
            try {
              this.map.addSource('geo-edges', { type: 'geojson', data: geo })
              this.map.addLayer({
                id: 'geo-edges-line',
                type: 'line',
                source: 'geo-edges',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'weight'], 'line-opacity': 0.9 }
              })
            } catch (e) { console.warn('MapLibreMap: add layer failed', e) }
          }
          try { console.info('MapLibreMap: edges features', features.length); if (this._statusEl) this._statusEl.innerText = `MapLibre: loaded • nodes:${this._markers.length} edges:${features.length} emoji:${(this._statusEl && this._statusEl._emojiCount) || 0}` } catch (e) {}

          // Build and add/update edge relationship labels (midpoint symbols) only when UI allows
          try {
            const geoRelVisible = !this.props.ui || typeof this.props.ui.geoEdgeRelVisible === 'undefined' ? true : !!this.props.ui.geoEdgeRelVisible
            if (geoRelVisible) {
              // bucket edges by canonical endpoint key so labels on identical
              // routes can be stacked rather than rendered on top of each other
              const edgesList = (this.props.edges || [])
              const buckets = new Map()
              const canonicalKey = (e) => {
                if (!e || !e.coords || e.coords.length !== 2) return ''
                const [[la1, lo1], [la2, lo2]] = e.coords
                const a1 = Number(la1); const o1 = Number(lo1); const a2 = Number(la2); const o2 = Number(lo2)
                if (!isFinite(a1) || !isFinite(o1) || !isFinite(a2) || !isFinite(o2)) return ''
                // canonicalize ordering so AB and BA map to same key
                const k1 = `${a1},${o1}`
                const k2 = `${a2},${o2}`
                return (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`
              }
              edgesList.forEach((e, idx) => {
                const k = canonicalKey(e)
                if (!k) return
                if (!buckets.has(k)) buckets.set(k, [])
                buckets.get(k).push(idx)
              })
              const labelFeatures = []
              const emojiLabelFeatures = []
              edgesList.forEach((e, i) => {
              if (!e || !e.coords || e.coords.length !== 2) return null
              const [[lat1, lng1], [lat2, lng2]] = e.coords
              const a1 = Number(lat1); const o1 = Number(lng1); const a2 = Number(lat2); const o2 = Number(lng2)
              if (!isFinite(a1) || !isFinite(o1) || !isFinite(a2) || !isFinite(o2)) return null
              const relTextRaw = e && e.data ? (e.data.relationship || e.data.name || '') : ''
              const relEmojiRaw = e && e.data ? (e.data.relationshipEmoji || '') : ''
              const edgeMode = !this.props.ui || typeof this.props.ui.edgeRelLabelMode === 'undefined' ? 'text' : String(this.props.ui.edgeRelLabelMode)
              let relLabel = ''
              if (edgeMode === 'emoji') relLabel = relEmojiRaw ? String(relEmojiRaw) : String(relTextRaw || '')
              else if (edgeMode === 'text') relLabel = String(relTextRaw || '')
              else if (edgeMode === 'none') relLabel = ''
              else relLabel = relEmojiRaw ? `${String(relEmojiRaw)} ${String(relTextRaw || '')}` : String(relTextRaw || '')
              // Build both text and emoji features depending on mode
              const midLat = (a1 + a2) / 2
              let midLng = (o1 + o2) / 2
              if (midLng > 180) midLng = ((midLng + 180) % 360) - 180
              if (midLng < -180) midLng = ((midLng - 180) % 360) + 180
              // compute slot index for this edge in its bucket
              const k = canonicalKey(e)
              const slotIdx = (buckets.has(k) ? buckets.get(k).indexOf(i) : -1)
              // vertical offset per slot (in ems for MapLibre's text-offset)
              const offsetY = slotIdx >= 0 ? (slotIdx * 0.9) : 0
              // Create text and/or emoji features depending on mode. For 'both'
              // create a single combined feature where the icon is placed before
              // the text (icon to the left, text to the right) so they appear
              // side-by-side instead of overlapping.
                if (edgeMode === 'both' && relEmojiRaw) {
                // smaller icon-size so emoji doesn't dominate (reduced)
                const size = 0.35
                // use a fixed canvas size (power-of-two) for images to avoid mismatches
                const computedEdgeSizePx = 64
                // icon offset (x,y) in pixels: move left ~ half icon width
                const iconOffsetPx = [-Math.round(computedEdgeSizePx / 2), offsetY * 12]
                // text offset in ems: move right to make room for icon
                const textOffset = [0.9, offsetY]
                const edgeIconName = `edge-emoji-${i}@${computedEdgeSizePx}`
                // store the emoji separately so registration uses the emoji char (not the text label)
                // set the text label to the textual relationship only (don't place the emoji in the text-field)
                labelFeatures.push({ type: 'Feature', properties: { label: String(relTextRaw || ''), _emoji: String(relEmojiRaw), id: i, offset: textOffset, icon: edgeIconName, size, iconOffsetPx, _sizePx: computedEdgeSizePx }, geometry: { type: 'Point', coordinates: [midLng, midLat] } })
              } else {
                // text-only or emoji-as-text fallback
                if (edgeMode === 'text' || (edgeMode === 'emoji' && !relEmojiRaw) || (edgeMode === 'both' && !relEmojiRaw)) {
                  if (relLabel && String(relLabel).trim() !== '') {
                    labelFeatures.push({ type: 'Feature', properties: { label: String(relLabel), id: i, offset: [0, offsetY] }, geometry: { type: 'Point', coordinates: [midLng, midLat] } })
                  }
                }
                // emoji-only mode: separate emoji feature (icon only)
                if ((edgeMode === 'emoji' || edgeMode === 'both') && relEmojiRaw && edgeMode === 'emoji') {
                  const size = 0.8
                  const computedEdgeSizePx = 64
                  const offsetPx = [0, offsetY * 12]
                  const edgeIconName = `edge-emoji-${i}@${computedEdgeSizePx}`
                  emojiLabelFeatures.push({ type: 'Feature', properties: { label: String(relEmojiRaw), id: i, icon: edgeIconName, size, offsetPx, _sizePx: computedEdgeSizePx }, geometry: { type: 'Point', coordinates: [midLng, midLat] } })
                }
              }
              return null
            })
            const labelFeaturesFinal = labelFeatures.filter(Boolean)
            const emojiFeatures = emojiLabelFeatures.filter(Boolean)
            const labelsGeo = { type: 'FeatureCollection', features: labelFeaturesFinal }
              // Build list of features that reference icons (either combined label features
              // or emoji-only features). Register those canvases BEFORE adding the labels layer
              try {
                const iconFeatures = []
                try {
                  // features in labelFeaturesFinal that contain an icon (combined 'both' case)
                  (labelFeaturesFinal || []).forEach((f) => { if (f && f.properties && f.properties.icon) iconFeatures.push(f) })
                } catch (e) {}
                try { (emojiFeatures || []).forEach((f) => { if (f) iconFeatures.push(f) }) } catch (e) {}
                try { console.info('MapLibreMap: edge iconFeatures', iconFeatures.map(f => (f && f.properties && f.properties.icon) || f)) } catch (e) {}
                const edgeImagePromises = (iconFeatures || []).map((f) => {
                  try {
                    const name = f.properties && f.properties.icon
                    // prefer an explicit emoji char stored in _emoji when present
                    const emoji = (f.properties && (f.properties._emoji || f.properties.label)) || ''
                    const sizePx = (f.properties && f.properties._sizePx) || 64
                    const cvs = this._emojiCanvas(emoji, sizePx)
                    if (!cvs || !this.map) return Promise.resolve(null)
                    return this._registerCanvasAsImage(name, cvs).then((registeredName) => {
                      if (registeredName && f && f.properties) f.properties.icon = registeredName
                      return registeredName
                    }).catch(() => null)
                  } catch (e) { console.warn('MapLibreMap: edge emoji registration error', e); return Promise.resolve(null) }
                })
                Promise.all(edgeImagePromises).then((results) => {
                  try {
                    if (this.map.getSource && this.map.getSource('geo-edge-labels')) {
                      try { this.map.getSource('geo-edge-labels').setData(labelsGeo) } catch (e) {}
                    } else {
                      try {
                        this.map.addSource('geo-edge-labels', { type: 'geojson', data: labelsGeo })
                        this.map.addLayer({
                          id: 'geo-edge-labels-symbol',
                          type: 'symbol',
                          source: 'geo-edge-labels',
                          layout: {
                            // render icon (if present) and text in the same layer so
                            // they appear side-by-side rather than stacked
                            'icon-image': ['get', 'icon'],
                            'icon-size': ['get', 'size'],
                            'icon-offset': ['get', 'iconOffsetPx'],
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true,
                            'text-field': ['get', 'label'],
                            'text-size': 11,
                            'text-allow-overlap': true,
                            'text-ignore-placement': true,
                            // read per-feature offset [x, y] (in ems) to stack labels
                            'text-offset': ['get', 'offset']
                          },
                          paint: {
                            'text-color': '#111',
                            'text-halo-color': '#fff',
                            'text-halo-width': 1
                          }
                        })
                      } catch (e) { console.warn('MapLibreMap: add edge labels layer failed', e) }
                    }
                  } catch (e) { console.warn('MapLibreMap: edge labels after images failed', e) }
                })
                // Fallback for edges: create DOM markers for images that didn't register
                try {
                  (emojiFeatures || []).forEach((f, idx) => {
                    try {
                      const registered = (results && results[idx])
                      if (registered) return
                      const emoji = f.properties && f.properties.label
                      const sizePx = (f.properties && f.properties._sizePx) || 64
                      const cvs = this._emojiCanvas(emoji, sizePx)
                      if (!cvs) return
                      const dataUrl = cvs.toDataURL('image/png')
                      const el = document.createElement('div')
                      el.className = 'maplibre-emoji-marker'
                      el.style.width = `${sizePx}px`
                      el.style.height = `${sizePx}px`
                      el.style.pointerEvents = 'auto'
                      const img = document.createElement('img')
                      img.src = dataUrl
                      img.style.width = '100%'
                      img.style.height = '100%'
                      img.style.display = 'block'
                      el.appendChild(img)
                      try {
                        const coords = f.geometry && f.geometry.coordinates
                        if (coords && coords.length === 2 && this._maplibregl) {
                          const marker = new this._maplibregl.Marker(el).setLngLat(coords).addTo(this.map)
                          this._markers.push(marker)
                        }
                      } catch (e) {}
                    } catch (e) {}
                  })
                } catch (e) {}
              } catch (e) { console.warn('MapLibreMap: edge emoji registration outer error', e) }
                // Edge emoji symbol source/layer (kept for emoji-only display)
              try {
                const emojiGeo = { type: 'FeatureCollection', features: emojiFeatures }
                if (this.map.getSource && this.map.getSource('geo-edge-emoji')) {
                  try { this.map.getSource('geo-edge-emoji').setData(emojiGeo) } catch (e) {}
                } else if (emojiFeatures.length) {
                  try {
                    this.map.addSource('geo-edge-emoji', { type: 'geojson', data: emojiGeo })
                    this.map.addLayer({
                      id: 'geo-edge-emoji-symbol',
                      type: 'symbol',
                      source: 'geo-edge-emoji',
                      layout: {
                        'icon-image': ['get', 'icon'],
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'icon-size': ['get', 'size']
                      }
                    })
                  } catch (e) { console.warn('MapLibreMap: add edge emoji layer failed', e) }
                } else {
                  try { if (this.map.getLayer && this.map.getLayer('geo-edge-emoji-symbol')) this.map.removeLayer('geo-edge-emoji-symbol') } catch (e) {}
                  try { if (this.map.getSource && this.map.getSource('geo-edge-emoji')) this.map.removeSource('geo-edge-emoji') } catch (e) {}
                }
              } catch (e) { console.warn('MapLibreMap: edge emoji layer update failed', e) }
            } else {
              // UI requests labels off: remove layer/source if present
              try { if (this.map.getLayer && this.map.getLayer('geo-edge-labels-symbol')) this.map.removeLayer('geo-edge-labels-symbol') } catch (e) {}
              try { if (this.map.getSource && this.map.getSource('geo-edge-labels')) this.map.removeSource('geo-edge-labels') } catch (e) {}
            }
          } catch (e) { console.warn('MapLibreMap: build edge labels failed', e) }
        } catch (e) { console.warn('MapLibreMap: edges layer update failed', e) }
      }

      _updateNodesLayer() {
        try {
          if (!this.map) return
          const nodes = this.props.nodes || []
              // Build vector circle features for non-emoji nodes, and separately
              // build an emoji feature collection for nodes that contain emoji.
              const features = (nodes || []).map((n, i) => {
                if (n && n.data && n.data.emoji) return null
            const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
            const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
            if (!isFinite(lat) || !isFinite(lng)) return null
            // compute radius consistent with Leaflet GeoNodes: weight->radius px
            const visualRadius = (n && n.data && n.data.weight) ? ((n.data.weight > 100) ? 167 : (n.data.weight * 5)) : 3
            return {
              type: 'Feature',
              properties: {
                id: (n && n.data && n.data.id) || i,
                color: (n && n.data && n.data.color) || (n && n.color) || '#1f2937',
                radius: visualRadius
              },
              geometry: { type: 'Point', coordinates: [lng, lat] }
            }
          }).filter(Boolean)
              // emoji features: nodes that have emoji
              const emojiFeatures = (nodes || []).map((n, i) => {
                const emoji = this._getNodeEmoji(n)
                if (!emoji) return null
                const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
                const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
                if (!isFinite(lat) || !isFinite(lng)) return null
                // compute an explicit pixel size derived from visualRadius so
                // nodeSizeMode affects emoji icon size consistently across adapters
                const visualRadius = (n && n.data && n.data.weight) ? ((n.data.weight > 100) ? 167 : (n.data.weight * 5)) : 3
                const computedSizePx = Math.max(28, Math.min(256, Math.round(visualRadius * 1.6)))
                // Use a unit icon-size (1.0) so the image intrinsic pixel size
                // matches the displayed size; MapLibre will scale icons by this factor.
                const iconScale = 1.0
                const iconName = `emoji-${i}@${computedSizePx}`
                return {
                  type: 'Feature',
                  // include nodeIndex so we can reliably reference the original node
                  properties: { nodeIndex: i, id: (n && n.data && n.data.id) || i, icon: iconName, size: iconScale, _sizePx: computedSizePx },
                  geometry: { type: 'Point', coordinates: [lng, lat] }
                }
              }).filter(Boolean)
          const geo = { type: 'FeatureCollection', features }
          if (this.map.getSource && this.map.getSource('geo-nodes')) {
            try { this.map.getSource('geo-nodes').setData(geo) } catch (e) {}
          } else {
            try {
              this.map.addSource('geo-nodes', { type: 'geojson', data: geo })
              this.map.addLayer({
                id: 'geo-nodes-circle',
                type: 'circle',
                source: 'geo-nodes',
                paint: {
                  'circle-color': ['get', 'color'],
                  'circle-radius': ['get', 'radius'],
                  'circle-stroke-color': '#ffffff',
                  'circle-stroke-width': 1,
                  'circle-opacity': 0.95
                }
              })
              // click handling for nodes
              this.map.on('click', 'geo-nodes-circle', (e) => {
                try {
                  const feat = e && e.features && e.features[0]
                  if (feat && feat.properties && this.props.handleClickGeoElement) {
                    const id = feat.properties.id
                    // find the node by id and call handler
                    const node = (this.props.nodes || []).find(n => String((n && n.data && n.data.id) || '') === String(id))
                    if (node) this.props.handleClickGeoElement({ group: 'node', el: node })
                  }
                } catch (err) { console.warn('MapLibreMap: node click handler error', err) }
              })
            } catch (e) { console.warn('MapLibreMap: add nodes layer failed', e) }
          }
          try { console.info('MapLibreMap: nodes features', features.length); if (this._statusEl) this._statusEl.innerText = `MapLibre: loaded • nodes:${features.length}` } catch (e) {}

          // Add or update emoji source + symbol layer (images loaded from our canvas dataURLs)
          try {
            const emojiGeo = { type: 'FeatureCollection', features: emojiFeatures }
            // ensure images are registered synchronously using canvas
            try { console.info('MapLibreMap: node emojiFeatures', emojiFeatures.map(f => (f && f.properties && f.properties.icon) || f)) } catch (e) {}
            // register images via Image objects and wait for onload before
            // adding the symbol layer to avoid MapLibre size/race issues
            try { console.info('MapLibreMap: node emojiFeatures', emojiFeatures.map(f => (f && f.properties && f.properties.icon) || f)) } catch (e) {}
                const nodeImagePromises = (emojiFeatures || []).map((f) => {
              try {
                const nodeIndex = f.properties && f.properties.nodeIndex
                const name = f.properties && f.properties.icon
                const node = (this.props.nodes || [])[nodeIndex]
                const emoji = this._getNodeEmoji(node)
                const sizePx = (f.properties && f.properties._sizePx) || 64
                const cvs = this._emojiCanvas(emoji, sizePx)
                if (!cvs || !this.map) return Promise.resolve(null)
                return this._registerCanvasAsImage(name, cvs).then((registeredName) => {
                  if (registeredName && f && f.properties) f.properties.icon = registeredName
                  return registeredName
                }).catch(() => null)
              } catch (e) { console.warn('MapLibreMap: node emoji registration error', e); return Promise.resolve(null) }
            })
            Promise.all(nodeImagePromises).then((results) => {
              // After images settled, add/update geo-emoji source/layer
              try {
                if (this.map.getSource && this.map.getSource('geo-emoji')) {
                  try { this.map.getSource('geo-emoji').setData(emojiGeo) } catch (e) {}
                } else if (emojiFeatures.length) {
                  try {
                    this.map.addSource('geo-emoji', { type: 'geojson', data: emojiGeo })
                    this.map.addLayer({
                      id: 'geo-emoji-symbol',
                      type: 'symbol',
                      source: 'geo-emoji',
                      layout: {
                        'icon-image': ['get', 'icon'],
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'icon-size': ['get', 'size']
                      }
                    })
                  } catch (e) { console.warn('MapLibreMap: add emoji layer failed', e) }
                }
              } catch (e) { console.warn('MapLibreMap: emoji layer update failed', e) }
              // Fallback: for any images that didn't register, create DOM markers
              try {
                results = results || []
                (emojiFeatures || []).forEach((f, idx) => {
                  try {
                    const registered = results[idx]
                    if (registered) return
                    // create an <img> from the canvas
                    const nodeIndex = f.properties && f.properties.nodeIndex
                    const node = (this.props.nodes || [])[nodeIndex]
                    const emoji = this._getNodeEmoji(node)
                    const sizePx = (f.properties && f.properties._sizePx) || 64
                    const cvs = this._emojiCanvas(emoji, sizePx)
                    if (!cvs) return
                    const dataUrl = cvs.toDataURL('image/png')
                    const el = document.createElement('div')
                    el.className = 'maplibre-emoji-marker'
                    el.style.width = `${sizePx}px`
                    el.style.height = `${sizePx}px`
                    el.style.pointerEvents = 'auto'
                    const img = document.createElement('img')
                    img.src = dataUrl
                    img.style.width = '100%'
                    img.style.height = '100%'
                    img.style.display = 'block'
                    el.appendChild(img)
                    try {
                      const coords = f.geometry && f.geometry.coordinates
                      if (coords && coords.length === 2 && this._maplibregl) {
                        const marker = new this._maplibregl.Marker(el).setLngLat(coords).addTo(this.map)
                        this._markers.push(marker)
                      }
                    } catch (e) {}
                  } catch (e) {}
                })
              } catch (e) {}
            })
            // update status badge emoji count
            try { if (this._statusEl) this._statusEl._emojiCount = emojiFeatures.length } catch (e) {}
          } catch (e) { console.warn('MapLibreMap: emoji layer update failed', e) }
        } catch (e) { console.warn('MapLibreMap: nodes layer update failed', e) }
      }

  render() {
    const { width = '100%', height = '100%' } = this.props
    return (<div style={{ width, height }} ref={this.container} />)
  }
}

MapLibreMap.propTypes = {
  nodes: PropTypes.array,
  edges: PropTypes.array,
  width: PropTypes.string,
  height: PropTypes.string,
  handleClickGeoElement: PropTypes.func,
  center: PropTypes.array,
  zoom: PropTypes.number,
  style: PropTypes.string
}
