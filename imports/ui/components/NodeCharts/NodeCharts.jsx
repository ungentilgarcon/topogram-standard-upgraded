import React, { useMemo } from 'react'

function Bar({ label, value, max }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="chart-bar">
      <div className="chart-bar-label">{label}</div>
      <div className="chart-bar-track"><div className="chart-bar-fill" style={{ width: `${pct}%` }} /></div>
      <div className="chart-bar-value">{value}</div>
    </div>
  )
}

export default function NodeCharts({ nodes = [] }) {
  const data = useMemo(() => nodes.map(n => ({ id: n.data && (n.data.id || n._id), label: n.data && (n.data.label || n.data.name || n.data.id), value: Number(n.data && (n.data.weight || 1)) || 1 })), [nodes])
  const max = data.reduce((m, d) => Math.max(m, d.value || 0), 0)

  return (
    <div className="node-charts">
      <strong>Node weights</strong>
      <div className="chart-list">
        {data.map(d => <Bar key={d.id} label={d.label || d.id} value={d.value} max={max} />)}
      </div>
    </div>
  )
}
