import React from 'react'
import PropTypes from 'prop-types'
import { MapContainer, TileLayer, ScaleControl, ZoomControl, Pane } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'
import './GeoMap.css'

import mapTiles from './mapTiles'
import GeoNodes from './GeoNodes.jsx'
import GeoEdges from './GeoEdges.jsx'
// Optional alternatives
let MapLibreMap = null
let CesiumMap = null
try { MapLibreMap = require('./MapLibreMap.jsx').default } catch (e) { MapLibreMap = null }
try { CesiumMap = require('./CesiumMap.jsx').default } catch (e) { CesiumMap = null }

const MAP_DIV_ID = 'map'
// Use relative positioning so the map fills its wrapper instead of being fixed to the viewport
const divMapStyle = {
  position: 'relative',
  zIndex: 0
}

export default class GeoMap extends React.Component {

  constructor(props) {
    super(props)
    this.state = {
      zoom : 2.4,
      position : [20.505, 22],
      mapRef: null
    }
    this._tileErrorCount = 0
    this._lastTileKey = null
  }

  static propTypes = {
    nodes : PropTypes.array,
    edges : PropTypes.array,
    width : PropTypes.string.isRequired,
    height : PropTypes.string.isRequired,
    selectElement : PropTypes.func.isRequired,
    unselectElement : PropTypes.func.isRequired,
    onFocusElement: PropTypes.func.isRequired,
    onUnfocusElement: PropTypes.func.isRequired,
    ui: PropTypes.object
  }

  handleClickGeoElement({ group, el }) {
    // Toggle selection based on the UI's known selectedElements set instead
    // of querying Cytoscape. This allows GeoMap to work even when `cy` is not
    // passed in the ui prop (common when map runs in its own pane).
    if (!el || !el.data) return
    const selected = (this.props.ui && this.props.ui.selectedElements) ? this.props.ui.selectedElements : []
    const selectedNodeIds = new Set(
      selected.filter(e => e && e.group === 'nodes' && e.data && e.data.id != null).map(e => String(e.data.id))
    )
    const selectedEdgeIds = new Set(
      selected.filter(e => e && e.group === 'edges' && e.data && e.data.id != null).map(e => String(e.data.id))
    )
    const selectedEdgePairs = new Set(
      selected.filter(e => e && e.group === 'edges' && e.data && e.data.source != null && e.data && e.data.target != null).map(e => `${String(e.data.source)}|${String(e.data.target)}`)
    )

    if (group === 'edge') {
      const edgeId = el.data.id != null ? String(el.data.id) : undefined
      const pairKey = (el.data && el.data.source != null && el.data && el.data.target != null) ? `${String(el.data.source)}|${String(el.data.target)}` : undefined
      const isSelected = (edgeId ? selectedEdgeIds.has(edgeId) : false) || (pairKey ? selectedEdgePairs.has(pairKey) : false) || !!el.data.selected
      const geoEdgeJson = {
        data: Object.assign({}, el.data, { id: edgeId || pairKey, source: el.data && el.data.source, target: el.data && el.data.target }),
        group: 'edges',
        _id: el._id
      }
      return isSelected ? this.props.unselectElement(geoEdgeJson) : this.props.selectElement(geoEdgeJson)
    }

    // node
    const nodeId = el.data.id != null ? String(el.data.id) : (el._id != null ? String(el._id) : undefined)
    if (!nodeId) return
    const isSelected = selectedNodeIds.has(nodeId) || !!el.data.selected
    // Clone node data and remove any accidental edge-like fields so the
    // canonicalKey in the parent treats this as a node, not an edge.
    const nodeData = Object.assign({}, el.data, { id: nodeId })
    try { delete nodeData.source } catch (_) {}
    try { delete nodeData.target } catch (_) {}
    const geoNodeJson = {
      data: nodeData,
      group: 'nodes',
      _id: el._id
    }
    return isSelected ? this.props.unselectElement(geoNodeJson) : this.props.selectElement(geoNodeJson)
  }

