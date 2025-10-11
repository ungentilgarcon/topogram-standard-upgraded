import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSubscribe, useFind } from 'meteor/react-meteor-data';
import { Topograms, Nodes, Edges } from '/imports/api/collections';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import TopogramGeoMap from '/imports/ui/components/TopogramGeoMap'
import SidePanelWrapper from '/imports/ui/components/SidePanel/SidePanelWrapper'
import TimeLine from '/imports/client/ui/components/timeLine/TimeLine.jsx'

cytoscape.use(cola);

export default function TopogramDetail() {
  const { id } = useParams();
  console.debug && console.debug('TopogramDetail rendered with id:', id);

  const isReadyTopogram = useSubscribe('topogram', id);
  const isReadyNodes = useSubscribe('nodes', id);
  const isReadyEdges = useSubscribe('edges', id);
  const isReady = () => isReadyTopogram() && isReadyNodes() && isReadyEdges();

  const tops = useFind(() => Topograms.find({ _id: id }), [id]);
  // Publications may return documents where the topogramId lives at
  // top-level or nested under `data.topogramId`. Query both places so
  // Minimongo picks up the docs the server published.
  const nodes = useFind(() => {
    const q = { $or: [{ topogramId: id }, { 'data.topogramId': id }] };
    return Nodes.find(q);
  }, [id]);
  const edges = useFind(() => {
    const q = { $or: [{ topogramId: id }, { 'data.topogramId': id }] };
    return Edges.find(q);
  }, [id]);

  console.debug && console.debug('TopogramDetail isReady:', isReady(), 'tops.length:', tops.length, 'nodes.length:', nodes.length, 'edges.length:', edges.length);

  // --- Debug: log first few documents even when we short-circuit to Loading…
  // This runs early so the browser console will show a sample of documents
  // even if subscriptions are not yet fully ready.
  try {
    const dbgTops = tops.slice(0, 3).map(t => ({ _id: t._id, title: t.title || t.name }));
    const dbgNodes = nodes.slice(0, 6).map(n => ({ _id: n._id, id: n.id || (n.data && n.data.id), name: n.name || n.label || (n.data && n.data.name), topogramId: n.topogramId || (n.data && n.data.topogramId) }));
    const dbgEdges = edges.slice(0, 6).map(e => ({ _id: e._id, source: e.source || (e.data && e.data.source), target: e.target || (e.data && e.data.target) }));
    // Use console.log (more visible) so this will show even when debug level is hidden
    console && console.log && console.log('TopogramDetail sample docs', { dbgTops, dbgNodes, dbgEdges });
  } catch (err) {
    console.error('TopogramDetail debug panel error:', err);
  }
  // UI state/hooks must come before any early return to keep hook order stable
  // UI state: allow the user to override the layout (or choose 'auto' to use computed)
  const [selectedLayout, setSelectedLayout] = useState('auto')
  // Node title font size (px)
  const [titleSize, setTitleSize] = useState(12)
  // Keep a ref to the Cytoscape instance so we can trigger layouts on demand
  const cyRef = useRef(null)
  // Selected elements shared between Cytoscape and GeoMap
  const [selectedElements, setSelectedElements] = useState([])
  // Panel visibility flags (persisted in localStorage and controllable from PanelSettings)
  // Initialize to safe defaults and sync from localStorage once on mount to avoid
  // reading window during hook initialization (helps keep hook order stable under HMR).
  const [geoMapVisible, setGeoMapVisible] = useState(false)
  const [networkVisible, setNetworkVisible] = useState(true)
  const [timeLineVisible, setTimeLineVisible] = useState(true)
  const [debugVisible, setDebugVisible] = useState(false)

  // Helper: canonical key for an element JSON (node or edge)
  const canonicalKey = (json) => {
    if (!json || !json.data) return null
    const d = json.data
    // node vs edge detection: edges typically have source/target
    if (d.source != null || d.target != null) {
      const id = d.id != null ? String(d.id) : `${String(d.source)}|${String(d.target)}`
      return `edge:${id}`
    }
    const id = d.id != null ? String(d.id) : (json._id != null ? String(json._id) : null)
    return id ? `node:${id}` : null
  }

  const isSelectedKey = (key) => selectedElements.some(e => canonicalKey(e) === key)

  // selectElement/unselectElement are used by GeoMap (and can be used programmatically)
  const selectElement = (json) => {
    const key = canonicalKey(json)
    if (!key) return
    if (isSelectedKey(key)) return
    setSelectedElements(prev => [...prev, json])
    // ensure Cytoscape selection visual state
    try {
      const cy = cyRef.current
      if (cy) {
        if (key.startsWith('node:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          const el = cy.filter(`node[id='${id}']`)
          if (el && el.length) el.select()
        } else if (key.startsWith('edge:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          let el = cy.filter(`edge[id='${id}']`)
          if (!el || el.length === 0) {
            // try source/target pair
            const parts = id.split('|')
            if (parts.length === 2) {
              const s = parts[0].replace(/"/g, '\\"').replace(/'/g, "\\'")
              const t = parts[1].replace(/"/g, '\\"').replace(/'/g, "\\'")
              el = cy.$(`edge[source = "${s}"][target = "${t}"]`)
            }
          }
          if (el && el.length) el.select()
        }
      }
    } catch (e) {
      console.warn('selectElement: cy selection failed', e)
    }
  }

  const unselectElement = (json) => {
    const key = canonicalKey(json)
    if (!key) return
    setSelectedElements(prev => prev.filter(e => canonicalKey(e) !== key))
    try {
      const cy = cyRef.current
      if (cy) {
        if (key.startsWith('node:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          const el = cy.filter(`node[id='${id}']`)
          if (el && el.length) el.unselect()
        } else if (key.startsWith('edge:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          let el = cy.filter(`edge[id='${id}']`)
          if (!el || el.length === 0) {
            const parts = id.split('|')
            if (parts.length === 2) {
              const s = parts[0].replace(/"/g, '\\"').replace(/'/g, "\\'")
              const t = parts[1].replace(/"/g, '\\"').replace(/'/g, "\\'")
              el = cy.$(`edge[source = "${s}"][target = "${t}"]`)
            }
          }
          if (el && el.length) el.unselect()
        }
      }
    } catch (e) {
      console.warn('unselectElement: cy unselect failed', e)
    }
  }

  // Keep Cytoscape event listeners in sync with state: when cy instance appears, attach select/unselect handlers
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const onSelect = (evt) => {
      try {
        const json = evt.target.json()
        // normalize json to include group for GeoMap expectations
        const j = Object.assign({}, json)
        j.group = evt.target.isNode ? 'nodes' : 'edges'
        selectElement(j)
      } catch (e) { console.warn('cy select handler error', e) }
    }
    const onUnselect = (evt) => {
      try {
        const json = evt.target.json()
        const j = Object.assign({}, json)
        j.group = evt.target.isNode ? 'nodes' : 'edges'
        unselectElement(j)
      } catch (e) { console.warn('cy unselect handler error', e) }
    }
    cy.on('select', 'node, edge', onSelect)
    cy.on('unselect', 'node, edge', onUnselect)
    // apply any currently selectedElements onto cy visuals
    try {
      selectedElements.forEach(se => {
        const key = canonicalKey(se)
        if (!key) return
        if (key.startsWith('node:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          const el = cy.filter(`node[id='${id}']`)
          if (el && el.length) el.select()
        } else if (key.startsWith('edge:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          const el = cy.filter(`edge[id='${id}']`)
          if (el && el.length) el.select()
        }
      })
    } catch (e) {}

    return () => {
      try { cy.removeListener('select', onSelect); cy.removeListener('unselect', onUnselect) } catch (e) {}
    }
  }, [cyRef.current])

  // Listen for panel toggle events dispatched by PanelSettings
  useEffect(() => {
    const handler = (evt) => {
      try {
        const d = evt && evt.detail
        if (!d) return
        if (typeof d.geoMapVisible === 'boolean') setGeoMapVisible(d.geoMapVisible)
        if (typeof d.networkVisible === 'boolean') setNetworkVisible(d.networkVisible)
        if (typeof d.timeLineVisible === 'boolean') setTimeLineVisible(d.timeLineVisible)
        if (typeof d.debugVisible === 'boolean') setDebugVisible(d.debugVisible)
      } catch (e) { console.warn('panelToggle handler error', e) }
    }
    window.addEventListener('topo:panelToggle', handler)
    return () => window.removeEventListener('topo:panelToggle', handler)
  }, [])

  // Sync visibility flags from localStorage once on mount. This avoids reading
  // window.localStorage during hook initializers and reduces HMR-related hook-order
  // mismatches that can occur when modules are hot-reloaded.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const g = window.localStorage.getItem('topo.geoMapVisible')
        const n = window.localStorage.getItem('topo.networkVisible')
        const t = window.localStorage.getItem('topo.timeLineVisible')
        if (g !== null) setGeoMapVisible(g === 'true')
        if (n !== null) setNetworkVisible(n !== 'false')
        if (t !== null) setTimeLineVisible(t === 'true')
      }
    } catch (e) { /* ignore */ }
  }, [])

  // Detect if nodes carry time information (common legacy fields: start/end/time/date)
  const hasTimeInfo = nodes.some(n => {
    if (!n || !n.data) return false
    const d = n.data
    return (!!d.start || !!d.end || !!d.time || !!d.date || !!d.from || !!d.to)
  })

  // Minimal UI state and updater used by the legacy TimeLine component.
  const [timelineUI, setTimelineUI] = useState(() => ({
    minTime: null,
    maxTime: null,
    valueRange: [null, null]
  }))

  const updateUI = (a, b) => {
    // Accept either (key, value) or (object)
    if (typeof a === 'string') {
      const key = a
      let value = b
      // normalize Date -> ms
      if (value instanceof Date) value = value.getTime()
      setTimelineUI(prev => ({ ...prev, [key]: value }))
      return
    }
    if (typeof a === 'object' && a !== null) {
      const obj = Object.assign({}, a)
      // convert date-like fields to ms
      if (obj.minTime instanceof Date) obj.minTime = obj.minTime.getTime()
      if (obj.maxTime instanceof Date) obj.maxTime = obj.maxTime.getTime()
      if (Array.isArray(obj.valueRange)) obj.valueRange = obj.valueRange.map(v => (v instanceof Date ? v.getTime() : v))
      setTimelineUI(prev => ({ ...prev, ...obj }))
      return
    }
  }

  // Helper visible within the component so both the elements builder and
  // geo-node builder can reuse the same timeline filtering logic.
  const isNodeInRange = (node) => {
    const activeRange = (timelineUI && Array.isArray(timelineUI.valueRange) && timelineUI.valueRange[0] != null && timelineUI.valueRange[1] != null)
      ? [Number(timelineUI.valueRange[0]), Number(timelineUI.valueRange[1])] : null
    if (!activeRange) return true
    if (!node || !node.data) return false
    const fields = ['start','end','time','date','from','to']
    for (const f of fields) {
      const v = node.data[f]
      if (v == null) continue
      const t = (typeof v === 'number') ? v : (new Date(v)).getTime()
      if (!Number.isFinite(t)) continue
      if (t >= activeRange[0] && t <= activeRange[1]) return true
    }
    return false
  }

  // Initialize timeline UI min/max when nodes change and time info is present
  useEffect(() => {
    if (!hasTimeInfo || !nodes || nodes.length === 0) return
    const times = []
    nodes.forEach(n => {
      if (!n || !n.data) return
      const d = n.data
      const pushIf = (v) => {
        if (v == null) return
        const t = (typeof v === 'number') ? v : (new Date(v)).getTime()
        if (Number.isFinite(t)) times.push(t)
      }
      pushIf(d.start)
      pushIf(d.end)
      pushIf(d.time)
      pushIf(d.date)
      pushIf(d.from)
      pushIf(d.to)
    })
    if (!times.length) return
    const min = Math.min(...times)
    const max = Math.max(...times)
    setTimelineUI(prev => ({
      minTime: prev.minTime || min,
      maxTime: prev.maxTime || max,
      valueRange: (Array.isArray(prev.valueRange) && prev.valueRange[0] != null && prev.valueRange[1] != null) ? prev.valueRange : [min, max]
    }))
    // Debug: log the numeric defaults we will apply (so console shows numbers, not closures)
    try { console.info('TOPOGRAM: TopogramDetail will apply timeline defaults', { min, max, valueRange: [min, max], nodesCount: nodes.length }) } catch (e) {}
  }, [nodes.length])

  // When timeline panel is visible, bump the leaflet control bottom offset so controls don't overlap
  useEffect(() => {
    const visible = hasTimeInfo && timeLineVisible && timelineUI && timelineUI.minTime != null && timelineUI.maxTime != null
    const el = typeof document !== 'undefined' ? document.getElementById('timeline-panel') : null
    const height = el ? el.offsetHeight : (visible ? 120 : 10)
    try { document.documentElement.style.setProperty('--timeline-offset', `${height + 12}px`) } catch (e) {}
    return () => {
      // do not reset here; keep the offset until next change
    }
  }, [hasTimeInfo, timelineUI.minTime, timelineUI.maxTime, timeLineVisible])

  // (stylesheet will be built after we compute numeric weights from nodes)

  // When selectedLayout, node/edge counts or titleSize change, trigger the Cytoscape layout if we have an instance.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const hasPositions = nodes.some(n => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number')
    // determine layout name: auto -> preset when positions exist otherwise cola
    const name = selectedLayout === 'auto' ? (hasPositions ? 'preset' : 'cola') : selectedLayout
    const layoutObj = (() => {
      if (name === 'preset') return { name: 'preset' }
      if (name === 'cola') return { name: 'cola', nodeSpacing: 5, avoidOverlap: true, randomize: true, maxSimulationTime: 1500 }
      return { name }
    })()
    try {
      const runLayout = cy.layout(layoutObj)
      runLayout.run()
      // fit after layout completes
      runLayout.on && runLayout.on('layoutstop', () => { try { cy.fit(); } catch (e) {} })
      setTimeout(() => { try { cy.fit(); } catch (e) {} }, 150)
    } catch (err) {
      console.warn('failed to run cy layout', err)
    }
  }, [selectedLayout, nodes.length, edges.length, titleSize])

  // When view visibility changes, ensure Cytoscape fits its container when visible
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    try {
      // small timeout to let layout/DOM stabilize
      setTimeout(() => { if (cy && cy.fit && networkVisible) cy.fit() }, 80)
    } catch (e) {}
  }, [networkVisible, geoMapVisible])

  // If the document is already present in the client cache (for example because
  // we published all topograms on the list page), render immediately instead
  // of waiting for subscriptions to report ready. This avoids an infinite
  // loading state when the per-id publication has type/format mismatches.
  if (!isReady() && tops.length === 0) return <div>Loading…</div>;
  const top = tops && tops.length ? tops[0] : null;

  if (!top) {
    return (
      <div style={{ padding: 12 }}>
        <p>Topogram not found.</p>
        <p><Link to="/">Back to list</Link></p>
      </div>
    );
  }

  // Build cytoscape elements and pick a layout. If nodes include saved
  // positions (node.position = { x,y }) use the 'preset' layout so
  // positions are respected. Otherwise fall back to a cola layout.
  const { elements, layout } = (() => {
    // Choose the visualization id (vizId) as node.data.id when present
    // (legacy dataset uses data.id as the stable identifier); fall back
    // to the Mongo _id otherwise. Build a lookup that maps many possible
    // candidate strings to the vizId so edges referencing different
    // forms can be resolved.
      const nodeMap = new Map()
      nodes.forEach(node => {
        const vizId = node.data && node.data.id ? String(node.data.id) : String(node._id)
        // Only index nodes that are within the active timeline range
        if (!isNodeInRange(node)) return
        const candidates = new Set()
        candidates.add(vizId)
        candidates.add(String(node._id))
        if (node.id) candidates.add(String(node.id))
        if (node.data && node.data.id) candidates.add(String(node.data.id))
        if (node.data && node.data.name) candidates.add(String(node.data.name))
        if (node.name) candidates.add(String(node.name))
        // map each candidate key -> vizId
        candidates.forEach(k => nodeMap.set(k, vizId))
      })

      // map nodes into cytoscape node elements (id = vizId)
      const nodeEls = nodes.map(node => {
        // skip nodes outside range
        if (!isNodeInRange(node)) return null
        const vizId = nodeMap.get(String((node.data && node.data.id) || node.id || node._id)) || String(node._id)
        const label = (node.data && (node.data.name || node.data.label)) || node.name || node.label || node.id
        // pick a color from several commonly-used fields in legacy docs
        const color = (node.data && (node.data.color || node.data.fillColor || node.data.fill || node.data.backgroundColor || node.data.bg || node.data.colour || node.data.hex))
        const rawWeight = node.data && (node.data.weight || (node.data.rawData && node.data.rawData.weight))
        const data = { id: String(vizId), label, weight: rawWeight, topogramId: node.topogramId || (node.data && node.data.topogramId), rawWeight }
        if (color != null) data.color = color
        const el = { data }
        // If the node document contains a saved position, pass it through
        // to Cytoscape as `position: { x, y }` so the 'preset' layout works.
        if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
          el.position = { x: node.position.x, y: node.position.y }
        }
        return el
      }).filter(Boolean)

      // map edges and attempt to resolve their endpoints against nodeMap
      const edgeEls = edges.map(edge => {
        const rawSrc = (edge.data && (edge.data.source || edge.data.from)) || edge.source || edge.from
        const rawTgt = (edge.data && (edge.data.target || edge.data.to)) || edge.target || edge.to
        const srcKey = rawSrc != null ? String(rawSrc) : null
        const tgtKey = rawTgt != null ? String(rawTgt) : null
        const resolvedSrc = srcKey ? nodeMap.get(srcKey) : null
        const resolvedTgt = tgtKey ? nodeMap.get(tgtKey) : null
        if (!resolvedSrc || !resolvedTgt) {
          // unresolved endpoints — skip this edge to avoid invalid Cytoscape entries
          return null
        }
        // accept an explicit color on edges too (common variants)
        const ecolor = (edge.data && (edge.data.color || edge.data.strokeColor || edge.data.lineColor))
        const data = { id: String(edge._id), source: String(resolvedSrc), target: String(resolvedTgt) }
        if (ecolor != null) data.color = ecolor
        return { data }
      }).filter(Boolean)

      const allEls = [...nodeEls, ...edgeEls]
      const hasPositions = nodeEls.some(n => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number')
      const layout = hasPositions
        ? { name: 'preset' }
        : { name: 'cola', nodeSpacing: 5, avoidOverlap: true, randomize: true, maxSimulationTime: 1500 }
      return { elements: allEls, layout }
    })()

    // A compact key derived from the active timeline range so we can force
    // remounting Cytoscape when the user changes the slider. Some versions
    // of react-cytoscapejs/Cytoscape don't always diff elements reliably, so
    // forcing a remount is a simple reliable solution.
    const timelineKey = (timelineUI && Array.isArray(timelineUI.valueRange) && timelineUI.valueRange[0] != null && timelineUI.valueRange[1] != null)
      ? `tl:${timelineUI.valueRange[0]}-${timelineUI.valueRange[1]}`
      : `tl:all`;

  // normalize and map weights into node data and build stylesheet using min/max
  // Helper: normalize weight string by detecting repeating units
  const normalizeWeight = (raw) => {
    if (raw == null) return 1
    if (typeof raw === 'number') return raw
    let s = String(raw).trim()
    if (s === '') return 1
    // if purely numeric string and reasonably sized, parse it
    if (/^\d+$/.test(s)) {
      // detect smallest repeating unit
      const len = s.length
      for (let unit = 1; unit <= Math.floor(len/2); unit++) {
        if (len % unit !== 0) continue
        const candidate = s.slice(0, unit)
        if (candidate.repeat(len / unit) === s) {
          const num = Number(candidate)
          if (!Number.isNaN(num)) return num
        }
      }
      // otherwise, if the number is very long, take first up to 6 digits
      if (s.length > 6) s = s.slice(0, 6)
      const n = Number(s)
      return Number.isFinite(n) ? n : 1
    }
    // try to extract leading digits
    const m = s.match(/(\d+)/)
    if (m) return Number(m[1])
    return 1
  }

  // attach normalized numeric weight into node elements (data.weight)
  elements.forEach(el => {
    // node elements have data.id and do NOT have data.source/data.target
    if (el.data && el.data.id && (el.data.source == null && el.data.target == null)) {
      const raw = el.data.weight != null ? el.data.weight : el.data.rawWeight
      const w = normalizeWeight(raw)
      el.data.weight = w
    }
  })

  // compute min/max from normalized weights
  const numericWeights = elements.filter(el => el.data && el.data.id && (el.data.source == null && el.data.target == null)).map(el => Number(el.data.weight || 1))
  const minW = numericWeights.length ? Math.min(...numericWeights) : 1
  const maxW = numericWeights.length ? Math.max(...numericWeights) : (minW + 1)
  const stylesheet = [
    { selector: 'node', style: { 'label': 'data(label)', 'background-color': '#666', 'text-valign': 'center', 'color': '#fff', 'text-outline-width': 2, 'text-outline-color': '#000', 'width': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'height': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'font-size': `${titleSize}px` } },
    { selector: 'node[color]', style: { 'background-color': 'data(color)' } },
    { selector: 'edge', style: { 'width': 1, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'target-arrow-shape': 'triangle' } },
    { selector: 'edge[color]', style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)' } }
  ]

    

  return (
    <div style={{ padding: 12, paddingBottom: 'var(--timeline-offset, 12px)' }}>
      <h1>{top.title || top.name || 'Topogram'}</h1>
      {top.description ? <p>{top.description}</p> : null}
      <p><Link to="/">Back to list</Link></p>
      {/* controls row */}

      <div style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Layout:
          <select value={selectedLayout} onChange={e => setSelectedLayout(e.target.value)}>
            <option value="auto">auto</option>
            <option value="preset">preset</option>
            <option value="cola">cola</option>
            <option value="grid">grid</option>
            <option value="breadthfirst">breadthfirst</option>
            <option value="random">random</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Title size:
          <input type="range" min={8} max={36} value={titleSize} onChange={e => setTitleSize(Number(e.target.value))} />
          <span style={{ minWidth: 36, textAlign: 'right' }}>{titleSize}px</span>
        </label>
      </div>

      {/* If geo is present, render a split view: network on left, map on right */}
      {/** Decide if any node has geo coords **/}
          {
            (() => {
          // Helper to detect lat/lng in node.data under common legacy fields
          const extractLatLng = (n) => {
            if (!n || !n.data) return null
            const d = n.data
            const candidates = [ ['lat','lng'], ['latitude','longitude'], ['lat','lon'], ['lat','lng'] ]
            for (const [la,lo] of candidates) {
              if (d[la] != null && d[lo] != null) {
                const lat = Number(d[la])
                const lng = Number(d[lo])
                if (isFinite(lat) && isFinite(lng)) return [lat,lng]
              }
            }
            // Check nested geo.coordinates arrays like data.location.coordinates [lng,lat] or data.geo.coordinates [lng,lat]
            const coords = (d.location && d.location.coordinates) || (d.geo && d.geo.coordinates) || d.coordinates
            if (Array.isArray(coords) && coords.length >= 2) {
              const maybeLng = Number(coords[0])
              const maybeLat = Number(coords[1])
              if (isFinite(maybeLat) && isFinite(maybeLng)) return [maybeLat, maybeLng]
            }
            // direct fields
            if (d.lat != null && d.lng != null) {
              const lat = Number(d.lat), lng = Number(d.lng)
              if (isFinite(lat) && isFinite(lng)) return [lat,lng]
            }
            return null
          }

          const nodesWithGeo = nodes.map(n => ({ n, coords: extractLatLng(n) })).filter(x => x.coords)
          const hasGeo = nodesWithGeo.length > 0
          if (!hasGeo) {
            // No geo data: show network if enabled, otherwise a placeholder
            if (!networkVisible) {
              return (
                <div style={{ width: '100%', height: '600px', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div>Both views hidden — use the settings panel to show Network or GeoMap.</div>
                </div>
              )
            }
            return (
              <div style={{ width: '100%', height: '600px', border: '1px solid #ccc' }}>
                <CytoscapeComponent
                  key={timelineKey}
                  elements={elements}
                  style={{ width: '100%', height: '100%' }}
                  layout={layout}
                  stylesheet={stylesheet}
                  cy={(cy) => {
                    try { cyRef.current = cy } catch (e) {}
                    try { setTimeout(() => { if (cy && cy.fit) cy.fit(); }, 50) } catch (err) { console.warn('cy.fit() failed', err) }
                  }}
                />
              </div>
            )
          }

          // build a lightweight geo-nodes/edges list matching the structures expected by TopogramGeoMap
          // We'll derive coords into node.data.lat/lng and attach data.selected based on elements selection if any
          // Filter geo nodes to match the active timeline range as well
          const geoNodes = nodesWithGeo.map(({n, coords}) => ({ n, coords })).filter(x => isNodeInRange(x.n)).map(({n, coords}) => ({ ...n, data: { ...n.data, lat: coords[0], lng: coords[1] } }))
          // For edges, attempt to resolve endpoints via data.source/data.target or top-level source/target
          const geoEdges = edges.map(e => {
            const rawSrc = (e.data && (e.data.source || e.data.from)) || e.source || e.from
            const rawTgt = (e.data && (e.data.target || e.data.to)) || e.target || e.to
            const srcKey = rawSrc != null ? String(rawSrc) : null
            const tgtKey = rawTgt != null ? String(rawTgt) : null
            // try to find nodes by id fields
            const findNodeBy = (key) => geoNodes.find(n => n.data && (String(n.data.id) === String(key) || String(n._id) === String(key) || String(n.id) === String(key) || String(n.data && n.data.name) === String(key)))
            const s = srcKey ? findNodeBy(srcKey) : null
            const t = tgtKey ? findNodeBy(tgtKey) : null
            if (!s || !t) return null
            return { ...e, data: { ...e.data, source: s.data.id || s._id, target: t.data.id || t._id } }
          }).filter(Boolean)

          // Decide layout depending on visibility flags
          const both = networkVisible && geoMapVisible
          const onlyNetwork = networkVisible && !geoMapVisible
          const onlyMap = !networkVisible && geoMapVisible

          if (both) {
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: '50%', height: '600px', border: '1px solid #ccc' }}>
                  <CytoscapeComponent
                    key={timelineKey}
                    elements={elements}
                    style={{ width: '100%', height: '100%' }}
                    layout={layout}
                    stylesheet={stylesheet}
                    cy={(cy) => { try { cyRef.current = cy } catch (e) {} try { setTimeout(() => { if (cy && cy.fit) cy.fit(); }, 50) } catch (err) { console.warn('cy.fit() failed', err) } }}
                  />
                </div>
                <div style={{ width: '50%', height: '600px', border: '1px solid #ccc' }}>
                  <TopogramGeoMap
                    nodes={geoNodes}
                    edges={geoEdges}
                    ui={{ selectedElements }}
                    width={'50vw'}
                    height={'600px'}
                    selectElement={(json) => selectElement(json)}
                    unselectElement={(json) => unselectElement(json)}
                    onFocusElement={() => {}}
                    onUnfocusElement={() => {}}
                  />
                </div>
                <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
              </div>
            )
          }

          if (onlyNetwork) {
            return (
              <div style={{ width: '100%', height: '600px', border: '1px solid #ccc' }}>
                <CytoscapeComponent
                  key={timelineKey}
                  elements={elements}
                  style={{ width: '100%', height: '100%' }}
                  layout={layout}
                  stylesheet={stylesheet}
                  cy={(cy) => { try { cyRef.current = cy } catch (e) {} try { setTimeout(() => { if (cy && cy.fit) cy.fit(); }, 50) } catch (err) { console.warn('cy.fit() failed', err) } }}
                />
                <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
              </div>
            )
          }

          if (onlyMap) {
            return (
              <div style={{ width: '100%', height: '600px', border: '1px solid #ccc' }}>
                <TopogramGeoMap
                  nodes={geoNodes}
                  edges={geoEdges}
                  ui={{ selectedElements }}
                  width={'100%'}
                  height={'600px'}
                  selectElement={(json) => selectElement(json)}
                  unselectElement={(json) => unselectElement(json)}
                  onFocusElement={() => {}}
                  onUnfocusElement={() => {}}
                />
                <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
              </div>
            )
          }

          // Neither pane visible: show a placeholder with settings handle
          return (
            <div style={{ width: '100%', height: '600px', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div>Both views hidden — use the settings panel (top-right) to show them.</div>
              <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
            </div>
          )
        })()
      }

      {/* Timeline: render when this topogram appears to have time info */}
      { hasTimeInfo && timeLineVisible ? (
        <TimeLine hasTimeInfo={true} ui={timelineUI} updateUI={updateUI} />
      ) : null }

      {/* Debug panel (render last so it's below visual overlays) */}
      { debugVisible ? (
        <div style={{ marginTop: 12, padding: 8, border: '1px dashed #ddd', background: '#fafafa', position: 'relative', zIndex: 0 }}>
          <strong>Debug</strong>
          <div>isReady: {String(isReady())} — tops: {tops.length}, nodes: {nodes.length}, edges: {edges.length}</div>
          <details style={{ marginTop: 8 }}>
            <summary>Show sample documents</summary>
            <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify({ tops: tops.slice(0,3), nodes: nodes.slice(0,6), edges: edges.slice(0,6) }, null, 2)}</pre>
          </details>
        </div>
      ) : null }
    </div>
  );
}
