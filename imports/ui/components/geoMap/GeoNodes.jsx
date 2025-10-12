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
      const visualRadius = n.data.weight ? (n.data.weight > 100 ? 167 : n.data.weight * 5) : 3
      const hitRadius = Math.max(visualRadius, 10)
      const color = n.data.selected ? 'yellow' : (n.data.color ? n.data.color : 'steelblue')
      return (
        <React.Fragment key={`node-${i}`}>
          {/* visual marker */}
          <CircleMarker
            radius={visualRadius}
            center={n.coords}
            opacity={0.8}
            color={color}
            eventHandlers={{
              click: () => { if (!isolateMode) handleClickGeoElement({ group: 'node', el: n }) },
              mousedown: () => { if (isolateMode) onFocusElement(n) },
              mouseup: () => { if (isolateMode) onUnfocusElement() }
            }}
          />
          {/* invisible larger hit area to improve clickability for small markers */}
          {hitRadius > visualRadius ? (
            <CircleMarker
              radius={hitRadius}
              center={n.coords}
              // Make this invisible but explicitly interactive so Leaflet
              // reliably dispatches click events even for very small visual markers
              stroke={false}
              fillOpacity={0.01}
              fillColor={color}
              interactive={true}
              eventHandlers={{
                click: () => { if (!isolateMode) handleClickGeoElement({ group: 'node', el: n }) },
                mousedown: () => { if (isolateMode) onFocusElement(n) },
                mouseup: () => { if (isolateMode) onUnfocusElement() }
              }}
            />
          ) : null}
        </React.Fragment>
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
