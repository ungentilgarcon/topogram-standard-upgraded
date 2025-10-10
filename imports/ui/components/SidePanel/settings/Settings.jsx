import React from 'react'

export default function Settings({ topogramId, topogramTitle, topogramSharedPublic, router }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Author settings</div>
      <div style={{ marginTop: 4 }}>{topogramTitle || 'Untitled'}</div>
    </div>
  )
}
