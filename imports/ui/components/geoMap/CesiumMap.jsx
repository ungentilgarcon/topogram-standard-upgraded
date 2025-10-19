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
    import('cesium').then((mod) => {
      try {
        const Cesium = mod && (mod.default || mod)
        try { if (typeof window !== 'undefined' && !window.CESIUM_BASE_URL) window.CESIUM_BASE_URL = '' } catch (e) {}
        const el = this.container.current
        const Viewer = Cesium && (Cesium.Viewer || (Cesium && Cesium.default && Cesium.default.Viewer))
        if (!Viewer) return
        this.Cesium = Cesium
        this.viewer = new Viewer(el, { animation: false, timeline: false })
        this._renderPoints()
      } catch (err) { console.warn('CesiumMap: init error', err) }
    }).catch((err) => {
      // Some bundlers (Meteor) try to evaluate ESM files which may contain
      // `import.meta` and fail when evaluated in a non-module runtime. Fall
      // back to loading the Cesium UMD bundle from CDN and initialize from
      // the global `window.Cesium` object.
      console.warn('CesiumMap: dynamic import failed', err)
      // If error mentions import.meta, try CDN fallback
      const msg = err && err.message ? String(err.message) : ''
      if (msg.includes('import.meta') || msg.includes('may only appear in a module') || msg.includes('Unexpected token')) {
        this._loadCesiumFromCdn().then((Cesium) => {
          try {
            this.Cesium = Cesium || (typeof window !== 'undefined' ? window.Cesium : null)
            const el = this.container.current
            const Viewer = this.Cesium && (this.Cesium.Viewer || (this.Cesium && this.Cesium.default && this.Cesium.default.Viewer))
            if (!Viewer) { console.warn('CesiumMap: CDN Cesium loaded but Viewer not found'); return }
            this.viewer = new Viewer(el, { animation: false, timeline: false })
            this._renderPoints()
          } catch (e) { console.warn('CesiumMap: init after CDN load failed', e) }
        }).catch((e) => { console.warn('CesiumMap: CDN fallback failed', e) })
      }
    })
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
        const cssHref = 'https://unpkg.com/cesium@' + (require('../../../../package.json').dependencies.cesium || 'latest') + '/Build/Cesium/Widgets/widgets.css'
        const scriptSrcBase = 'https://unpkg.com/cesium@' + (require('../../../../package.json').dependencies.cesium || 'latest') + '/Build/Cesium'
        const scriptSrc = scriptSrcBase + '/Cesium.js'
        // set CESIUM_BASE_URL so Cesium can find its static assets
        try { window.CESIUM_BASE_URL = scriptSrcBase } catch (e) {}

        // inject CSS
        if (!document.querySelector('link[data-cesium-cdn]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = cssHref
          link.setAttribute('data-cesium-cdn', '1')
          document.head.appendChild(link)
        }

        // inject script
        if (document.querySelector('script[data-cesium-cdn]')) {
          // script already present, wait for Cesium to be available
          const waitFor = () => { if (window.Cesium) resolve(window.Cesium); else setTimeout(waitFor, 200) }
          waitFor()
          return
        }
        const s = document.createElement('script')
        s.src = scriptSrc
        s.async = true
        s.setAttribute('data-cesium-cdn', '1')
        s.onload = () => { if (window.Cesium) resolve(window.Cesium); else reject(new Error('Cesium loaded but window.Cesium missing')) }
        s.onerror = (e) => reject(new Error('Cesium script load failed'))
        document.body.appendChild(s)
      } catch (e) { reject(e) }
    })
  }

  componentDidUpdate(prevProps) { if (this.props.nodes !== prevProps.nodes) this._renderPoints() }

  componentWillUnmount() {
    try { if (this.viewer && this.viewer.destroy) this.viewer.destroy() } catch (e) {}
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

      const billboardCollection = new Cesium.BillboardCollection()
      this._billboardCollection = billboardCollection
      primitives.add(billboardCollection)

      const lats = []
      const lngs = []
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
          // create a small canvas texture for the billboard
          const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 16
          const ctx = cvs.getContext('2d'); if (ctx) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(8,8,6,0,Math.PI*2); ctx.fill() }
          const image = cvs.toDataURL()
          const cart = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
          billboardCollection.add({ position: cart, image })
        } catch (e) { console.warn('CesiumMap: point add failed', e) }
      })

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
