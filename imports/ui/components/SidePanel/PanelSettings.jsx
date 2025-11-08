import React, { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useSubscribe, useFind } from 'meteor/react-meteor-data'
import { Topograms } from '/imports/api/collections'

import PanelSelector from './panelSelector/PanelSelector.jsx'

import NetworkOptions from './networkOptions/NetworkOptions.jsx'
import Settings from './settings/Settings.jsx'
import AboutDialog from '/imports/ui/components/AboutDialog/AboutDialog.jsx'
import Button from '@mui/material/Button'

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
}) => {
  // route id -> attempt to load the topogram doc so we can show graph_desc
  const { id: routeId } = useParams()
  // subscribe to the topogram publication (harmless if parent already subscribes)
  useSubscribe('topogram', routeId)
  const tops = useFind(() => {
    if (!routeId) return Topograms.find({ _id: '__none__' })
    return Topograms.find({ _id: routeId })
  }, [routeId])
  const top = (Array.isArray(tops) && tops.length) ? tops[0] : null
  const graphDesc = top && (top.graph_desc || top.description || top.desc || (top.data && (top.data.graph_desc || top.data.description))) ? (top.graph_desc || top.description || top.desc || (top.data && (top.data.graph_desc || top.data.description))) : ''

  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <span>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#2e7d32' }}>Settings</div>
      {/* Legend toggle placed at top of the settings panel for quick access */}
      <div>
        <button
          aria-pressed={(typeof window !== 'undefined' && typeof window._topoLegendVisible !== 'undefined') ? !!window._topoLegendVisible : (window.localStorage ? window.localStorage.getItem('topo.legendVisible') === 'true' : false)}
          onClick={() => {
            try {
              const cur = (typeof window !== 'undefined' && typeof window._topoLegendVisible !== 'undefined') ? !!window._topoLegendVisible : (window.localStorage ? window.localStorage.getItem('topo.legendVisible') === 'true' : false)
              const next = !cur
              try { window.localStorage && window.localStorage.setItem('topo.legendVisible', String(next)) } catch (e) {}
              try { if (typeof window !== 'undefined') window._topoLegendVisible = next } catch (e) {}
              window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { legendVisible: next } }))
            } catch (e) { console.warn('toggle legendVisible failed', e) }
          }}
          style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
        >
          {(typeof window !== 'undefined' && typeof window._topoLegendVisible !== 'undefined') ? (window._topoLegendVisible ? 'Hide Legend' : 'Show Legend') : ((window.localStorage && window.localStorage.getItem('topo.legendVisible') === 'true') ? 'Hide Legend' : 'Show Legend')}
        </button>
        {/* About this map button - opens a dialog rendering markdown from Topogram.graph_desc */}
        <button
          onClick={() => { console.debug && console.debug('SidePanel About clicked', routeId || topogramId); setAboutOpen(true) }}
          style={{ marginLeft: 8, background: '#2e7d32', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
        >
          About this map
        </button>
      </div>
    </div>

    {/* View show/hide buttons (show or hide the actual panes) */}
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
    </div>
    {/* Second row: Selection, Charts, Debug */}
    <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
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
        aria-pressed={typeof window !== 'undefined' && (typeof window._topoChartsVisible !== 'undefined' ? !!window._topoChartsVisible : (window.localStorage ? window.localStorage.getItem('topo.chartsVisible') === 'true' : false))}
        onClick={() => {
          try {
            // prefer in-memory window flag if present, otherwise fall back to localStorage
            const cur = (typeof window !== 'undefined' && typeof window._topoChartsVisible !== 'undefined') ? !!window._topoChartsVisible : (window.localStorage ? window.localStorage.getItem('topo.chartsVisible') === 'true' : false)
            const next = !cur
            // persist toggle to localStorage so the button label stays consistent
            try { window.localStorage && window.localStorage.setItem('topo.chartsVisible', String(next)) } catch (e) {}
            // update in-memory flag so other components reading it immediately reflect the change
            try { if (typeof window !== 'undefined') window._topoChartsVisible = next } catch (e) {}
            window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { chartsVisible: next } }))
          } catch (e) { console.warn('toggle chartsVisible failed', e) }
        }}
        style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        { (typeof window !== 'undefined' && (typeof window._topoChartsVisible !== 'undefined' ? !!window._topoChartsVisible : (window.localStorage && window.localStorage.getItem('topo.chartsVisible') === 'true'))) ? 'Hide Charts' : 'Show Charts' }
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

    {/* Geomap options panel removed; consolidated into NetworkOptions */}
    <NetworkOptions hasGeoInfo={hasGeoInfo} />
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
    {/* Shared About dialog - use centralized component */}
    <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} markdown={graphDesc} />
  </span>
  )
}

export default PanelSettings
