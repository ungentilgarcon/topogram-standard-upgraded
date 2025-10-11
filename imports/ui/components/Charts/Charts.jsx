import React from 'react'
import NodeCharts from '/imports/ui/components/NodeCharts/NodeCharts'

export default function Charts({ nodes = [] }) {
  return (
    <div className="charts-wrapper">
      <NodeCharts nodes={nodes} />
      {/* future: edge charts, timeline charts, etc. */}
    </div>
  )
}
