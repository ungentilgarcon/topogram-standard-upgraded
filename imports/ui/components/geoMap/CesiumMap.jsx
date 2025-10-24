import React from 'react'
import PropTypes from 'prop-types'

// Minimal Cesium adapter. Loads CesiumJS dynamically if available and
// renders points as billboards. This is intentionally minimal: a full
// integration would add terrain, camera controls, and 3D tiles.

export default class CesiumMap extends React.Component {
  constructor(props) {
    super(props)
    this.viewer = null
    this.container = React.createRef()
    this._baseImageryLayer = null
    this._currentTileId = null
    this._removedDefaultLayer = false
  }

  componentDidMount() {
    // Dynamic import Cesium at runtime to avoid bundling its ESM into Meteor
    if (typeof window === 'undefined') return
    // create a fresh inner mount node so previous renderer canvases don't interfere
    try {
      if (this.container && this.container.current) {
        // if parent hasn't been laid out (height 0), force a temporary
        // min-height so Cesium can initialize properly. This is a safe
        // fallback for layout cases like calc(-140px + 100vh).
        try {
          const rect = this.container.current.getBoundingClientRect()
          if ((!rect || rect.height <= 2) && !this.container.current.style.minHeightSetForCesium) {
            this.container.current.style.minHeight = '300px'
            this.container.current.style.minHeightSetForCesium = '1'
            console.warn('CesiumMap: parent had zero height; temporarily set minHeight=300px')
          }
        } catch (e) {}
        // remove any previous mount
        try { const prev = this.container.current.querySelector('[data-cesium-mount]'); if (prev) prev.remove() } catch (e) {}
  this._mountEl = document.createElement('div')
  this._mountEl.setAttribute('data-cesium-mount', '1')
  // ensure the mount fills the parent and is on top to avoid being
  // obscured by leftover canvases from Leaflet/MapLibre
  this._mountEl.style.position = 'absolute'
  this._mountEl.style.top = '0'
  this._mountEl.style.left = '0'
  this._mountEl.style.width = '100%'
  this._mountEl.style.height = '100%'
  this._mountEl.style.zIndex = '1000'
  this._mountEl.style.pointerEvents = 'auto'
  try { if (this.container && this.container.current) this.container.current.style.position = this.container.current.style.position || 'relative' } catch (e) {}
        this.container.current.appendChild(this._mountEl)
        // add a small status badge so users can see Cesium init state without devtools
        try {
          this._statusEl = document.createElement('div')
          this._statusEl.setAttribute('data-cesium-status', '1')
          this._statusEl.style.position = 'absolute'
          this._statusEl.style.right = '8px'
          this._statusEl.style.top = '8px'
          this._statusEl.style.background = 'rgba(0,0,0,0.6)'
          this._statusEl.style.color = '#fff'
          this._statusEl.style.padding = '4px 8px'
          this._statusEl.style.borderRadius = '4px'
          this._statusEl.style.zIndex = '1100'
          this._statusEl.style.fontSize = '12px'
          this._statusEl.innerText = 'Cesium: init'
          this._mountEl.appendChild(this._statusEl)
        } catch (e) {}
      }
    } catch (e) {}

    const isLikelyMeteor = (typeof window !== 'undefined' && (window.__meteor_runtime_config__ || window.__meteor_runtime_config))
    const tryCdn = () => {
      this._loadCesiumFromCdn().then((Cesium) => {
        try {
          this.Cesium = Cesium || (typeof window !== 'undefined' ? window.Cesium : null)
          // ensure our mount element exists in the DOM before creating the Viewer
          try {
            if (this.container && this.container.current) {
              try { const prev = this.container.current.querySelector('[data-cesium-mount]'); if (prev) prev.remove() } catch (e) {}
              this._mountEl = document.createElement('div'); this._mountEl.setAttribute('data-cesium-mount', '1');
              this._mountEl.style.position = 'absolute'; this._mountEl.style.top='0'; this._mountEl.style.left='0'; this._mountEl.style.width='100%'; this._mountEl.style.height='100%'; this._mountEl.style.zIndex='1000'; this._mountEl.style.pointerEvents='auto'; this.container.current.appendChild(this._mountEl)
            }
          } catch (e) {}
          const el = this._mountEl || this.container.current
          const Viewer = this.Cesium && (this.Cesium.Viewer || (this.Cesium && this.Cesium.default && this.Cesium.default.Viewer))
          if (!Viewer) { console.warn('CesiumMap: CDN Cesium loaded but Viewer not found'); return }
          this.viewer = new Viewer(el, { animation: false, timeline: false })
          try { this._renderPoints() } catch (e) {}
          // Ensure Cesium's canvas is sized and visible inside the mount element
          try {
            const canvas = (this.viewer && this.viewer.scene && this.viewer.scene.canvas) || (this.viewer && this.viewer.canvas) || null
            if (canvas) {
              try { canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block'; canvas.style.zIndex = '1000' } catch (e) {}
              try { /* console.info('CesiumMap: canvas size', canvas.clientWidth, canvas.clientHeight) */ } catch (e) {}
            } else {
              try { console.warn('CesiumMap: viewer canvas not found') } catch (e) {}
            }
          } catch (e) {}
          try { this._applyTileSpec(this.props.tileSpec) } catch (e) {}
          try { if (this.viewer && this.viewer.scene && this.viewer.scene.requestRender) this.viewer.scene.requestRender(true) } catch (e) {}
          try { window.dispatchEvent && window.dispatchEvent(new Event('resize')) } catch (e) {}
        } catch (e) { console.warn('CesiumMap: init after CDN load failed', e) }
      }).catch((e) => { console.warn('CesiumMap: CDN fallback failed', e) })
    }

    if (isLikelyMeteor) {
      // Meteor's bundler sometimes evaluates ESM with import.meta which breaks
      // dynamic import in the non-module runtime. Prefer CDN UMD in that case.
      tryCdn()
    } else {
      import('cesium').then((mod) => {
        try {
          const Cesium = mod && (mod.default || mod)
          try { if (typeof window !== 'undefined' && !window.CESIUM_BASE_URL) window.CESIUM_BASE_URL = '' } catch (e) {}
          // ensure mount exists so viewer attaches to a visible element
          try { if (!this._mountEl) this._ensureMount() } catch (e) {}
          const el = this._mountEl || this.container.current
          const Viewer = Cesium && (Cesium.Viewer || (Cesium && Cesium.default && Cesium.default.Viewer))
          if (!Viewer) return
          this.Cesium = Cesium
          this.viewer = new Viewer(el, { animation: false, timeline: false })
          try { if (this._mountEl) { this._mountEl.setAttribute('data-cesium-state', 'viewer-created'); if (this._statusEl) this._statusEl.innerText = 'Cesium: viewer' } } catch (e) {}
          try { this._applyTileSpec(this.props.tileSpec) } catch (e) {}
          try { this._renderPoints() } catch (e) {}
          try { if (this.viewer && this.viewer.scene && this.viewer.scene.requestRender) this.viewer.scene.requestRender(true) } catch (e) {}
          try { window.dispatchEvent && window.dispatchEvent(new Event('resize')) } catch (e) {}
        } catch (err) { console.warn('CesiumMap: init error', err) }
      }).catch((err) => {
        console.warn('CesiumMap: dynamic import failed', err)
        // On any failure, fall back to CDN UMD
        tryCdn()
      })
    }
  }

  // Ensure our mount and simple status element exist in the container
  _ensureMount() {
    try {
      if (!this.container || !this.container.current) return
      if (this._mountEl && this._mountEl.isConnected) return
      try { const prev = this.container.current.querySelector('[data-cesium-mount]'); if (prev) prev.remove() } catch (e) {}
      this._mountEl = document.createElement('div')
      this._mountEl.setAttribute('data-cesium-mount', '1')
      this._mountEl.setAttribute('data-cesium-state', 'mounted')
      this._mountEl.style.position = 'absolute'
      this._mountEl.style.top = '0'
      this._mountEl.style.left = '0'
      this._mountEl.style.width = '100%'
      this._mountEl.style.height = '100%'
      this._mountEl.style.zIndex = '1000'
      this._mountEl.style.pointerEvents = 'auto'
      try { this.container.current.style.position = this.container.current.style.position || 'relative' } catch (e) {}
      this.container.current.appendChild(this._mountEl)
      try {
        this._statusEl = document.createElement('div')
        this._statusEl.setAttribute('data-cesium-status', '1')
        this._statusEl.style.position = 'absolute'
        this._statusEl.style.right = '8px'
        this._statusEl.style.top = '8px'
        this._statusEl.style.background = 'rgba(0,0,0,0.6)'
        this._statusEl.style.color = '#fff'
        this._statusEl.style.padding = '4px 8px'
        this._statusEl.style.borderRadius = '4px'
        this._statusEl.style.zIndex = '1100'
        this._statusEl.style.fontSize = '12px'
        this._statusEl.innerText = 'Cesium: mount'
        this._mountEl.appendChild(this._statusEl)
      } catch (e) {}
    } catch (e) {}
  }

  // Normalize various color formats into a CSS string usable by canvas
  _normalizeColor(raw) {
    try {
      if (!raw) return '#1f2937'
      if (typeof raw === 'string') return raw
      // object with r,g,b (0-255) or r,g,b (0-1)
      if (typeof raw === 'object') {
        const r = raw.r != null ? raw.r : (raw[0] != null ? raw[0] : null)
        const g = raw.g != null ? raw.g : (raw[1] != null ? raw[1] : null)
        const b = raw.b != null ? raw.b : (raw[2] != null ? raw[2] : null)
        const a = raw.a != null ? raw.a : (raw[3] != null ? raw[3] : 1)
        if (r == null || g == null || b == null) return '#1f2937'
        // detect 0-1 range
        const r255 = r <= 1 ? Math.round(r * 255) : Math.round(r)
        const g255 = g <= 1 ? Math.round(g * 255) : Math.round(g)
        const b255 = b <= 1 ? Math.round(b * 255) : Math.round(b)
        if (a == null) return `rgb(${r255},${g255},${b255})`
        return `rgba(${r255},${g255},${b255},${Number(a)})`
      }
    } catch (e) {}
    return '#1f2937'
  }

  // Load Cesium UMD bundle and CSS from unpkg CDN. Resolves with global Cesium.
  _loadCesiumFromCdn() {
    return new Promise((resolve, reject) => {
      try {
        if (typeof window === 'undefined') return reject(new Error('no-window'))
        if (window.Cesium) return resolve(window.Cesium)
        // read the cesium version from package.json but normalize it: strip
        // leading non-digit characters such as '^' so URLs like
        // https://unpkg.com/cesium@1.134.1/... are used (no percent-encoding)
        let depVer = null
        try { depVer = require('../../../../package.json').dependencies.cesium } catch (e) { depVer = null }
        let version = 'latest'
        if (depVer && typeof depVer === 'string') {
          // remove any leading characters that are not digits (caret, ~, >= etc)
          const m = String(depVer).match(/(\d+\.[0-9.]+)/)
          if (m && m[1]) version = m[1]
        }
  const cssHref = `https://unpkg.com/cesium@${version}/Build/Cesium/Widgets/widgets.css`
  // ensure trailing slash so Cesium resolves relative asset URLs correctly
  const scriptSrcBase = `https://unpkg.com/cesium@${version}/Build/Cesium/`
  const scriptSrc = scriptSrcBase + 'Cesium.js'
        // set CESIUM_BASE_URL so Cesium can find its static assets
  try { window.CESIUM_BASE_URL = scriptSrcBase } catch (e) {}

        // inject CSS
        if (!document.querySelector('link[data-cesium-cdn]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = cssHref
          link.setAttribute('data-cesium-cdn', '1')
          try { link.crossOrigin = 'anonymous' } catch (e) {}
          document.head.appendChild(link)
        }

        // inject script
        if (document.querySelector('script[data-cesium-cdn]')) {
          // script already present, wait for Cesium to be available
          const waitFor = () => { if (window.Cesium) resolve(window.Cesium); else setTimeout(waitFor, 200) }
          waitFor()
          return
        }
  // helpful log for debugging CDN path issues
  try { /* console.info('CesiumMap: loading Cesium from CDN', scriptSrc) */ } catch (e) {}
  const s = document.createElement('script')
  s.src = scriptSrc
  s.async = true
  s.setAttribute('data-cesium-cdn', '1')
  s.setAttribute('data-cesium-script', '1')
  try { s.crossOrigin = 'anonymous' } catch (e) {}
  s.onload = () => {
    try { if (this._mountEl) this._mountEl.setAttribute('data-cesium-state', 'script-loaded'); if (this._statusEl) this._statusEl.innerText = 'Cesium: script-loaded' } catch (e) {}
    if (window.Cesium) resolve(window.Cesium); else reject(new Error('Cesium loaded but window.Cesium missing'))
  }
  s.onerror = (e) => {
    try { if (this._mountEl) this._mountEl.setAttribute('data-cesium-state', 'script-error'); if (this._statusEl) this._statusEl.innerText = 'Cesium: script-error' } catch (err) {}
    reject(new Error('Cesium script load failed'))
  }
  document.body.appendChild(s)
      } catch (e) { reject(e) }
    })
  }

  componentDidUpdate(prevProps) {
    // Re-render points when nodes, edges or UI settings change. Previous
    // implementation only re-rendered on nodes which caused UI toggles to
    // leave stale placements in the Cesium scene.
    if (this.props.nodes !== prevProps.nodes || this.props.edges !== prevProps.edges || this.props.ui !== prevProps.ui) {
      this._renderPoints()
    }
    if (this.props.tileSpec !== prevProps.tileSpec) {
      this._applyTileSpec(this.props.tileSpec)
    }
  }

  componentWillUnmount() {
    try { if (this.viewer && this.viewer.destroy) this.viewer.destroy() } catch (e) {}
    try { if (this.container && this.container.current) this.container.current.innerHTML = '' } catch (e) {}
    try {
      if (this._edgeEntities && this._edgeEntities.length && this.viewer && this.viewer.entities) {
        this._edgeEntities.forEach(en => { try { this.viewer.entities.remove(en) } catch (e) {} })
      }
    } catch (e) {}
  }

  // Initialize the Cesium Viewer only when the mount element has a non-zero
  // size. Some parents (flex, calc heights) may not be laid out immediately
  // during mount; creating the viewer while size is 0x0 results in a blank
  // canvas. Retry a few times before giving up.
  _initViewerWhenReady(ViewerClass, el) {
    const tryInit = (attempt = 0) => {
      try {
        const w = (el && (el.clientWidth || el.offsetWidth)) || 0
        const h = (el && (el.clientHeight || el.offsetHeight)) || 0
        if (w > 2 && h > 2) {
          try {
            this.viewer = new ViewerClass(el, { animation: false, timeline: false })
            try { this._renderPoints() } catch (e) {}
            try { const canvas = (this.viewer && this.viewer.scene && this.viewer.scene.canvas) || (this.viewer && this.viewer.canvas) || null; if (canvas) { canvas.style.width='100%'; canvas.style.height='100%'; canvas.style.display='block'; canvas.style.zIndex='1000' } } catch (e) {}
            try { if (this.viewer && this.viewer.scene && this.viewer.scene.requestRender) this.viewer.scene.requestRender(true) } catch (e) {}
            try { window.dispatchEvent && window.dispatchEvent(new Event('resize')) } catch (e) {}
            // mark status ready
            try { if (this._statusEl) this._statusEl.innerText = 'Cesium: ready' } catch (e) {}
            // if we have nodes, center camera on first node for proof-of-life
            try {
              const nodes = this.props && this.props.nodes || []
              if (nodes && nodes.length) {
                const n = nodes[0]
                const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
                const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
                if (isFinite(lat) && isFinite(lng)) {
                  try { const dest = Cesium.Cartesian3.fromDegrees(lng, lat, 20000); this.viewer.camera.setView({ destination: dest }) } catch (e) {}
                }
              }
            } catch (e) {}
            return
          } catch (e) { console.warn('CesiumMap: viewer creation failed', e) }
        }
      } catch (e) {}
      if (attempt < 10) {
        // exponential backoff-ish
        setTimeout(() => tryInit(attempt + 1), 100 + attempt * 50)
      } else {
        // last resort: try once anyway
        try {
          this.viewer = new ViewerClass(el, { animation: false, timeline: false })
          try { this._renderPoints() } catch (e) {}
          try { if (this.viewer && this.viewer.scene && this.viewer.scene.requestRender) this.viewer.scene.requestRender(true) } catch (e) {}
          try { window.dispatchEvent && window.dispatchEvent(new Event('resize')) } catch (e) {}
        } catch (e) { console.warn('CesiumMap: final viewer create failed', e) }
      }
  }
    tryInit()
  }

  _renderPoints() {
    try {
      if (!this.viewer) return
      const primitives = this.viewer.scene && this.viewer.scene.primitives
      if (!primitives) return
      // Improved: create a single BillboardCollection, add all points, then
      // set camera to frame the points so they become visible.
      const nodes = this.props.nodes || []
      // remove only our previous billboard collection if present
      try {
        if (this._billboardCollection && primitives.contains && primitives.contains(this._billboardCollection)) {
          try { primitives.remove(this._billboardCollection) } catch (e) {}
        }
      } catch (e) {}

      const Cesium = this.Cesium
      if (!Cesium) return

      if (!nodes.length) {
        // No points: set a default globe/backdrop view so the canvas isn't empty
        try {
          this.viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000) })
        } catch (e) {}
        return
      }

      // Create both a PointPrimitiveCollection (for plain circles) and a
      // BillboardCollection which we'll use for emoji rendering. Always
      // create a billboard collection so emoji billboards can be added even
      // when point primitives are available.
      try {
        // cleanup prior collections if present
        try { if (this._pointCollection && primitives.contains && primitives.contains(this._pointCollection)) primitives.remove(this._pointCollection) } catch (e) {}
        if (this._pointCollection) this._pointCollection = null
        try { if (this._billboardCollection && primitives.contains && primitives.contains(this._billboardCollection)) primitives.remove(this._billboardCollection) } catch (e) {}
        if (this._billboardCollection) this._billboardCollection = null
        this._pointCollection = new Cesium.PointPrimitiveCollection()
        primitives.add(this._pointCollection)
      } catch (e) { this._pointCollection = null }
      try {
        this._billboardCollection = new Cesium.BillboardCollection()
        primitives.add(this._billboardCollection)
      } catch (e) { this._billboardCollection = null }

      const lats = []
      const lngs = []
  // console.info('CesiumMap: rendering', nodes.length, 'nodes')
      // compute degree map as a fallback if upstream hasn't set n.data.weight
      const degreeMap = new Map()
      try {
        const edges = this.props.edges || []
        edges.forEach(ed => {
          try {
            const s = ed && ed.data && ed.data.source
            const t = ed && ed.data && ed.data.target
            if (s != null) degreeMap.set(String(s), (degreeMap.get(String(s)) || 0) + 1)
            if (t != null) degreeMap.set(String(t), (degreeMap.get(String(t)) || 0) + 1)
          } catch (e) {}
        })
      } catch (e) {}

      // Temporary debug: print a sample of incoming nodes and the sizes we'll compute
      try {
        if (typeof console !== 'undefined' && console.debug) {
          const sample = (nodes || []).slice(0, 6).map(n => {
            try {
              const id = n && n.data && n.data.id
              const incomingWeight = (n && n.data && typeof n.data.weight !== 'undefined') ? n.data.weight : undefined
              const weightVal = (typeof incomingWeight !== 'undefined') ? Number(incomingWeight) : (degreeMap.get(String(id)) || 1)
              const visualRadiusDebug = (weightVal) ? ((weightVal > 100) ? 167 : (weightVal * 5)) : 3
              const pixelSizeDebug = Math.max(2, Math.round(visualRadiusDebug * 0.5))
              return { id, incomingWeight, weightVal, visualRadius: visualRadiusDebug, pixelSize: pixelSizeDebug }
            } catch (err) { return { error: String(err) } }
          })
          const dmEntries = Array.from(degreeMap.entries()).slice(0, 8)
          const info = { nodeSizeMode: (this.props && this.props.ui && this.props.ui.nodeSizeMode) || null, degreeMapSample: dmEntries, sample }
          try { /* console.debug('CesiumMap: debug nodeSizes (stringified)\n' + JSON.stringify(info, null, 2)) */ } catch (e) { /* console.debug('CesiumMap: debug nodeSizes', info) */ }
        }
      } catch (e) {}

      nodes.forEach(n => {
        try {
          const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
          const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
          if (!isFinite(lat) || !isFinite(lng)) return
          lats.push(lat); lngs.push(lng)
          // accept color from multiple possible fields, normalize it
          const rawColor = (n && n.data && n.data.color)
            || (n && n.attrs && (n.attrs.color || (n.attrs.style && n.attrs.style.color)))
            || (n && n.color)
            || '#1f2937'
          const color = this._normalizeColor(rawColor)
          const cart = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
          // compute visual radius matching Leaflet GeoNodes
          // Use n.data.weight if present; otherwise fall back to degree map
          const weightVal = (n && n.data && (typeof n.data.weight !== 'undefined')) ? Number(n.data.weight) : (degreeMap.get(String(n && n.data && n.data.id)) || 1)
          const visualRadius = (weightVal) ? ((weightVal > 100) ? 167 : (weightVal * 5)) : 3
          // reduce circle-rendered node size further (half again) so emoji and circle sizes align better
          const pixelSize = Math.max(2, Math.round(visualRadius * 0.5))
          // emoji rendering: when UI allows and node has an emoji, draw it as a billboard
          const emojiEnabled = (this.props.ui && typeof this.props.ui.emojiVisible !== 'undefined') ? !!this.props.ui.emojiVisible : true
          const hasEmoji = emojiEnabled && n && n.data && n.data.emoji
          if (hasEmoji) {
            try {
              const emoji = String(n.data.emoji)
              // compute font size proportional to visualRadius so nodeSizeMode affects emoji
              // visualRadius is in the same units used for non-emoji rendering
              const baseFont = Math.max(10, Math.min(96, Math.round(visualRadius * 0.9)))
              // canvas size should comfortably contain the glyph plus halo
              const cvsSize = Math.max( Math.round(baseFont * 1.6), Math.max(24, Math.round(pixelSize * 2)) )
              const cvs = document.createElement('canvas'); cvs.width = cvsSize; cvs.height = cvsSize
              const ctx = cvs.getContext('2d'); if (ctx) {
                ctx.clearRect(0,0,cvsSize,cvsSize)
                ctx.font = `${baseFont}px sans-serif`
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                // draw a stronger white halo for readability
                ctx.lineWidth = Math.max(2, Math.round(baseFont / 10))
                ctx.strokeStyle = '#ffffff'
                ctx.strokeText(emoji, cvsSize / 2, cvsSize / 2)
                ctx.fillStyle = color || '#111'
                ctx.fillText(emoji, cvsSize / 2, cvsSize / 2)
              }
              const image = cvs.toDataURL()
              // choose a scale so the billboard's displayed pixel size matches pixelSize
              // Note: Cesium billboards' scale multiplies the source image. We'll compute an approximate scale.
              const scale = Math.max(0.25, (pixelSize * 1.0) / Math.max(8, Math.round(cvsSize / 2)))
              try { this._billboardCollection && this._billboardCollection.add && this._billboardCollection.add({ position: cart, image, scale: scale, disableDepthTestDistance: Number.POSITIVE_INFINITY }) } catch (e2) {}
            } catch (e) { /* ignore emoji rendering errors */ }
          } else if (this._pointCollection) {
            try {
              const c = Cesium.Color.fromCssColorString ? Cesium.Color.fromCssColorString(color) : Cesium.Color.WHITE
              // add outline using outlineColor/outlineWidth when supported
              const outlineWidth = Math.max(1, Math.round(pixelSize / 6))
              // disable depth test for nodes so they render on top of ground-clamped polylines
              this._pointCollection.add({ position: cart, color: c, pixelSize: pixelSize, outlineColor: Cesium.Color.BLACK, outlineWidth, disableDepthTestDistance: Number.POSITIVE_INFINITY })
            } catch (e) {
              // fallback to canvas billboard if color->Cesium.Color conversion fails
              const cvs = document.createElement('canvas'); cvs.width = pixelSize; cvs.height = pixelSize
              const ctx = cvs.getContext('2d'); if (ctx) {
                // draw filled circle with black stroke outline
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(pixelSize/2,pixelSize/2,Math.max(1, Math.floor(pixelSize/2)-1),0,Math.PI*2); ctx.fill()
                ctx.lineWidth = Math.max(1, Math.round(pixelSize / 8)); ctx.strokeStyle = '#000'; ctx.stroke()
              }
              const image = cvs.toDataURL()
              try { this._billboardCollection && this._billboardCollection.add && this._billboardCollection.add({ position: cart, image, disableDepthTestDistance: Number.POSITIVE_INFINITY }) } catch (e2) {}
            }
          } else if (this._billboardCollection) {
            // create a small canvas texture for the billboard with black outline
            const cvs = document.createElement('canvas'); cvs.width = pixelSize; cvs.height = pixelSize
            const ctx = cvs.getContext('2d'); if (ctx) {
              ctx.fillStyle = color; ctx.beginPath(); ctx.arc(pixelSize/2,pixelSize/2,Math.max(1, Math.floor(pixelSize/2)-1),0,Math.PI*2); ctx.fill()
              ctx.lineWidth = Math.max(1, Math.round(pixelSize / 8)); ctx.strokeStyle = '#000'; ctx.stroke()
            }
            const image = cvs.toDataURL()
            try { this._billboardCollection.add({ position: cart, image, disableDepthTestDistance: Number.POSITIVE_INFINITY }) } catch (e) {}
          }
        } catch (e) { console.warn('CesiumMap: point add failed', e) }
      })

      // Node labels: if UI requests node names, create entities (cleanup any prior)
      try {
        // remove previous node label entities tracked here
        try { if (this._nodeLabelEntities && this._nodeLabelEntities.length && this.viewer && this.viewer.entities) { this._nodeLabelEntities.forEach(en => { try { this.viewer.entities.remove(en) } catch (e) {} }) } } catch (e) {}
        this._nodeLabelEntities = []
        const nodeLabelMode = (this.props.ui && this.props.ui.nodeLabelMode) ? String(this.props.ui.nodeLabelMode) : 'both'
        const titleSize = (this.props.ui && this.props.ui.titleSize) ? Number(this.props.ui.titleSize) : 12
        if (nodeLabelMode === 'name' || nodeLabelMode === 'both' || nodeLabelMode === 'emoji') {
          nodes.forEach(n => {
            try {
              const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
              const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
              if (!isFinite(lat) || !isFinite(lng)) return
              const txt = (nodeLabelMode === 'emoji') ? (n && n.data && n.data.emoji ? String(n.data.emoji) : String(n && n.data && (n.data.name || n.data.label) || '')) : String(n && n.data && (n.data.name || n.data.label) || '')
              if (!txt) return
              const pos = Cesium.Cartesian3.fromDegrees(lng, lat, 5)
              const ent = this.viewer.entities.add({
                position: pos,
                label: {
                  text: txt,
                  font: `${Math.max(10, titleSize)}px sans-serif`,
                  fillColor: Cesium.Color.fromCssColorString ? Cesium.Color.fromCssColorString('#ffffff') : Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.fromCssColorString ? Cesium.Color.fromCssColorString('#111111') : Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL,
                  pixelOffset: (Cesium && Cesium.Cartesian2) ? new Cesium.Cartesian2(0, -12) : undefined,
                  horizontalOrigin: Cesium && Cesium.HorizontalOrigin ? Cesium.HorizontalOrigin.CENTER : undefined
                },
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              })
              if (ent) this._nodeLabelEntities.push(ent)
            } catch (e) {}
          })
        }
      } catch (e) {}

      // report how many visual primitives we created and whether emoji were used
      try {
        const bbCount = this._billboardCollection ? (this._billboardCollection.length || (this._billboardCollection._primitives && this._billboardCollection._primitives.length) || 0) : 0
        const ppCount = this._pointCollection ? (this._pointCollection.length || (this._pointCollection._primitives && this._pointCollection._primitives.length) || 0) : 0
        console.info('CesiumMap: billboardCount', bbCount, 'pointPrimitiveCount', ppCount)
        if (this._statusEl) this._statusEl.innerText = `Cesium: ready • nodes:${nodes.length} bb:${bbCount} pp:${ppCount}`
      } catch (e) {}

      // Log primitives counts for debugging
      try {
        console.info('CesiumMap: primitives count after add', primitives.length || (primitives._primitives && primitives._primitives.length))
        if (this._pointCollection) console.info('CesiumMap: pointCollection count', this._pointCollection.length || (this._pointCollection._primitives && this._pointCollection._primitives.length))
        if (this._billboardCollection) console.info('CesiumMap: billboardCollection count', this._billboardCollection.length || (this._billboardCollection._primitives && this._billboardCollection._primitives.length))
      } catch (e) {}

      // Center camera on average coords and choose a height based on spread
      try {
        const avgLat = lats.reduce((a,b) => a + b, 0) / lats.length
        const avgLng = lngs.reduce((a,b) => a + b, 0) / lngs.length
        // compute rough span in degrees
        const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
        const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs)
        const latSpan = Math.max(0.001, Math.abs(maxLat - minLat))
        const lngSpan = Math.max(0.001, Math.abs(maxLng - minLng))
        // heuristic height: larger span -> larger height
        const span = Math.max(latSpan, lngSpan)
        // Map span degrees to a height (meters). These factors are heuristic.
        const height = Math.min(Math.max(2000, span * 111000 * 2.5), 20000000)
        const destination = Cesium.Cartesian3.fromDegrees(avgLng, avgLat, height)
        try { this.viewer.camera.flyTo({ destination, duration: 0.6 }) } catch (e) { this.viewer.camera.setView({ destination }) }
      } catch (e) { console.warn('CesiumMap: camera set failed', e) }
      // Render edges (polylines) if provided
      try {
        // remove previous edge entities we created
        try {
          if (this._edgeEntities && this._edgeEntities.length && this.viewer && this.viewer.entities) {
            this._edgeEntities.forEach(en => { try { this.viewer.entities.remove(en) } catch (e) {} })
          }
        } catch (e) {}
        this._edgeEntities = []
        const edges = this.props.edges || []
        if (edges && edges.length && this.viewer && this.Cesium && this.viewer.entities) {
          edges.forEach((e) => {
            try {
              if (!e || !e.coords || !e.coords.length) return
              const coords = e.coords.map(pt => {
                const lat = Number(pt && pt[0]); const lng = Number(pt && pt[1])
                if (!isFinite(lat) || !isFinite(lng)) return null
                return this.Cesium.Cartesian3.fromDegrees(lng, lat, 0)
              }).filter(Boolean)
              if (!coords || coords.length < 2) return
              const rawColor = (e && e.data && e.data.color) || '#9f7aea'
              const cesColor = (this.Cesium.Color && this.Cesium.Color.fromCssColorString) ? this.Cesium.Color.fromCssColorString(rawColor) : (this.Cesium.Color ? this.Cesium.Color.WHITE : null)
              // compute weight using GeoEdges formula: if weight>6 -> 20 else squared, default 1
              const weightRaw = e && e.data && e.data.weight
              const weight = weightRaw ? ((weightRaw > 6) ? 20 : Math.pow(weightRaw, 2)) : 1
              const widthPx = Math.min(Math.max(1, weight), 20)
              try {
                // Render only the colored polyline (no black outline) so edges
                // are drawn as a single primitive. This avoids explicit outline
                // drawing which the UI requested to undo.
                const ent = this.viewer.entities.add({
                  polyline: {
                    positions: coords,
                    width: widthPx,
                    material: cesColor || (this.Cesium.Color ? this.Cesium.Color.WHITE : undefined),
                    clampToGround: true
                  }
                })
                if (ent) this._edgeEntities.push(ent)
              } catch (e) { /* ignore edge add errors */ }
            } catch (err) { console.warn('CesiumMap: add edge failed', err) }
          })
          // Add midpoint labels for edges according to UI setting (emoji/text/none)
          try {
            const geoRelVisible = !this.props.ui || typeof this.props.ui.geoEdgeRelVisible === 'undefined' ? true : !!this.props.ui.geoEdgeRelVisible
            if (geoRelVisible) {
              // Optionally aggregate duplicate labels for edges sharing same endpoints and same label/emoji
              const doAggregate = !!(this.props.ui && this.props.ui.geoEdgeLabelAggregate)
              const originalEdges = (this.props.edges || [])
              const edgeMode = !this.props.ui || typeof this.props.ui.edgeRelLabelMode === 'undefined' ? 'text' : String(this.props.ui.edgeRelLabelMode)
              const computeRelLabel = (e) => {
                const relTextRaw = e && e.data ? (e.data.relationship || e.data.name || '') : ''
                const relEmojiRaw = e && e.data ? (e.data.relationshipEmoji || '') : ''
                let relLabel = ''
                if (edgeMode === 'emoji') relLabel = relEmojiRaw ? String(relEmojiRaw) : String(relTextRaw || '')
                else if (edgeMode === 'text') relLabel = String(relTextRaw || '')
                else if (edgeMode === 'none') relLabel = ''
                else relLabel = relEmojiRaw ? `${String(relEmojiRaw)} ${String(relTextRaw || '')}` : String(relTextRaw || '')
                return { relLabel, relTextRaw, relEmojiRaw }
              }
              let edgesList = originalEdges
              let groupCounts = null
              if (doAggregate) {
                groupCounts = new Map()
                originalEdges.forEach((e) => {
                  try {
                    const s = String(e && e.data && e.data.source)
                    const t = String(e && e.data && e.data.target)
                    const { relLabel } = computeRelLabel(e)
                    const key = `${s}|${t}|${relLabel}`
                    const prev = groupCounts.get(key) || { count: 0, edge: e }
                    prev.count += 1
                    if (!prev.edge) prev.edge = e
                    groupCounts.set(key, prev)
                  } catch (_) {}
                })
                const reps = []
                groupCounts.forEach((val) => { if (val && val.edge) reps.push(val.edge) })
                edgesList = reps
              }
              // build buckets of edges (or representatives when aggregated) sharing the same canonical endpoints
              const edgesListRef = edgesList
              const buckets = new Map()
              const canonicalKey = (ee) => {
                if (!ee || !ee.coords || ee.coords.length !== 2) return ''
                const [[la1, lo1], [la2, lo2]] = ee.coords
                const a1 = Number(la1); const o1 = Number(lo1); const a2 = Number(la2); const o2 = Number(lo2)
                if (!isFinite(a1) || !isFinite(o1) || !isFinite(a2) || !isFinite(o2)) return ''
                const k1 = `${a1},${o1}`
                const k2 = `${a2},${o2}`
                return (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`
              }
              edgesListRef.forEach((ee, idx) => { const k = canonicalKey(ee); if (!k) return; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(idx) })
              // screen-space placement helpers: track placed label rects to avoid overlaps
              const placedRects = [] // {x,y,w,h}
              let measureCtx = null
              try { if (typeof document !== 'undefined') { const mc = document.createElement('canvas'); measureCtx = mc.getContext('2d'); if (measureCtx) measureCtx.font = '11px sans-serif' } } catch (err) { measureCtx = null }
              edgesListRef.forEach((e, idx) => {
              try {
                if (!e || !e.coords || e.coords.length !== 2) return
                const [[lat1, lng1], [lat2, lng2]] = e.coords
                const a1 = Number(lat1); const o1 = Number(lng1); const a2 = Number(lat2); const o2 = Number(lng2)
                if (!isFinite(a1) || !isFinite(o1) || !isFinite(a2) || !isFinite(o2)) return
                const { relLabel: baseRelLabel, relTextRaw, relEmojiRaw } = computeRelLabel(e)
                let relLabel = baseRelLabel
                // determine aggregate count for this group
                let count = 1
                if (doAggregate && groupCounts) {
                  try {
                    const s = String(e && e.data && e.data.source)
                    const t = String(e && e.data && e.data.target)
                    const key = `${s}|${t}|${baseRelLabel}`
                    const info = groupCounts.get(key)
                    if (info && info.count > 1) count = info.count
                  } catch (_) {}
                }
                if (!relLabel || String(relLabel).trim() === '') return
                // compute a geodesic midpoint (great-circle) between the two endpoints
                let midLat = (a1 + a2) / 2
                let midLng = (o1 + o2) / 2
                try {
                  // prefer Cesium's EllipsoidGeodesic for accurate midpoints across long arcs
                  if (this.Cesium && this.Cesium.EllipsoidGeodesic) {
                    const carto0 = new this.Cesium.Cartographic(this.Cesium.Math.toRadians(o1), this.Cesium.Math.toRadians(a1))
                    const carto1 = new this.Cesium.Cartographic(this.Cesium.Math.toRadians(o2), this.Cesium.Math.toRadians(a2))
                    const geod = new this.Cesium.EllipsoidGeodesic(carto0, carto1)
                    const midCarto = geod.interpolateUsingFraction(0.5, new this.Cesium.Cartographic())
                    // convert back to degrees
                    midLat = this.Cesium.Math.toDegrees(midCarto.latitude)
                    midLng = this.Cesium.Math.toDegrees(midCarto.longitude)
                  }
                } catch (err) { /* fallback to arithmetic midpoint on error */ }
                // compute stacking slot index for this edge and offset latitude
                const k = canonicalKey(e)
                const bucket = buckets.has(k) ? buckets.get(k) : []
                const slotIdx = bucket && bucket.length ? bucket.indexOf(idx) : -1
                // center the stack around the midpoint so labels go above and below
                // rather than all in one direction. We'll compute screen-space
                // perpendicular offsets to place labels on top of their edge and
                // distribute multiple labels along the perpendicular so they don't overlap.
                let slotOffsetDeg = 0
                const slotCount = (bucket && bucket.length) ? bucket.length : 0
                const slotIndex = slotIdx >= 0 ? slotIdx : 0
                const spacingPx = 18 // pixels between stacked labels
                // compute geographic midpoint position for world placement
                // Use the cartographic midpoint at ground level (height 0) so
                // label positions align with clampToGround polylines.
                let pos = null
                try {
                  if (this.Cesium && this.Cesium.Ellipsoid && this.Cesium.Cartographic) {
                    const midCart = new this.Cesium.Cartographic(this.Cesium.Math.toRadians(midLng), this.Cesium.Math.toRadians(midLat + slotOffsetDeg), 0)
                    pos = this.Cesium.Ellipsoid.WGS84.cartographicToCartesian(midCart)
                  }
                } catch (err) { pos = null }
                if (!pos) pos = this.Cesium.Cartesian3.fromDegrees(midLng, midLat + slotOffsetDeg, 5)
                // We'll compute a world-space position to use for placing
                // emoji/labels. By default this is the geographic midpoint
                // but if we cannot project to screen space (SceneTransforms
                // returns null) we'll attempt a camera-space conversion that
                // turns desired pixel offsets into a world offset. This keeps
                // the visible separation consistent across zoom/latitude.
                let worldPos = pos
                // Determine desired screen midpoint for the edge and avoid overlaps by shifting
                let ox = 0, oy = 0
                let forceMidpoint = false
                try {
                  let screenMid = null
                  try { if (this.viewer && this.viewer.scene && this.Cesium && this.Cesium.SceneTransforms) screenMid = this.Cesium.SceneTransforms.wgs84ToWindowCoordinates(this.viewer.scene, pos) } catch (err) { screenMid = null }
                  try { console.info('CesiumMap: screenMidRaw', { idx, screenMid: (screenMid ? { x: screenMid.x, y: screenMid.y } : null) }) } catch (e) {}
                  const labelText = String(relTextRaw || relLabel || '')
                  let textW = 80, textH = 16
                  try {
                    if (measureCtx && labelText) {
                      measureCtx.font = '11px sans-serif'
                      const m = measureCtx.measureText(labelText)
                      textW = Math.max(32, Math.round(m.width + 10))
                      textH = 16
                    }
                  } catch (err) {}

                  const intersects = (r1, r2) => !(r2.x > (r1.x + r1.w) || (r2.x + r2.w) < r1.x || r2.y > (r1.y + r1.h) || (r2.y + r2.h) < r1.y)

                  if (screenMid) {
                    const baseX = Math.round(screenMid.x)
                    const baseY = Math.round(screenMid.y)
                    const baseRect = { x: baseX - Math.round(textW / 2), y: baseY - Math.round(textH / 2), w: textW, h: textH }
                    let ok = true
                    for (let i = 0; i < placedRects.length; i++) { if (intersects(baseRect, placedRects[i])) { ok = false; break } }
                    if (ok) {
                      ox = 0; oy = 0
                      placedRects.push(baseRect)
                    } else {
                      // try small shifts in cardinal directions until free
                      const shifts = [ [ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ], [ -1, -1 ], [ 1, -1 ], [ -1, 1 ], [ 1, 1 ] ]
                      let found = false
                      const maxSteps = 6
                      for (let step = 1; step <= maxSteps && !found; step++) {
                        for (let si = 0; si < shifts.length && !found; si++) {
                          const dx = shifts[si][0] * spacingPx * step
                          const dy = shifts[si][1] * spacingPx * step
                          const r = { x: baseRect.x + dx, y: baseRect.y + dy, w: baseRect.w, h: baseRect.h }
                          let coll = false
                          for (let j = 0; j < placedRects.length; j++) { if (intersects(r, placedRects[j])) { coll = true; break } }
                          if (!coll) { ox = dx; oy = dy; placedRects.push(r); found = true; break }
                        }
                      }
                      if (!found) { placedRects.push(baseRect) }
                    }
                  } else {
                    // No screen projection available — anchor exactly at the
                    // geographic midpoint and compute pixel stacking offsets
                    // deterministically from the slot index. This ensures labels
                    // remain centered on the edge even when we can't project.
                    try {
                      const centerIndex = (slotCount - 1) / 2
                      oy = Math.round((slotIndex - centerIndex) * spacingPx)
                      ox = 0
                      worldPos = pos
                      forceMidpoint = true
                      try { console.info('CesiumMap: fallback-midpoint-used', { idx, slotIndex, slotCount, ox, oy }) } catch (e) {}
                    } catch (e) { /* non-fatal */ }
                  }

                  // If we still don't have a reliable screenMid, try a multi-sample
                  // pick-based fallback: sample multiple screen pixels along the
                  // perpendicular to the edge and pick the hit whose lat/lng is
                  // closest to the geographic midpoint. This is robust with
                  // terrain and clamp-to-ground polylines.
                  try {
                    if (this.viewer && this.viewer.camera && this.viewer.scene) {
                      const scene = this.viewer.scene
                      const canvas2 = scene.canvas
                      const cw = canvas2.clientWidth || canvas2.width || 800
                      const ch = canvas2.clientHeight || canvas2.height || 600

                      // compute a base screen point to sample around: prefer SceneTransforms if available
                      let baseX = Math.round(cw / 2), baseY = Math.round(ch / 2)
                      try {
                        const sm = (this.Cesium && this.Cesium.SceneTransforms) ? this.Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pos) : null
                        if (sm && sm.x != null && sm.y != null) { baseX = Math.round(sm.x); baseY = Math.round(sm.y) }
                      } catch (e) { /* ignore */ }

                      // determine perpendicular direction in screen-space
                      let perp = { x: 0, y: -1 }
                      try {
                        // try to project the edge endpoints; if available use them
                        const eps = (e && e.coords && e.coords.length === 2) ? e.coords : null
                        if (eps && eps.length === 2 && this.Cesium && this.Cesium.SceneTransforms) {
                          const p0 = this.Cesium.Cartesian3.fromDegrees(eps[0][1], eps[0][0], 0)
                          const p1 = this.Cesium.Cartesian3.fromDegrees(eps[1][1], eps[1][0], 0)
                          const s0 = this.Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p0)
                          const s1 = this.Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p1)
                          if (s0 && s1 && s0.x != null && s1.x != null) {
                            const dx = s1.x - s0.x, dy = s1.y - s0.y
                            // perpendicular
                            perp = { x: -dy, y: dx }
                            const len = Math.sqrt(perp.x * perp.x + perp.y * perp.y) || 1
                            perp.x /= len; perp.y /= len
                          }
                        }
                      } catch (e) { /* ignore */ }

                      const spacing = spacingPx || 18
                      const maxSteps = 4
                      let bestPick = null
                      let bestScore = Number.POSITIVE_INFINITY
                      // haversine helper
                      const haversine = (lat1, lon1, lat2, lon2) => {
                        const toRad = Math.PI / 180
                        const dLat = (lat2 - lat1) * toRad
                        const dLon = (lon2 - lon1) * toRad
                        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*toRad) * Math.cos(lat2*toRad) * Math.sin(dLon/2) * Math.sin(dLon/2)
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
                        return 6371000 * c
                      }

                      for (let step = 0; step <= maxSteps; step++) {
                        const offsets = (step === 0) ? [0] : [step, -step]
                        for (let oi = 0; oi < offsets.length; oi++) {
                          const o = offsets[oi]
                          const attemptX = Math.round(baseX + perp.x * spacing * o + (ox || 0))
                          const attemptY = Math.round(baseY + perp.y * spacing * o + (oy || 0))
                          let picked = null
                          try {
                            if (scene.globe && typeof this.viewer.camera.getPickRay === 'function' && typeof scene.globe.pick === 'function') {
                              const ray = this.viewer.camera.getPickRay({ x: attemptX, y: attemptY })
                              picked = scene.globe.pick(ray, scene)
                            }
                          } catch (e) { picked = null }
                          if (!picked) {
                            try { if (typeof scene.pickPosition === 'function') picked = scene.pickPosition({ x: attemptX, y: attemptY }) } catch (e) { picked = null }
                          }
                          if (picked) {
                            try {
                              const cart = this.Cesium.Cartographic.fromCartesian(picked)
                              const pickLat = cart.latitude * 180 / Math.PI
                              const pickLon = cart.longitude * 180 / Math.PI
                              const score = haversine(midLat, midLng, pickLat, pickLon)
                              if (score < bestScore) { bestScore = score; bestPick = picked }
                            } catch (e) { /* ignore */ }
                          }
                        }
                        // early out if we found a very close pick
                        if (bestScore < 40) break
                      }
                      // report pick sampling outcome even when not found
                      try { console.info('CesiumMap: pick-sampling result', { idx, bestScore: (bestScore === Number.POSITIVE_INFINITY ? null : bestScore), found: !!bestPick, forceMidpoint }) } catch (e) {}
                      // Only accept sampled picks when they are reasonably close to
                      // the geographic midpoint. Reject extremely distant picks
                      // which tend to appear when the raycast hits unrelated terrain
                      // features. PICK_ACCEPT_THRESHOLD is meters.
                      const PICK_ACCEPT_THRESHOLD = 10000 // 10 km
                      if (bestPick && !forceMidpoint && bestScore < PICK_ACCEPT_THRESHOLD) {
                        worldPos = bestPick
                        try { console.info('CesiumMap: multi-pick fallback used', { idx, bestScore }) } catch (e) {}
                      } else if (bestPick && bestScore >= PICK_ACCEPT_THRESHOLD) {
                        try { console.info('CesiumMap: pick ignored (too far)', { idx, bestScore }) } catch (e) {}
                      }
                    }
                  } catch (e) { /* non-fatal */ }
                } catch (err) { /* best-effort only */ }

                // If no pick or camera fallback produced a different worldPos,
                // try a hybrid perpendicular world-space fallback that offsets
                // the geographic midpoint along the local tangent perpendicular.
                try {
                  const needHybrid = (!screenMid || !screenMid.x) && worldPos && pos && (worldPos.x === pos.x && worldPos.y === pos.y && worldPos.z === pos.z)
                      if (needHybrid) {
                    try {
                      // geodetic normal at midpoint
                      const normal = this.Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos)
                      // compute approximate edge direction in world-space
                      let edgeDir = null
                      const eps = (e && e.coords && e.coords.length === 2) ? e.coords : null
                      if (eps && eps.length === 2) {
                        const p0 = this.Cesium.Cartesian3.fromDegrees(eps[0][1], eps[0][0], 0)
                        const p1 = this.Cesium.Cartesian3.fromDegrees(eps[1][1], eps[1][0], 0)
                        edgeDir = this.Cesium.Cartesian3.subtract(p1, p0, new this.Cesium.Cartesian3())
                        this.Cesium.Cartesian3.normalize(edgeDir, edgeDir)
                      }
                      // perpendicular on tangent plane
                      let perpVec = null
                      if (edgeDir) {
                        perpVec = this.Cesium.Cartesian3.cross(normal, edgeDir, new this.Cesium.Cartesian3())
                        this.Cesium.Cartesian3.normalize(perpVec, perpVec)
                      } else {
                        const east = this.Cesium.Cartesian3.cross(this.Cesium.Cartesian3.UNIT_Z, normal, new this.Cesium.Cartesian3())
                        this.Cesium.Cartesian3.normalize(east, east)
                        perpVec = this.Cesium.Cartesian3.cross(normal, east, new this.Cesium.Cartesian3())
                        this.Cesium.Cartesian3.normalize(perpVec, perpVec)
                      }

                      // metersPerPixel via camera if available
                      let metersPerPixel = 1
                      try {
                        const cam = this.viewer && this.viewer.camera
                        const canvas = this.viewer && this.viewer.scene && this.viewer.scene.canvas
                        if (cam && canvas) {
                          const camPos = cam.position || new this.Cesium.Cartesian3()
                          const vToMid = this.Cesium.Cartesian3.subtract(pos, camPos, new this.Cesium.Cartesian3())
                          const camDir = cam.direction || this.Cesium.Cartesian3.normalize(vToMid, new this.Cesium.Cartesian3())
                          const rangeAlongView = Math.max(1, Math.abs(this.Cesium.Cartesian3.dot(vToMid, camDir)))
                          const fovy = (cam.frustum && cam.frustum.fovy) ? cam.frustum.fovy : (Math.PI / 3)
                          metersPerPixel = (2 * rangeAlongView * Math.tan(fovy / 2)) / Math.max(1, (canvas.clientHeight || 1))
                        }
                      } catch (e) { metersPerPixel = 1 }

                      const offsetMeters = (spacingPx || 18) * (Math.abs(oy) > 0 ? Math.abs(oy) : 1) * metersPerPixel
                      const HYBRID_OFFSET_MAX = 5e6 // 5,000 km max offset
                      if (Math.abs(offsetMeters) > HYBRID_OFFSET_MAX) {
                        try { console.info('CesiumMap: hybrid-perp skipped (offset too large)', { idx, offsetMeters }) } catch (e) {}
                      } else {
                        const worldOffset = this.Cesium.Cartesian3.multiplyByScalar(new this.Cesium.Cartesian3(), offsetMeters, perpVec)
                        const hybridPos = this.Cesium.Cartesian3.add(pos, worldOffset, new this.Cesium.Cartesian3())
                        worldPos = hybridPos
                        try { console.info('CesiumMap: hybrid-perp fallback used', { idx, offsetMeters, hybridPos }) } catch (e) {}
                      }
                    } catch (err) { /* non-fatal */ }
                  }
                } catch (err) { /* non-fatal */ }

                // debug logging for placement
                try {
                  const debugPlacement = (this.props && this.props.debug && this.props.debug.geoEdgePlacement) || (typeof window !== 'undefined' && window.__CESIUM_EDGE_DEBUG)
                  if (debugPlacement) {
                    try {
                      console.info('CesiumMap: edge debug', { idx, relLabel, relTextRaw, relEmojiRaw, screenMid, ox, oy, placedRectsCount: placedRects.length })
                    } catch (e) {}
                  }
                } catch (e) {}
                // If emoji mode is requested and relationshipEmoji exists, render emoji billboard slightly left
                if ((edgeMode === 'emoji' || edgeMode === 'both') && relEmojiRaw) {
                  try {
                    const emoji = String(relEmojiRaw)
                    const fontPx = Math.max(24, Math.min(96, Math.round(28 * 1.6)))
                    const cvsSize = Math.max(48, Math.round(fontPx * 1.6))
                    const cvs = document.createElement('canvas'); cvs.width = cvsSize; cvs.height = cvsSize
                    const ctx = cvs.getContext('2d'); if (ctx) {
                      ctx.clearRect(0,0,cvsSize,cvsSize)
                      ctx.font = `${fontPx}px sans-serif`
                      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                      ctx.lineWidth = Math.max(4, Math.round(fontPx / 8))
                      ctx.strokeStyle = '#ffffff'
                      ctx.strokeText(emoji, cvsSize / 2, cvsSize / 2)
                      ctx.fillStyle = '#111'
                      ctx.fillText(emoji, cvsSize / 2, cvsSize / 2)
                    }
                    const img = cvs.toDataURL()
                    // place emoji billboard at the midpoint and rely on pixelOffset/horizontalOrigin
                    // to position it a few screen pixels left of the text. This keeps placement
                    // consistent across zoom/latitude instead of using degree offsets.
                    // use the computed worldPos (which may be the geographic
                    // midpoint or the camera-space adjusted point)
                    const emojiPos = worldPos
                    try {
                      // compute pixelOffset with vertical stacking applied. Prefer Cesium's
                      // SceneTransforms.wgs84ToWindowCoordinates to determine accurate screen coords.
                      const bbOffsetX = -12 + (ox || 0)
                      const bbOffsetY = (oy || 0)
                      const bb = this._billboardCollection && this._billboardCollection.add && this._billboardCollection.add({
                        position: emojiPos,
                        image: img,
                        scale: 0.3,
                        // shift the billboard a few pixels to the left of its anchor and align its origin to the right
                        pixelOffset: (this.Cesium && this.Cesium.Cartesian2) ? new this.Cesium.Cartesian2(bbOffsetX, bbOffsetY) : undefined,
                        horizontalOrigin: this.Cesium && this.Cesium.HorizontalOrigin ? this.Cesium.HorizontalOrigin.RIGHT : undefined,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                      })
                      if (bb) this._edgeEntities.push(bb)
                    } catch (e) {}
                    if (edgeMode === 'both' && relTextRaw) {
                      // text label at the same geographic midpoint; pixelOffset/horizontalOrigin
                      // will shift it a few screen pixels to the right so it appears after the emoji
                      const textPos = worldPos
                      const labelOffsetX = 12 + (ox || 0)
                      const labelOffsetY = (oy || 0)
                      const labelEnt = this.viewer.entities.add({
                        position: textPos,
                        label: {
                          text: String(relTextRaw) + (count > 1 ? ` x${count}` : ''),
                          font: '11px sans-serif',
                          fillColor: this.Cesium.Color.fromCssColorString ? this.Cesium.Color.fromCssColorString('#ffffff') : this.Cesium.Color.WHITE,
                          outlineColor: this.Cesium.Color.fromCssColorString ? this.Cesium.Color.fromCssColorString('#111111') : this.Cesium.Color.BLACK,
                          outlineWidth: 2,
                          style: this.Cesium.LabelStyle.FILL,
                          pixelOffset: (this.Cesium && this.Cesium.Cartesian2) ? new this.Cesium.Cartesian2(labelOffsetX, labelOffsetY) : undefined,
                          horizontalOrigin: this.Cesium && this.Cesium.HorizontalOrigin ? this.Cesium.HorizontalOrigin.LEFT : undefined
                        },
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                      })
                      if (labelEnt) this._edgeEntities.push(labelEnt)
                    }
                    // Emoji-only mode: if aggregating and count>1, place a small " xN" text to the right of the emoji
                    if (edgeMode === 'emoji' && count > 1) {
                      try {
                        const textPos = worldPos
                        const labelOffsetX = 12 + (ox || 0)
                        const labelOffsetY = (oy || 0)
                        const labelEnt2 = this.viewer.entities.add({
                          position: textPos,
                          label: {
                            text: ` x${count}`,
                            font: '11px sans-serif',
                            fillColor: this.Cesium.Color.fromCssColorString ? this.Cesium.Color.fromCssColorString('#ffffff') : this.Cesium.Color.WHITE,
                            outlineColor: this.Cesium.Color.fromCssColorString ? this.Cesium.Color.fromCssColorString('#111111') : this.Cesium.Color.BLACK,
                            outlineWidth: 2,
                            style: this.Cesium.LabelStyle.FILL,
                            pixelOffset: (this.Cesium && this.Cesium.Cartesian2) ? new this.Cesium.Cartesian2(labelOffsetX, labelOffsetY) : undefined,
                            horizontalOrigin: this.Cesium && this.Cesium.HorizontalOrigin ? this.Cesium.HorizontalOrigin.LEFT : undefined
                          },
                          disableDepthTestDistance: Number.POSITIVE_INFINITY
                        })
                        if (labelEnt2) this._edgeEntities.push(labelEnt2)
                      } catch (e) {}
                    }
                  } catch (e) {}
                } else {
                  try {
                    // For text-only mode, apply the same pixelOffset/horizontalOrigin
                    // stacking used by the 'both' mode so text-only placement
                    // matches the aligned emoji+text arrangement.
                    const labelOffsetX = (ox || 0)
                    const labelOffsetY = (oy || 0)
                    const labelEnt = this.viewer.entities.add({
                      position: worldPos,
                      label: {
                        text: String(relLabel) + (count > 1 ? ` x${count}` : ''),
                        font: '11px sans-serif',
                        // render white text with dark halo for visibility
                        fillColor: this.Cesium.Color.fromCssColorString ? this.Cesium.Color.fromCssColorString('#ffffff') : this.Cesium.Color.WHITE,
                        outlineColor: this.Cesium.Color.fromCssColorString ? this.Cesium.Color.fromCssColorString('#111111') : this.Cesium.Color.BLACK,
                        outlineWidth: 2,
                        style: this.Cesium.LabelStyle.FILL,
                        pixelOffset: (this.Cesium && this.Cesium.Cartesian2) ? new this.Cesium.Cartesian2(labelOffsetX, labelOffsetY) : undefined,
                        horizontalOrigin: this.Cesium && this.Cesium.HorizontalOrigin ? this.Cesium.HorizontalOrigin.CENTER : undefined
                      },
                      disableDepthTestDistance: Number.POSITIVE_INFINITY
                    })
                    if (labelEnt) this._edgeEntities.push(labelEnt)
                  } catch (e) { /* ignore label add errors */ }
                }
              } catch (err) {}
              })
            }
          } catch (err) {}
        }
      } catch (e) { console.warn('CesiumMap: edges render failed', e) }
    } catch (e) { console.warn('CesiumMap: render points failed', e) }
  }

  _applyTileSpec(spec) {
    try {
      if (!this.viewer || !this.Cesium) return
      const Cesium = this.Cesium
      const layers = this.viewer.imageryLayers
      if (!layers) return
      if (!this._removedDefaultLayer) {
        try {
          const firstLayer = layers.get && layers.get(0)
          if (firstLayer) layers.remove(firstLayer, true)
        } catch (e) {}
        this._removedDefaultLayer = true
      }
      if (this._baseImageryLayer) {
        try { layers.remove(this._baseImageryLayer, true) } catch (e) {}
        this._baseImageryLayer = null
      }
      this._currentTileId = spec && spec.id ? spec.id : null
      if (!spec || (!spec.url && !spec.cesiumProvider && !spec.cesiumIonAssetId)) {
        try {
          if (this.viewer.scene && this.viewer.scene.globe && Cesium.Color) {
            const color = Cesium.Color.fromCssColorString ? Cesium.Color.fromCssColorString('#101826') : Cesium.Color.DARK_GRAY
            this.viewer.scene.globe.baseColor = color
          }
        } catch (e) {}
        return
      }
      const provider = this._createImageryProviderFromSpec(spec)
      if (!provider) return
      try {
        this._baseImageryLayer = layers.addImageryProvider(provider, 0)
        if (this.viewer.scene && this.viewer.scene.globe && Cesium.Color) {
          this.viewer.scene.globe.baseColor = Cesium.Color.BLACK
        }
        if (this.viewer.scene && this.viewer.scene.requestRender) {
          this.viewer.scene.requestRender(true)
        }
      } catch (e) { console.warn('CesiumMap: adding imagery layer failed', e) }
    } catch (err) { console.warn('CesiumMap: apply tileSpec failed', err) }
  }

  _createImageryProviderFromSpec(spec) {
    try {
      const Cesium = this.Cesium
      if (!Cesium || !spec) return null
      if (typeof spec.cesiumProvider === 'function') {
        const provided = spec.cesiumProvider(Cesium, spec, this.props)
        if (provided) return provided
      }
      if (spec.cesiumIonAssetId) {
        try {
          if (spec.cesiumIonAccessToken && Cesium.Ion) {
            Cesium.Ion.defaultAccessToken = spec.cesiumIonAccessToken
          }
        } catch (e) {}
        if (Cesium.IonImageryProvider) {
          return new Cesium.IonImageryProvider({ assetId: spec.cesiumIonAssetId, accessToken: spec.cesiumIonAccessToken })
        }
      }
      if (spec.url && Cesium.UrlTemplateImageryProvider) {
        const options = { url: spec.url }
        if (spec.subdomains) options.subdomains = Array.isArray(spec.subdomains) ? spec.subdomains : String(spec.subdomains)
        if (spec.maxZoom != null) options.maximumLevel = spec.maxZoom
        if (spec.minZoom != null) options.minimumLevel = spec.minZoom
        if (spec.tileSize != null) { options.tileWidth = spec.tileSize; options.tileHeight = spec.tileSize }
        if (spec.attribution) {
          try {
            if (Cesium.Credit && Cesium.Credit.fromHtml) {
              options.credit = Cesium.Credit.fromHtml(spec.attribution)
            } else {
              options.credit = spec.attribution
            }
          } catch (e) { options.credit = spec.attribution }
        }
        return new Cesium.UrlTemplateImageryProvider(options)
      }
    } catch (e) { console.warn('CesiumMap: create imagery provider failed', e) }
    return null
  }

  render() {
    const { width = '100%', height = '100%' } = this.props
    return (<div style={{ width, height }} ref={this.container} />)
  }
}

CesiumMap.propTypes = {
  nodes: PropTypes.array,
  edges: PropTypes.array,
  width: PropTypes.string,
  height: PropTypes.string,
  ui: PropTypes.object,
  tileSpec: PropTypes.object
}
