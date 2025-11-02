import React, { useState } from 'react'
import PanelSettings from './PanelSettings'

export default function SidePanelWrapper({ geoMapVisible=false, networkVisible=true, hasGeoInfo=false }) {
  const [open, setOpen] = useState(false)
  const panelStyle = {
    position: 'fixed',
    top: 8,
    right: 8,
    zIndex: 3000,
    transition: 'width 180ms ease, height 180ms ease, opacity 180ms ease',
    pointerEvents: 'auto'
  }
  const collapsedStyle = {
    width: 40,
    height: 40,
    overflow: 'visible'
  }
  const expandedStyle = {
    width: 320,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: 'rgba(255,255,255,0.98)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
    borderRadius: 6,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12
  }

  const handleStyle = {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#2e7d32',
    color: 'white',
    borderRadius: 6,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
  }

  return (
    <div
      style={{ ...panelStyle, ...(open ? expandedStyle : collapsedStyle) }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-hidden={false}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
        {/* Legend toggle (small) placed next to Settings */}
        <div
          style={{ ...handleStyle, background: '#1976D2' }}
          title={open ? 'Legend' : 'Open Legend'}
          onClick={(e) => {
            try {
              e.stopPropagation()
              const cur = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem('topo.legendVisible') === 'true' : false
              const next = !cur
              try { window.localStorage && window.localStorage.setItem('topo.legendVisible', String(next)) } catch (err) {}
              try { window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { legendVisible: next } })) } catch (err) {}
            } catch (err) {}
          }}
        >
          ℹ
        </div>
        <div style={handleStyle} title={open ? 'Settings' : 'Open settings'}>
          ⚙
        </div>
      </div>
      {open ? (
        <div style={{ marginTop: 48 }}>
          <PanelSettings geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={hasGeoInfo} />
        </div>
      ) : null}
    </div>
  )
}
