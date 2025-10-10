import React from 'react'

// Minimal NetworkOptions fallback for PanelSettings
export default function NetworkOptions() {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Network options</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button style={{ padding: '6px 8px', borderRadius: 4 }}>Toggle Labels</button>
        <button style={{ padding: '6px 8px', borderRadius: 4 }}>Force Layout</button>
      </div>
    </div>
  )
}
