import React from 'react'
import PropTypes from 'prop-types'
import { FeatureGroup, CircleMarker } from 'react-leaflet'

export default class GeoNodes extends React.Component {

  static propTypes = {
    nodes : PropTypes.array.isRequired,
    isolateMode : PropTypes.bool,
    handleClickGeoElement : PropTypes.func.isRequired,
    onFocusElement : PropTypes.func.isRequired,
    onUnfocusElement : PropTypes.func.isRequired
  }


  render() {
    const {
      isolateMode,
      handleClickGeoElement,
      onFocusElement,
      onUnfocusElement
    } = this.props

    const nodes = this.props.nodes.map((n,i) => {
      return (
        <CircleMarker
          radius={n.data.weight? n.data.weight > 100? 167 : n.data.weight*5: 3}
          key={`node-${i}`}

          center={n.coords}
          opacity={0.8}
          color={n.data.selected ? 'yellow' : n.data.color ? n.data.color : 'steelblue'}
          eventHandlers={{
            click: () => { if (!isolateMode) handleClickGeoElement({ group: 'node', el: n }) },
            mousedown: () => { if (isolateMode) onFocusElement(n) },
            mouseup: () => { if (isolateMode) onUnfocusElement() }
          }}
        />
      )
    })

    return (
      <FeatureGroup name="Nodes"
        pane="nodesPane"
        ref={el => { this._nodesGroup = el }}>
        {nodes}
      </FeatureGroup>
    )
  }
}
