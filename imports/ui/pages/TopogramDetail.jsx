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
import '/imports/ui/styles/greenTheme.css'
import SelectionPanel from '/imports/ui/components/SelectionPanel/SelectionPanel'
import Charts from '/imports/ui/components/charts/Charts'

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
  // Also keep the Cytoscape instance in state so React re-renders consumers when it becomes available
  const [cyInstance, setCyInstance] = useState(null)

  // Safe fit helper: only call fit when the renderer is initialized to avoid
  // runtime errors like "this._private.renderer is null" observed when
  // calling cy.fit() too early. If the renderer isn't ready, schedule a
  // retry shortly.
  const safeFit = (cy) => {
    if (!cy || typeof cy.fit !== 'function') return
    try {
      // Prefer checking internal renderer presence to be extra-safe
      if (cy._private && cy._private.renderer) {
        cy.fit()
      } else {
        // Renderer not ready yet: retry once after a short delay
        setTimeout(() => {
          try { if (cy && cy._private && cy._private.renderer && cy.fit) cy.fit() } catch (e) {}
        }, 120)
      }
    } catch (e) {
      // swallow to avoid bubbling to React error boundary
    }
  }
  // Selected elements shared between Cytoscape and GeoMap
  const [selectedElements, setSelectedElements] = useState([])
  // Panel visibility flags (persisted in localStorage and controllable from PanelSettings)
  // Initialize to safe defaults and sync from localStorage once on mount to avoid
  // reading window during hook initialization (helps keep hook order stable under HMR).
  const [geoMapVisible, setGeoMapVisible] = useState(false)
  const [networkVisible, setNetworkVisible] = useState(true)
  // Edge relationship visibility per-view (independent)
  const [networkEdgeRelVisible, setNetworkEdgeRelVisible] = useState(true)
  const [geoEdgeRelVisible, setGeoEdgeRelVisible] = useState(true)
  const [timeLineVisible, setTimeLineVisible] = useState(true)
  const [debugVisible, setDebugVisible] = useState(false)
  const [chartsVisible, setChartsVisible] = useState(true)
  // Selection panel pinned/visible flag (persisted via localStorage)
  const [selectionPanelPinned, setSelectionPanelPinned] = useState(false)
  // Emoji rendering toggle (default: true)
  const [emojiVisible, setEmojiVisible] = useState(() => {
    try { const v = window.localStorage.getItem('topo.emojiVisible'); return v == null ? true : (v === 'true') } catch (e) { return true }
  })
  // Node label display mode in network: 'name' | 'emoji' | 'both'
  const [nodeLabelMode, setNodeLabelMode] = useState(() => {
    try { const v = window.localStorage.getItem('topo.nodeLabelMode'); return v || 'both' } catch (e) { return 'both' }
  })

  // When nodeLabelMode or emojiVisible changes, update the active Cytoscape
  // instance so labels refresh immediately without remounting the component.
  useEffect(() => {
    try {
      const cy = cyRef.current
      if (!cy) return
      // iterate nodes and update their _vizLabel according to current mode
      const nlm = nodeLabelMode || 'both'
      cy.nodes().forEach(n => {
        try {
          const d = n.data() || {}
          const label = d.label || ''
          if (nlm === 'emoji') {
            const v = d.emoji ? String(d.emoji) : String(label || '')
            n.data('_vizLabel', v)
          } else if (nlm === 'name') {
            n.data('_vizLabel', String(label || ''))
          } else {
            // both
            const v = d.emoji ? `${String(d.emoji)} ${String(label || '')}` : String(label || '')
            n.data('_vizLabel', v)
          }
        } catch (e) {}
      })
      // request a style refresh so Cytoscape re-renders labels
      try { if (typeof cy.style === 'function') cy.style().update() } catch (e) {}
    } catch (e) {
      // swallow errors to avoid breaking the UI
    }
  }, [nodeLabelMode, emojiVisible])

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
    // Prefer to let Cytoscape drive selection: select the element in cy and
    // the cy select event will mirror the full selected set into React state.
    try {
      const cy = cyRef.current
      if (cy) {
        // find element in cy and select it
        if (key.startsWith('node:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          const el = cy.filter(`node[id='${id}']`)
          if (el && el.length) { el.select(); return }
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
          if (el && el.length) { el.select(); return }
        }
      }
    } catch (e) { console.warn('selectElement: cy selection failed', e) }
    // Fallback: if cy not available, keep React state as a best-effort
    if (!isSelectedKey(key)) setSelectedElements(prev => [...prev, json])
  }

  const unselectElement = (json) => {
    const key = canonicalKey(json)
    if (!key) return
    try {
      const cy = cyRef.current
      if (cy) {
        if (key.startsWith('node:')) {
          const id = key.slice(5).replace(/'/g, "\\'")
          const el = cy.filter(`node[id='${id}']`)
          if (el && el.length) { el.unselect(); return }
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
          if (el && el.length) { el.unselect(); return }
        }
      }
    } catch (e) { console.warn('unselectElement: cy unselect failed', e) }
    // Fallback: remove from state if cy not available
    setSelectedElements(prev => prev.filter(e => canonicalKey(e) !== key))
  }

  const onUnselect = (json) => {
    try { const key = canonicalKey(json); if (!key) return; setSelectedElements(prev => prev.filter(e => canonicalKey(e) !== key)) } catch (e) {}
  }
  const onClearSelection = () => { setSelectedElements([]) }

  // Keep Cytoscape event listeners in sync with state: when cy instance appears, attach select/unselect handlers
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const onSelect = (evt) => {
      try {
        // Snapshot the current Cytoscape selection and mirror it into React state
        const sel = cy.$(':selected').toArray().map(el => {
          const j = el.json()
          j.group = el.isNode && el.isNode() ? 'nodes' : 'edges'
          return j
        })
        setSelectedElements(sel)
      } catch (e) { console.warn('cy select handler error', e) }
    }
    const onUnselect = (evt) => {
      try {
        // Mirror current selection after an unselect event
        const sel = cy.$(':selected').toArray().map(el => {
          const j = el.json()
          j.group = el.isNode && el.isNode() ? 'nodes' : 'edges'
          return j
        })
        setSelectedElements(sel)
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
        if (typeof d.chartsVisible === 'boolean') setChartsVisible(d.chartsVisible)
          if (typeof d.selectionPanelPinned === 'boolean') setSelectionPanelPinned(d.selectionPanelPinned)
      } catch (e) { console.warn('panelToggle handler error', e) }
    }
    window.addEventListener('topo:panelToggle', handler)
    return () => window.removeEventListener('topo:panelToggle', handler)
  }, [])

  // Cleanup any global cy exposure on unmount
  useEffect(() => {
    return () => { try { if (window && window._topoCy) delete window._topoCy } catch (e) {} }
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
        const c = window.localStorage.getItem('topo.chartsVisible')
        const ner = window.localStorage.getItem('topo.networkEdgeRelVisible')
        const ger = window.localStorage.getItem('topo.geoEdgeRelVisible')
        if (g !== null) setGeoMapVisible(g === 'true')
        if (n !== null) setNetworkVisible(n !== 'false')
        if (t !== null) setTimeLineVisible(t === 'true')
        if (c !== null) setChartsVisible(c === 'true')
        if (ner !== null) setNetworkEdgeRelVisible(ner === 'true')
        if (ger !== null) setGeoEdgeRelVisible(ger === 'true')
        const s = window.localStorage.getItem('topo.selectionPanelPinned')
        if (s !== null) setSelectionPanelPinned(s === 'true')
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
      // Special-case a few keys that belong to this component's state
      try {
        if (key === 'chartsVisible') { setChartsVisible(!!value); return }
        if (key === 'selectedElements') { setSelectedElements(Array.isArray(value) ? value : []) ; return }
        if (key === 'geoMapVisible') { setGeoMapVisible(!!value); return }
        if (key === 'networkVisible') { setNetworkVisible(!!value); return }
          if (key === 'networkEdgeRelVisible') { setNetworkEdgeRelVisible(!!value); try { window.localStorage.setItem('topo.networkEdgeRelVisible', !!value ? 'true' : 'false') } catch(e){}; return }
          if (key === 'geoEdgeRelVisible') { setGeoEdgeRelVisible(!!value); try { window.localStorage.setItem('topo.geoEdgeRelVisible', !!value ? 'true' : 'false') } catch(e){}; return }
        if (key === 'timeLineVisible') { setTimeLineVisible(!!value); return }
        if (key === 'debugVisible') { setDebugVisible(!!value); return }
          if (key === 'selectionPanelPinned') { setSelectionPanelPinned(!!value); return }
          if (key === 'nodeLabelMode') { setNodeLabelMode(value || 'both'); try { window.localStorage.setItem('topo.nodeLabelMode', value || 'both') } catch (e){}; return }
      } catch (e) {}
      setTimelineUI(prev => ({ ...prev, [key]: value }))
      return
    }
    if (typeof a === 'object' && a !== null) {
      const obj = Object.assign({}, a)
      // convert date-like fields to ms
      if (obj.minTime instanceof Date) obj.minTime = obj.minTime.getTime()
      if (obj.maxTime instanceof Date) obj.maxTime = obj.maxTime.getTime()
      if (Array.isArray(obj.valueRange)) obj.valueRange = obj.valueRange.map(v => (v instanceof Date ? v.getTime() : v))
      // Apply object keys to known local state too
      try {
        if (typeof obj.chartsVisible === 'boolean') setChartsVisible(obj.chartsVisible)
        if (obj.selectedElements) setSelectedElements(Array.isArray(obj.selectedElements) ? obj.selectedElements : [])
        if (typeof obj.geoMapVisible === 'boolean') setGeoMapVisible(obj.geoMapVisible)
        if (typeof obj.networkVisible === 'boolean') setNetworkVisible(obj.networkVisible)
        if (typeof obj.networkEdgeRelVisible === 'boolean') { setNetworkEdgeRelVisible(obj.networkEdgeRelVisible); try { window.localStorage.setItem('topo.networkEdgeRelVisible', obj.networkEdgeRelVisible ? 'true' : 'false') } catch(e){} }
        if (typeof obj.geoEdgeRelVisible === 'boolean') { setGeoEdgeRelVisible(obj.geoEdgeRelVisible); try { window.localStorage.setItem('topo.geoEdgeRelVisible', obj.geoEdgeRelVisible ? 'true' : 'false') } catch(e){} }
        if (typeof obj.timeLineVisible === 'boolean') setTimeLineVisible(obj.timeLineVisible)
        if (typeof obj.debugVisible === 'boolean') setDebugVisible(obj.debugVisible)
      } catch (e) {}
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
      runLayout.on && runLayout.on('layoutstop', () => { try { safeFit(cy); } catch (e) {} })
      setTimeout(() => { try { safeFit(cy); } catch (e) {} }, 150)
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
      setTimeout(() => { if (cy && networkVisible) safeFit(cy) }, 80)
    } catch (e) {}
  }, [networkVisible, geoMapVisible])

  // Cytoscape control helpers (use animate when available)
  const doZoom = (factor) => {
    const cy = cyRef.current
    if (!cy) return
    try {
      // prefer animated zoom for better UX
      if (typeof cy.animate === 'function') {
        cy.animate({ zoom: cy.zoom() * factor, duration: 240 })
      } else if (typeof cy.zoom === 'function') {
        cy.zoom(cy.zoom() * factor)
      }
    } catch (e) { console.warn('zoom failed', e) }
  }
  const doZoomIn = () => doZoom(1.2)
  const doZoomOut = () => doZoom(1/1.2)
  const doFit = () => { try { if (cyRef.current) safeFit(cyRef.current) } catch (e) {} }
  const doReset = () => {
    try {
      const cy = cyRef.current
      if (!cy) return
      if (typeof cy.animate === 'function') {
        cy.animate({ center: { eles: cy.elements() }, zoom: 1, duration: 240 })
      } else {
        cy.center()
        cy.zoom(1)
      }
    } catch (e) { console.warn('reset failed', e) }
  }

  // If the document is already present in the client cache (for example because
  // we published all topograms on the list page), render immediately instead
  // of waiting for subscriptions to report ready. This avoids an infinite
  // loading state when the per-id publication has type/format mismatches.
  if (!isReady() && tops.length === 0) return <div>Loading…</div>;
  const top = tops && tops.length ? tops[0] : null;

  if (!top) {
    return (
      <div style={{ paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 12 }}>
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
        // include optional emoji visualization field if present
        if (node.data && node.data.emoji) data.emoji = node.data.emoji
        // compute a display label according to nodeLabelMode: 'name' | 'emoji' | 'both'
        const nlm = nodeLabelMode || 'both'
        let vizLabel = ''
        if (nlm === 'emoji') vizLabel = (node.data && node.data.emoji) ? String(node.data.emoji) : String(label || '')
        else if (nlm === 'name') vizLabel = String(label || '')
        else { // both
          vizLabel = (node.data && node.data.emoji) ? `${String(node.data.emoji)} ${String(label || '')}` : String(label || '')
        }
        data._vizLabel = vizLabel
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
      // Precompute grouping for parallel edges (same source+target) so we can
      // assign a parallel index. Use an ordered group key that is source|target
      // where source/target are the resolved vizIds to ensure matching.
      const grouped = new Map()
      edges.forEach(edge => {
        const rawSrc = (edge.data && (edge.data.source || edge.data.from)) || edge.source || edge.from
        const rawTgt = (edge.data && (edge.data.target || edge.data.to)) || edge.target || edge.to
        const srcKey = rawSrc != null ? String(rawSrc) : null
        const tgtKey = rawTgt != null ? String(rawTgt) : null
        const resolvedSrc = srcKey ? nodeMap.get(srcKey) : null
        const resolvedTgt = tgtKey ? nodeMap.get(tgtKey) : null
        if (!resolvedSrc || !resolvedTgt) return
        const key = `${resolvedSrc}||${resolvedTgt}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push(edge)
      })

      const edgeEls = []
      grouped.forEach((groupEdges, key) => {
        groupEdges.forEach((edge, idx) => {
          const rawSrc = (edge.data && (edge.data.source || edge.data.from)) || edge.source || edge.from
          const rawTgt = (edge.data && (edge.data.target || edge.data.to)) || edge.target || edge.to
          const srcKey = rawSrc != null ? String(rawSrc) : null
          const tgtKey = rawTgt != null ? String(rawTgt) : null
          const resolvedSrc = srcKey ? nodeMap.get(srcKey) : null
          const resolvedTgt = tgtKey ? nodeMap.get(tgtKey) : null
          if (!resolvedSrc || !resolvedTgt) return
          const ecolor = (edge.data && (edge.data.color || edge.data.strokeColor || edge.data.lineColor))
          const data = { id: String(edge._id), source: String(resolvedSrc), target: String(resolvedTgt) }
          if (edge.data && typeof edge.data.relationship !== 'undefined') data.relationship = edge.data.relationship
          if (edge.data && typeof edge.data.enlightement !== 'undefined') data.enlightement = edge.data.enlightement
          // attach parallel index metadata for styling separation
          data._parallelIndex = idx
          data._parallelCount = groupEdges.length
          if (ecolor != null) data.color = ecolor
          edgeEls.push({ data })
        })
      })

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
  // default node style shows computed _vizLabel
  { selector: 'node', style: { 'label': 'data(_vizLabel)', 'background-color': '#666', 'text-valign': 'center', 'color': '#fff', 'text-outline-width': 2, 'text-outline-color': '#000', 'width': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'height': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'font-size': `${titleSize}px` } },
  // Note: emoji-only label style is applied conditionally below so it
  // doesn't unconditionally override the computed _vizLabel. We want
  // the `nodeLabelMode` selector to control which label is shown.
  { selector: 'node[color]', style: { 'background-color': 'data(color)' } },
  // Use bezier curves so parallel edges can be separated
  { selector: 'edge', style: { 'width': 1, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'curve-style': 'bezier', 'control-point-step-size': 'mapData(_parallelIndex, 0, _parallelCount, 10, 40)' } },
  // Edge arrows are controlled per-edge via the `enlightement` data field
  { selector: 'edge[enlightement = "arrow"]', style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)', 'target-arrow-fill': 'filled' } },
  { selector: 'edge[color]', style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)' } },
    { selector: 'edge[relationship]', style: {
        'label': 'data(relationship)',
        'text-rotation': 'autorotate',
        'font-size': 10,
        'text-outline-width': 2,
        'text-outline-color': '#fff',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.85,
        'text-background-padding': 3,
        // offset relation labels based on parallel index to reduce overlap
        'text-margin-y': `mapData(_parallelIndex, 0, _parallelCount, -18, 18)`
      }
    }
  ]

  // If the user requested emoji-only labels in the network, add a rule
  // that renders the node label from `data(emoji)` with a larger font.
  if (nodeLabelMode === 'emoji') {
    stylesheet.push({ selector: 'node[emoji]', style: { 'label': 'data(emoji)', 'font-size': `mapData(weight, ${minW}, ${maxW}, ${Math.max(16, titleSize)}, 48)`, 'text-valign': 'center', 'text-halign': 'center', 'text-outline-width': 0 } })
  }

  // Add explicit selected styles for better visibility when chart-driven selection occurs
  stylesheet.push(
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#FFD54F', 'text-outline-color': '#000', 'z-index': 9999 } },
    { selector: 'edge:selected', style: { 'line-color': '#1976D2', 'target-arrow-color': '#1976D2', 'width': 3, 'z-index': 9998 } }
  )

  // CSV exporter: produce the same 20-field layout used by the ImportCsvModal sample
  const _quote = (v) => {
    if (v === null || typeof v === 'undefined') return '""'
    const s = String(v)
    return '"' + s.replace(/"/g, '""') + '"'
  }

  const exportTopogramCsv = () => {
    try {
  const headerArr = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','emoji','extra']
      const idMap = new Map()
      nodes.forEach(n => {
        const vizId = (n.data && n.data.id) ? String(n.data.id) : String(n._id)
        const candidates = new Set()
        candidates.add(String(vizId))
        candidates.add(String(n._id))
        if (n.id) candidates.add(String(n.id))
        if (n.data && n.data.id) candidates.add(String(n.data.id))
        if (n.data && n.data.name) candidates.add(String(n.data.name))
        if (n.name) candidates.add(String(n.name))
        candidates.forEach(k => idMap.set(k, vizId))
      })

      const fmtDate = (v) => {
        if (v == null) return ''
        if (v instanceof Date) return v.toISOString().split('T')[0]
        // try to detect ISO-like strings already
        return String(v)
      }

      const rows = []
      // nodes first
      nodes.forEach(node => {
        const d = node.data || {}
        const vizId = idMap.get(String((d && d.id) || node.id || node._id)) || String(node._id)
        const id = vizId
        const name = d.name || node.name || ''
        const label = d.label || node.label || ''
        const description = d.description || node.description || ''
        const color = d.color || d.fillColor || d.fill || ''
        const fillColor = d.fillColor || ''
        const weight = (d.weight != null) ? d.weight : (d.rawWeight != null ? d.rawWeight : '')
        const rawWeight = (d.rawWeight != null) ? d.rawWeight : (d.weight != null ? d.weight : '')
        let lat = ''
        let lng = ''
        if (d.lat != null && d.lng != null) { lat = d.lat; lng = d.lng }
        else if (d.latitude != null && d.longitude != null) { lat = d.latitude; lng = d.longitude }
        else if (d.location && Array.isArray(d.location.coordinates) && d.location.coordinates.length >= 2) { lng = d.location.coordinates[0]; lat = d.location.coordinates[1] }
  const start = fmtDate(d.start)
  const end = fmtDate(d.end)
  const time = fmtDate(d.time)
  const date = fmtDate(d.date)

  const emoji = d.emoji || ''
  const row = [id, name, label, description, color, fillColor, weight, rawWeight, lat, lng, start, end, time, date, '', '', '', '', '', emoji, '']
        rows.push(row)
      })

      // then edges
      edges.forEach(edge => {
        const d = edge.data || {}
        const rawSrc = (d && (d.source || d.from)) || edge.source || edge.from || ''
        const rawTgt = (d && (d.target || d.to)) || edge.target || edge.to || ''
        const src = rawSrc != null ? (idMap.get(String(rawSrc)) || String(rawSrc)) : ''
        const tgt = rawTgt != null ? (idMap.get(String(rawTgt)) || String(rawTgt)) : ''
        const edgeLabel = d.name || d.type || d.label || d.relation || d.edge || d.edgeType || d.edgeLabel || ''
        const edgeColor = d.color || d.strokeColor || d.lineColor || ''
        const edgeWeight = d.weight || d.edgeWeight || ''
        const row = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', src, tgt, edgeLabel, edgeColor, edgeWeight, '']
        rows.push(row)
      })

  // Sanitize title strictly: collapse newlines and excessive whitespace
  // and strip leading '#' characters so the comment line stays on a
  // single CSV line. Use CRLF for robust cross-platform parsing.
  const EOL = '\r\n'
  const rawTitle = (top && (top.title || top.name || top._id)) ? String(top.title || top.name || top._id) : String(top && top._id)
  let safeTitleStr = rawTitle.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  // remove any leading comment markers to avoid confusing parsers
  safeTitleStr = safeTitleStr.replace(/^\s*#+\s*/, '')
  // remove control characters that could break a single-line guarantee
  safeTitleStr = safeTitleStr.replace(/[\u0000-\u001F\u007F]/g, '')
  const titleLine = `# Topogram: ${safeTitleStr}`
  const headerLine = headerArr.map(_quote).join(',')
  const bodyLines = rows.map(r => r.map(_quote).join(','))
  const csvText = [titleLine, headerLine, ...bodyLines].join(EOL)

      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
  // Build a safe filename: sanitize, truncate to 24 chars, and trim
  const rawFileTitle = (top && (top.title || top.name || top._id)) ? String(top.title || top.name || top._id) : String(top && top._id)
  let safeTitle = rawFileTitle.replace(/[^a-z0-9-_\.]/gi, '_')
  // truncate to 24 characters to avoid filesystem limits when server saves uploads
  safeTitle = safeTitle.slice(0, 24)
  // remove accidental leading/trailing underscores or dots
  safeTitle = safeTitle.replace(/^[_\.]+|[_\.]+$/g, '') || String(Date.now()).slice(-8)
  a.download = `topogram-${safeTitle}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('exportTopogramCsv failed', e)
      alert('Failed to export CSV: ' + String(e))
    }
  }

  return (
    <div className="topogram-page" style={{ paddingBottom: 'var(--timeline-offset, 12px)' }}>
      <h1 className="home-title">{top.title || top.name || 'Topogram'}</h1>
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

          {/* Import CSV moved to the main Home page */}
          <button onClick={() => exportTopogramCsv && exportTopogramCsv()} className="export-button" style={{ marginLeft: 8 }}>Export CSV</button>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Title size:
          <input type="range" min={8} max={36} value={titleSize} onChange={e => setTitleSize(Number(e.target.value))} />
          <span style={{ minWidth: 36, textAlign: 'right' }}>{titleSize}px</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Node labels:
          <select value={nodeLabelMode} onChange={e => { const v = e.target.value; setNodeLabelMode(v); try { window.localStorage.setItem('topo.nodeLabelMode', v) } catch (err) {} }}>
            <option value="name">Name</option>
            <option value="emoji">Emoji</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={geoEdgeRelVisible} onChange={e => updateUI('geoEdgeRelVisible', e.target.checked)} />
          <span style={{ fontSize: 12 }}>Show GeoMap relationship labels</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={emojiVisible} onChange={e => { const val = !!e.target.checked; setEmojiVisible(val); try { window.localStorage.setItem('topo.emojiVisible', val ? 'true' : 'false') } catch (err) {} }} />
          <span style={{ fontSize: 12 }}>Show node emojis</span>
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
              <div className="cy-container" style={{ width: '100%', height: '600px', border: '1px solid #ccc' }}>
                <div className="cy-controls">
                  <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                  <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                  <button className="cy-control-btn" onClick={doFit}>Fit</button>
                  <div className="cy-control-row">
                    <button className="cy-control-btn" onClick={() => { try { if (cyRef.current) { cyRef.current.zoom(1); cyRef.current.center(); } } catch (e) {} }}>Reset</button>
                  </div>
                </div>
                <CytoscapeComponent
                  key={timelineKey}
                  elements={elements}
                  style={{ width: '100%', height: '100%' }}
                  layout={layout}
                  stylesheet={stylesheet}
                  cy={(cy) => {
                    try { cyRef.current = cy } catch (e) {}
                    try {
                      // enable box selection and additive selection mode when available
                      if (typeof cy.boxSelectionEnabled === 'function') cy.boxSelectionEnabled(true)
                      if (typeof cy.selectionType === 'function') cy.selectionType('additive')
                      if (typeof cy.autounselectify === 'function') cy.autounselectify(false)
                      setTimeout(() => { safeFit(cy) }, 50)
                    } catch (err) { console.warn('cy.setup failed', err) }
                  }}
                />
              </div>
            )
          }

          // build a lightweight geo-nodes/edges list matching the structures expected by TopogramGeoMap
          // We'll derive coords into node.data.lat/lng and attach data.selected based on elements selection if any
          // Filter geo nodes to match the active timeline range as well
          // Ensure geo nodes carry the same visualization id (vizId) used by Cytoscape
          // so that selection by id can be resolved. If data.id exists use it,
          // otherwise fall back to the Mongo _id as the stable viz id.
          const geoNodes = nodesWithGeo
            .map(({n, coords}) => ({ n, coords }))
            .filter(x => isNodeInRange(x.n))
            .map(({n, coords}) => {
              const vizId = (n.data && n.data.id) ? String(n.data.id) : String(n._id)
              return { ...n, data: { ...n.data, id: vizId, lat: coords[0], lng: coords[1] } }
            })
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
                <div className="cy-container" style={{ width: '50%', height: '600px', border: '1px solid #ccc' }}>
                  <div className="cy-controls">
                    <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                    <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                    <button className="cy-control-btn" onClick={doFit}>Fit</button>
                  </div>
                  <CytoscapeComponent
                    key={timelineKey}
                    elements={elements}
                    style={{ width: '100%', height: '100%' }}
                    layout={layout}
                    stylesheet={stylesheet}
                    cy={(cy) => { try { cyRef.current = cy; setCyInstance(cy); try { window._topoCy = cy } catch (err) {} } catch (e) {} try { if (typeof cy.boxSelectionEnabled === 'function') cy.boxSelectionEnabled(true); if (typeof cy.selectionType === 'function') cy.selectionType('additive'); if (typeof cy.autounselectify === 'function') cy.autounselectify(false); setTimeout(() => { safeFit(cy) }, 50) } catch (err) { console.warn('cy.setup failed', err) } }}
                  />
                </div>
                <div style={{ width: '50%', height: '600px', border: '1px solid #ccc' }}>
                  <TopogramGeoMap
                    nodes={geoNodes}
                    edges={geoEdges}
                    ui={{ selectedElements, geoEdgeRelVisible, emojiVisible }}
                    width={'50vw'}
                    height={'600px'}
                    selectElement={(json) => selectElement(json)}
                    unselectElement={(json) => unselectElement(json)}
                    onFocusElement={() => {}}
                    onUnfocusElement={() => {}}
                  />
                </div>
                <div style={{ width: 320 }}>
                  { selectionPanelPinned ? <SelectionPanel selectedElements={selectedElements} onUnselect={unselectElement} onClear={onClearSelection} updateUI={updateUI} light={true} /> : null }
                  {chartsVisible ? <Charts nodes={selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))} ui={{ cy: cyInstance, selectedElements, isolateMode: false }} updateUI={updateUI} /> : null}
                </div>
                <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
              </div>
            )
          }

          if (onlyNetwork) {
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="cy-container" style={{ width: '70%', height: '600px', border: '1px solid #ccc' }}>
                  <div className="cy-controls">
                    <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                    <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                    <button className="cy-control-btn" onClick={doFit}>Fit</button>
                  </div>
                  <CytoscapeComponent
                    key={timelineKey}
                    elements={elements}
                    style={{ width: '100%', height: '100%' }}
                    layout={layout}
                    stylesheet={stylesheet}
                    cy={(cy) => { try { cyRef.current = cy } catch (e) {} try { if (typeof cy.boxSelectionEnabled === 'function') cy.boxSelectionEnabled(true); if (typeof cy.selectionType === 'function') cy.selectionType('additive'); if (typeof cy.autounselectify === 'function') cy.autounselectify(false); setTimeout(() => { safeFit(cy) }, 50) } catch (err) { console.warn('cy.setup failed', err) } }}
                  />
                </div>
                <div style={{ width: 320 }}>
                  { selectionPanelPinned ? <SelectionPanel selectedElements={selectedElements} onUnselect={onUnselect} onClear={onClearSelection} updateUI={updateUI} light={true} /> : null }
                  {chartsVisible ? <Charts nodes={selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))} ui={{ cy: cyInstance, selectedElements, isolateMode: false }} updateUI={updateUI} /> : null}
                </div>
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
                  ui={{ selectedElements, geoEdgeRelVisible, emojiVisible }}
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
