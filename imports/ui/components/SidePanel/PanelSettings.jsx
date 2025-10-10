import React from 'react'
import Subheader from 'material-ui/Subheader'

import PanelSelector from '../panelSelector/PanelSelector.jsx'

import NetworkOptions from '../networkOptions/NetworkOptions.jsx'
import GeoMapOptions from '../geoMapOptions/GeoMapOptions.jsx'
import Settings from '../settings/Settings.jsx'

const PanelSettings = ({
  geoMapVisible,
  authorIsLoggedIn,
  topogramId,
  topogramTitle,
  topogramIsPublic,
  hasTimeInfo,
  hasGeoInfo,
  router
}) => (
  <span>
    <Subheader>Settings</Subheader>

    {/* Quick toggles (green theme) to show/hide map and network panes */}
    <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
      <button
        aria-pressed={geoMapVisible}
        disabled={!hasGeoInfo}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.geoMapVisible') : null
            const next = cur === null ? false : !(cur === 'true')
            window.localStorage && window.localStorage.setItem('topo.geoMapVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { geoMapVisible: next } }))
          } catch (e) { console.warn('toggle geoMapVisible failed', e) }
        }}
        style={{ background: hasGeoInfo ? '#2e7d32' : '#bdbdbd', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: hasGeoInfo ? 'pointer' : 'not-allowed' }}
      >
        { hasGeoInfo ? 'Toggle GeoMap' : 'No Geo' }
      </button>

      <button
        aria-pressed={true}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.networkVisible') : null
            const next = cur === null ? false : !(cur === 'true')
            window.localStorage && window.localStorage.setItem('topo.networkVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { networkVisible: next } }))
          } catch (e) { console.warn('toggle networkVisible failed', e) }
        }}
        style={{ background: '#2e7d32', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        Toggle Network
      </button>
    </div>

    <PanelSelector
      // bottom={timeLineVisible ? '21vh' : '1em'}
      hasTimeInfo={ hasTimeInfo }
      hasGeoInfo={ hasGeoInfo }
    />

    { geoMapVisible ? <GeoMapOptions/> : null }
    <NetworkOptions/>
    {
      authorIsLoggedIn ?
      <Settings
        topogramId={topogramId}
        topogramTitle= {topogramTitle}
        topogramSharedPublic={topogramIsPublic}
        router={router}
      />
      :
      null
    }
  </span>
)

export default PanelSettings
