import React from 'react'
import PropTypes from 'prop-types'
// Import the explicit JSX module to avoid ambiguous resolver picking a CSS/asset
import GeoMap from './geoMap/GeoMap.jsx'

export default function TopogramGeoMap(props) {
  const { nodes, edges, ui, width='50vw', height='100%', selectElement, unselectElement, onFocusElement, onUnfocusElement, updateUI } = props
  // Defensive runtime check: module imports sometimes resolve to a module
  // namespace object { default: Component } instead of the component itself.
  // Resolve that case and ensure we only try to render functions/classes.
  const GeoMapComp = (GeoMap && (GeoMap.default || GeoMap));
  // Diagnostics: log the shapes of imports to help track down invalid-element errors
  try {
    console.debug('TopogramGeoMap imports', {
      GeoMapType: typeof GeoMap,
      GeoMapKeys: GeoMap && Object.keys(GeoMap).slice(0,10),
      GeoMapDefaultType: GeoMap && typeof GeoMap.default,
      GeoMapCompType: typeof GeoMapComp,
      MapContainerType: typeof (typeof window !== 'undefined' && require('react-leaflet') ? require('react-leaflet').MapContainer : undefined),
      GeoNodesType: typeof GeoNodes,
      GeoEdgesType: typeof GeoEdges
    })
  } catch (e) { try { console.warn('TopogramGeoMap: diagnostics failed', e) } catch (e2) {} }
  const isComponent = (c) => typeof c === 'function';
  if (!isComponent(GeoMapComp)) {
    try { console.error('TopogramGeoMap: GeoMap import is not a React component', { GeoMap }); } catch (e) {}
    return (
      <div style={{ width, height, position: 'relative', color: 'white', padding: 12, background: '#600' }}>
        <strong>GeoMap component failed to load.</strong>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Check console for details. (TopogramGeoMap could not render map.)
        </div>
      </div>
    )
  }

  return (
    <div style={{ width, height, position: 'relative' }}>
      <GeoMapComp
        nodes={nodes}
        edges={edges}
        width={width}
        height={height}
        selectElement={selectElement}
        unselectElement={unselectElement}
        onFocusElement={onFocusElement}
        onUnfocusElement={onUnfocusElement}
        ui={ui}
        updateUI={updateUI}
      />
    </div>
  )
}

TopogramGeoMap.propTypes = {
  nodes: PropTypes.array,
  edges: PropTypes.array,
  ui: PropTypes.object,
  selectElement: PropTypes.func,
  unselectElement: PropTypes.func,
  onFocusElement: PropTypes.func,
  onUnfocusElement: PropTypes.func,
  updateUI: PropTypes.func
}
