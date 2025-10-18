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
    let maplibregl = null
    try {
      maplibregl = require('maplibre-gl')
    } catch (e) { maplibregl = null }
    if (!maplibregl) return

    try {
      const { width, height } = this.props
      const el = this.container.current
      // create map
      this.map = new maplibregl.Map({
        container: el,
        style: this.props.style || 'https://demotiles.maplibre.org/style.json',
        center: this.props.center || [0, 0],
        zoom: typeof this.props.zoom === 'number' ? this.props.zoom : 2
      })
      this.map.on('load', () => { this._renderMarkers() })
    } catch (err) {
      console.warn('MapLibreMap: failed to initialize maplibre', err)
    }
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
    const maplibregl = require('maplibre-gl')
    const { nodes } = this.props
    try {
      (nodes || []).forEach(n => {
        try {
          const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
          const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
          if (!isFinite(lat) || !isFinite(lng)) return
          const el = document.createElement('div')
          el.style.width = '10px'; el.style.height = '10px'; el.style.borderRadius = '50%'
          el.style.background = (n && n.data && n.data.color) || '#1f2937'
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
