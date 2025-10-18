import React, { useEffect, forwardRef } from 'react'
import PropTypes from 'prop-types'

// Minimal Cytoscape wrapper stub. This does not implement real Cytoscape.
// It provides a `cyCallback` with a minimal adapter object so existing code
// that expects updateUI('cy', adapter) doesn't crash during migration.

const Cytoscape = forwardRef((props, ref) => {
  const { elements, cyCallback } = props

  useEffect(() => {
    const adapter = {
      impl: 'cy-mock',
      elements: elements || { nodes: [], edges: [] },
      getCy() { return adapter },
      nodes() { return adapter.elements.nodes || [] },
      edges() { return adapter.elements.edges || [] },
      on() {}, off() {}, resize() {}, fit() {}, add() {}, remove() {},
      select() {}, unselect() {}, filter() { return [] }
    }
    if (typeof cyCallback === 'function') cyCallback(adapter)
    return () => {
      if (adapter && adapter.destroy) adapter.destroy()
    }
  }, [elements, cyCallback])

  return (
    <div style={{ width: props.width || '100%', height: props.height || '100%', background: '#fff' }}>
      {/* Cytoscape placeholder - real renderer not mounted */}
    </div>
  )
})

Cytoscape.propTypes = {
  elements: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  cyCallback: PropTypes.func,
  init: PropTypes.bool,
  style: PropTypes.object,
  layoutName: PropTypes.string,
  nodeRadius: PropTypes.number,
  width: PropTypes.string,
  height: PropTypes.string
}

export default Cytoscape
