import React from 'react'
import PropTypes from 'prop-types'
import GeoMap from './geoMap/GeoMap'

export default function TopogramGeoMap(props) {
  const { nodes, edges, ui, width='50vw', height='600px', selectElement, unselectElement, onFocusElement, onUnfocusElement } = props
  return (
    <div style={{ width, height, position: 'relative' }}>
      <GeoMap
        nodes={nodes}
        edges={edges}
        width={width}
        height={height}
        selectElement={selectElement}
        unselectElement={unselectElement}
        onFocusElement={onFocusElement}
        onUnfocusElement={onUnfocusElement}
        ui={ui}
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
  onUnfocusElement: PropTypes.func
}