  render() {
    const nodesById = {}

    const {
      geoMapTile,
      isolateMode,
      cy
    } = this.props.ui || {}

    const {
      zoom,
      position
    } = this.state

    const {
      width,
      height,
      onFocusElement,
      onUnfocusElement
    } = this.props

  const containerStyle = Object.assign({}, divMapStyle, { height, width, display: 'block' })

    const selected = (this.props.ui && this.props.ui.selectedElements) ? this.props.ui.selectedElements : []
    const selectedNodeIds = new Set(
      selected.filter(e => e && e.group === 'nodes' && e.data && e.data.id != null).map(e => e.data.id)
    )
    const selectedEdgeIds = new Set(
      selected
        .filter(e => e && e.group === 'edges' && e.data && e.data.id != null)
        .map(e => String(e.data.id))
    )
    const selectedEdgePairs = new Set(
      selected
        .filter(e => e && e.group === 'edges' && e.data && e.data.source != null && e.data.target != null)
        .map(e => `${String(e.data.source)}|${String(e.data.target)}`)
    )

    const nodes = (this.props.nodes || [])
      .map( n => {
        const lat = parseFloat(n.data.lat)
        const lng = parseFloat(n.data.lng)
        if (!isFinite(lat) || !isFinite(lng)) return null
        const coords = [lat, lng]
        const isSelected = selectedNodeIds.has(n.data.id) || !!n.data.selected
        const node = { ...n, data: { ...n.data, selected: isSelected }, coords }
        nodesById[n.data.id] = node
        return node
      })
      .filter(Boolean)

    const edges = (this.props.edges || [])
      .map( e => {
        const source = nodesById[e.data.source]
        const target = nodesById[e.data.target]
        if (!source || !target) return null
        const coords = [source.coords, target.coords]
        const edgeId = e && e.data && e.data.id != null ? String(e.data.id) : undefined
        const pairKey = `${String(e.data.source)}|${String(e.data.target)}`
        const isSelected = (edgeId ? selectedEdgeIds.has(edgeId) : false) || selectedEdgePairs.has(pairKey) || !!e.data.selected
        return { ...e, source, target, coords, selected: isSelected, data: { ...e.data, selected: isSelected, id: edgeId || pairKey } }
      })
      .filter(Boolean)

    const tileSpec = (mapTiles[geoMapTile] || mapTiles.default)
    const {
      url,
      attribution,
      minZoom,
      maxZoom,
      subdomains: specSubdomains,
      tms: specTms
    } = tileSpec
    const fallbackAttribution = '© OpenStreetMap contributors'
    const tileAttribution = attribution || fallbackAttribution
    const tileKey = `${geoMapTile || 'default'}:${url || 'none'}`
    if (this._lastTileKey !== tileKey) {
      this._tileErrorCount = 0
      this._lastTileKey = tileKey
    }

    const chevOn = (!this.props.ui || this.props.ui.showChevrons !== false)
    const panelOpen = !!(this.props.ui && this.props.ui.filterPanelIsOpen)
    const controlPos = panelOpen ? 'bottomleft' : 'bottomright'
    // Choose renderer: default -> leaflet, 'maplibre' -> MapLibreMap (if available), 'cesium' -> CesiumMap (if available)
    const renderer = (this.props.ui && this.props.ui.geoMapRenderer) ? String(this.props.ui.geoMapRenderer) : 'leaflet'
    if (renderer === 'maplibre' && MapLibreMap) {
      return (
        <div id={MAP_DIV_ID} style={containerStyle}>
          <MapLibreMap
            nodes={nodes}
            edges={edges}
            ui={this.props.ui}
            width={width}
            height={height}
            handleClickGeoElement={(e) => this.handleClickGeoElement(e)}
            center={position}
            zoom={zoom}
            style={tileSpec && tileSpec.maplibreStyle}
          />
        </div>
      )
    }
    if (renderer === 'cesium' && CesiumMap) {
      return (
        <div id={MAP_DIV_ID} style={containerStyle}>
          <CesiumMap nodes={nodes} edges={edges} ui={this.props.ui} width={width} height={height} />
        </div>
      )
    }

    // Fallback: Leaflet (existing implementation)
    return (
      <div id={MAP_DIV_ID} style={containerStyle}>
        <MapContainer
          key={`map-${chevOn ? 'with' : 'no'}-chev`}
          center={position}
          zoom={zoom}
          zoomSnap={0.25}
          zoomDelta={0.25}
          zoomControl={false}
          whenCreated={(map) => { this._map = map; this.setState({ mapRef: map }) }}
        >
          {
            edges.length ? (
              <Pane name="edgesPane" style={{ zIndex: 600 }}>
                <GeoEdges
                  key={`geoedges-${(!this.props.ui || this.props.ui.showChevrons !== false) ? 'with' : 'no'}-chev`}
                  edges={edges}
                   ui={this.props.ui}
                  map={this.state.mapRef}
                  isolateMode={false}
                  handleClickGeoElement={(e) => this.handleClickGeoElement(e)}
                  onFocusElement={onFocusElement}
                  onUnfocusElement={onUnfocusElement}
                />
              </Pane>
            ) : null
          }
          {
            nodes.length ? (
              <Pane name="nodesPane" style={{ zIndex: 650 }}>
                <GeoNodes
                  key={`geonodes-${selectedNodeIds.size}`}
                  nodes={nodes}
                   ui={this.props.ui}
                  isolateMode={false}
                  handleClickGeoElement={(e) => this.handleClickGeoElement(e)}
                  onFocusElement={onFocusElement}
                  onUnfocusElement={onUnfocusElement}
                />
              </Pane>
            ) : null
          }
          {url ? (
            <TileLayer
              url={url}
              attribution={tileAttribution}
              minZoom={minZoom}
              maxZoom={maxZoom}
              crossOrigin={'anonymous'}
              subdomains={specSubdomains}
              errorTileUrl={"data:image/gif;base64,R0lGODlhAQABAAAAACw="}
              detectRetina={false}
              tms={specTms}
              eventHandlers={{
                tileerror: () => {
                  this._tileErrorCount += 1
                  if (this._tileErrorCount >= 6) {
                    try { console.warn('Tile errors detected; falling back to default base map') } catch(e) {}
                    this.props.updateUI && this.props.updateUI('geoMapTile', 'default')
                    this._tileErrorCount = 0
                  }
                }
              }}
            />
          ) : null}
          <ScaleControl position={controlPos} />
          <ZoomControl position={controlPos} />
        </MapContainer>
      </div>
    )
  }
}
