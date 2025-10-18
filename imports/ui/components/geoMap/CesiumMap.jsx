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
    let Cesium = null
    try { Cesium = require('cesium') } catch (e) { Cesium = null }
    if (!Cesium) return
    try {
      // Cesium requires a global window.CESIUM_BASE_URL for assets; set a sensible default
      try { if (typeof window !== 'undefined' && !window.CESIUM_BASE_URL) window.CESIUM_BASE_URL = '' } catch (e) {}
      const el = this.container.current
      // Create the viewer
      // Use the Cesium module's Viewer class if available
      const Viewer = Cesium && (Cesium.Viewer || (Cesium && Cesium.default && Cesium.default.Viewer))
      if (!Viewer) return
      this.viewer = new Viewer(el, { animation: false, timeline: false })
      this._renderPoints()
    } catch (err) { console.warn('CesiumMap: init failed', err) }
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
      // naive: remove all billboards and add new ones
      const nodes = this.props.nodes || []
      // remove existing
      try { primitives.removeAll() } catch (e) {}
      nodes.forEach(n => {
        try {
          const lat = Number((n && n.data && (n.data.lat || n.data.latitude)) || NaN)
          const lng = Number((n && n.data && (n.data.lng || n.data.longitude)) || NaN)
          if (!isFinite(lat) || !isFinite(lng)) return
          const color = (n && n.data && n.data.color) || '#1f2937'
          // create a simple point using a small canvas texture
          const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 16
          const ctx = cvs.getContext('2d'); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(8,8,6,0,Math.PI*2); ctx.fill()
          const image = cvs.toDataURL()
          const Cesium = require('cesium')
          const cart = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
          const billboardCollection = new Cesium.BillboardCollection()
          primitives.add(billboardCollection)
          billboardCollection.add({ position: cart, image })
        } catch (e) {}
      })
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
