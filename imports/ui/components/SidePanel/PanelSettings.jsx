import React from 'react'

import PanelSelector from './panelSelector/PanelSelector.jsx'

import NetworkOptions from './networkOptions/NetworkOptions.jsx'
import GeoMapOptions from './geoMapOptions/GeoMapOptions.jsx'
import Settings from './settings/Settings.jsx'

const PanelSettings = ({
  geoMapVisible,
  networkVisible,
  authorIsLoggedIn,
  topogramId,
  topogramTitle,
  topogramIsPublic,
  hasTimeInfo,
  hasGeoInfo,
  router
}) => (
  <span>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#2e7d32', marginBottom: 8 }}>Settings</div>

    {/* Option buttons (open the options panels) */}
    <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
      <button
        aria-pressed={false}
        disabled={!hasGeoInfo}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.geoMapOptionsVisible') : null
            const next = cur === 'true' ? false : true
            window.localStorage && window.localStorage.setItem('topo.geoMapOptionsVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { geoMapOptionsVisible: next } }))
          } catch (e) { console.warn('toggle geoMapOptionsVisible failed', e) }
        }}
        style={{ background: hasGeoInfo ? '#2e7d32' : '#bdbdbd', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: hasGeoInfo ? 'pointer' : 'not-allowed' }}
      >
        { hasGeoInfo ? 'Geomap options' : 'No Geo' }
      </button>

      <button
        aria-pressed={false}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.networkOptionsVisible') : null
            const next = cur === 'true' ? false : true
            window.localStorage && window.localStorage.setItem('topo.networkOptionsVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { networkOptionsVisible: next } }))
          } catch (e) { console.warn('toggle networkOptionsVisible failed', e) }
        }}
        style={{ background: '#2e7d32', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        Network options
      </button>
    </div>

    {/* View show/hide buttons (show or hide the actual GeoMap / Network panes) */}
    <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
      <button
        aria-pressed={geoMapVisible}
        disabled={!hasGeoInfo}
        onClick={() => {
          try {
            const next = !geoMapVisible
            window.localStorage && window.localStorage.setItem('topo.geoMapVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { geoMapVisible: next } }))
          } catch (e) { console.warn('toggle geoMapVisible failed', e) }
        }}
        style={{ background: hasGeoInfo ? '#1b5e20' : '#bdbdbd', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: hasGeoInfo ? 'pointer' : 'not-allowed' }}
      >
        { geoMapVisible ? 'Hide GeoMap' : 'Show GeoMap' }
      </button>

      <button
        aria-pressed={typeof networkVisible !== 'undefined' ? networkVisible : (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.networkVisible') === 'true' : false)}
        onClick={() => {
          try {
            // prefer prop when provided, otherwise read current value from localStorage
            const cur = typeof networkVisible !== 'undefined' ? networkVisible : (window.localStorage ? window.localStorage.getItem('topo.networkVisible') === 'true' : false)
            const next = !cur
            window.localStorage && window.localStorage.setItem('topo.networkVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { networkVisible: next } }))
          } catch (e) { console.warn('toggle networkVisible failed', e) }
        }}
        style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        { networkVisible ? 'Hide Network' : 'Show Network' }
      </button>

      {/* Timeline show/hide button */}
      <button
        aria-pressed={typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.timeLineVisible') === 'true' : true}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.timeLineVisible') === 'true' : true
            const next = !cur
            window.localStorage && window.localStorage.setItem('topo.timeLineVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { timeLineVisible: next } }))
          } catch (e) { console.warn('toggle timeLineVisible failed', e) }
        }}
        style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        { (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('topo.timeLineVisible') === 'true') ? 'Hide Timeline' : 'Show Timeline' }
      </button>
      {/* Selection panel show/hide button */}
      <button
        aria-pressed={typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.selectionPanelPinned') === 'true' : false}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.selectionPanelPinned') === 'true' : false
            const next = !cur
            window.localStorage && window.localStorage.setItem('topo.selectionPanelPinned', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { selectionPanelPinned: next } }))
          } catch (e) { console.warn('toggle selectionPanelPinned failed', e) }
        }}
        style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        { (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('topo.selectionPanelPinned') === 'true') ? 'Hide Selection' : 'Show Selection' }
      </button>
      {/* Debug show/hide button (default hidden) */}
      {/* Charts show/hide button (default hidden) */}
      <button
        aria-pressed={typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.chartsVisible') === 'true' : false}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.chartsVisible') === 'true' : false
            const next = !cur
            window.localStorage && window.localStorage.setItem('topo.chartsVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { chartsVisible: next } }))
          } catch (e) { console.warn('toggle chartsVisible failed', e) }
        }}
        style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        { (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('topo.chartsVisible') === 'true') ? 'Hide Charts' : 'Show Charts' }
      </button>

      <button
        aria-pressed={typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.debugVisible') === 'true' : false}
        onClick={() => {
          try {
            const cur = window.localStorage ? window.localStorage.getItem('topo.debugVisible') === 'true' : false
            const next = !cur
            window.localStorage && window.localStorage.setItem('topo.debugVisible', String(next))
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { debugVisible: next } }))
          } catch (e) { console.warn('toggle debugVisible failed', e) }
        }}
        style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        { (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('topo.debugVisible') === 'true') ? 'Hide Debug' : 'Show Debug' }
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
