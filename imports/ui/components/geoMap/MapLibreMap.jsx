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
        this.map.on('load', () => { this._renderMarkers() })
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
          this.map.on('load', () => { this._renderMarkers() })
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
      this._clearMarkers(); this._renderMarkers()
    }
  }

  componentWillUnmount() {
    this._clearMarkers()
    try { if (this.map && this.map.remove) this.map.remove() } catch (e) {}
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
      (nodes || []).forEach(n => {
        try {
          const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
          const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
          if (!isFinite(lat) || !isFinite(lng)) return
          const el = document.createElement('div')
          el.style.width = '10px'; el.style.height = '10px'; el.style.borderRadius = '50%'
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
        } catch (e) {}
      })
    } catch (e) { console.warn('MapLibreMap: marker render failed', e) }
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
