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
          const el = this._mountEl || this.container.current
          const Viewer = this.Cesium && (this.Cesium.Viewer || (this.Cesium && this.Cesium.default && this.Cesium.default.Viewer))
          if (!Viewer) { console.warn('CesiumMap: CDN Cesium loaded but Viewer not found'); return }
          try { if (this.container && this.container.current) {
            try { const prev = this.container.current.querySelector('[data-cesium-mount]'); if (prev) prev.remove() } catch (e) {}
              this._mountEl = document.createElement('div'); this._mountEl.setAttribute('data-cesium-mount', '1');
              this._mountEl.style.position = 'absolute'; this._mountEl.style.top='0'; this._mountEl.style.left='0'; this._mountEl.style.width='100%'; this._mountEl.style.height='100%'; this._mountEl.style.zIndex='1000'; this._mountEl.style.pointerEvents='auto'; this.container.current.appendChild(this._mountEl)
          } } catch (e) {}
          this.viewer = new Viewer(el, { animation: false, timeline: false })
          try { this._renderPoints() } catch (e) {}
          // Ensure Cesium's canvas is sized and visible inside the mount element
          try {
            const canvas = (this.viewer && this.viewer.scene && this.viewer.scene.canvas) || (this.viewer && this.viewer.canvas) || null
            if (canvas) {
              try { canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block'; canvas.style.zIndex = '1000' } catch (e) {}
              try { console.info('CesiumMap: canvas size', canvas.clientWidth, canvas.clientHeight) } catch (e) {}
            } else {
              try { console.warn('CesiumMap: viewer canvas not found') } catch (e) {}
            }
          } catch (e) {}
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
          const el = this._mountEl || this.container.current
          const Viewer = Cesium && (Cesium.Viewer || (Cesium && Cesium.default && Cesium.default.Viewer))
          if (!Viewer) return
          this.Cesium = Cesium
          this.viewer = new Viewer(el, { animation: false, timeline: false })
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
  try { console.info('CesiumMap: loading Cesium from CDN', scriptSrc) } catch (e) {}
  const s = document.createElement('script')
  s.src = scriptSrc
  s.async = true
  s.setAttribute('data-cesium-cdn', '1')
  try { s.crossOrigin = 'anonymous' } catch (e) {}
  s.onload = () => { if (window.Cesium) resolve(window.Cesium); else reject(new Error('Cesium loaded but window.Cesium missing')) }
  s.onerror = (e) => reject(new Error('Cesium script load failed'))
  document.body.appendChild(s)
      } catch (e) { reject(e) }
    })
  }

  componentDidUpdate(prevProps) { if (this.props.nodes !== prevProps.nodes) this._renderPoints() }

  componentWillUnmount() {
    try { if (this.viewer && this.viewer.destroy) this.viewer.destroy() } catch (e) {}
    try { if (this.container && this.container.current) this.container.current.innerHTML = '' } catch (e) {}
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

      // Prefer PointPrimitiveCollection which supports color and pixelSize
      let pointCollection = null
      try {
        pointCollection = new Cesium.PointPrimitiveCollection()
      } catch (e) {
        pointCollection = null
      }
      if (pointCollection) {
        this._pointCollection = pointCollection
        primitives.add(pointCollection)
      } else {
        const billboardCollection = new Cesium.BillboardCollection()
        this._billboardCollection = billboardCollection
        primitives.add(billboardCollection)
      }

      const lats = []
      const lngs = []
      console.info('CesiumMap: rendering', nodes.length, 'nodes')
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
          if (this._pointCollection) {
            try {
              const c = Cesium.Color.fromCssColorString ? Cesium.Color.fromCssColorString(color) : Cesium.Color.WHITE
              this._pointCollection.add({ position: cart, color: c, pixelSize: 10 })
            } catch (e) {
              // fallback to canvas billboard if color->Cesium.Color conversion fails
              const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 16
              const ctx = cvs.getContext('2d'); if (ctx) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(8,8,6,0,Math.PI*2); ctx.fill() }
              const image = cvs.toDataURL()
              try { this._billboardCollection && this._billboardCollection.add && this._billboardCollection.add({ position: cart, image }) } catch (e2) {}
            }
          } else if (this._billboardCollection) {
            // create a small canvas texture for the billboard
            const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 16
            const ctx = cvs.getContext('2d'); if (ctx) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(8,8,6,0,Math.PI*2); ctx.fill() }
            const image = cvs.toDataURL()
            try { this._billboardCollection.add({ position: cart, image }) } catch (e) {}
          }
        } catch (e) { console.warn('CesiumMap: point add failed', e) }
      })

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
    } catch (e) { console.warn('CesiumMap: render points failed', e) }
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
  height: PropTypes.string
}
