import React from 'react'

// Minimal PanelSelector fallback used by PanelSettings to show which panels are available
export default function PanelSelector({ hasTimeInfo=false, hasGeoInfo=false }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      <div style={{ padding: '6px 8px', background: '#f1f1f1', borderRadius: 4 }}>Timeline {hasTimeInfo ? '(available)' : '(none)'}</div>
      <div style={{ padding: '6px 8px', background: '#f1f1f1', borderRadius: 4 }}>Map {hasGeoInfo ? '(available)' : '(none)'}</div>
    </div>
  )
}
