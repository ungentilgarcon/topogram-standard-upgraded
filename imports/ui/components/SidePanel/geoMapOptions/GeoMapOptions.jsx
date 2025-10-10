import React from 'react'

export default function GeoMapOptions() {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>GeoMap options</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button style={{ padding: '6px 8px', borderRadius: 4 }}>Toggle Chevrons</button>
        <button style={{ padding: '6px 8px', borderRadius: 4 }}>Tile Source</button>
      </div>
    </div>
  )
}
