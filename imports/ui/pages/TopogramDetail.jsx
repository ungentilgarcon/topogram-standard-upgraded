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
import SelectionManager from '/imports/client/selection/SelectionManager'

cytoscape.use(cola);

import GraphWrapper from '/imports/client/ui/components/network/GraphWrapper.jsx'
import ErrorBoundary from '/imports/ui/components/ErrorBoundary.jsx'

export default function TopogramDetail() {
  const { id } = useParams();
  // Debug rendering info is gated behind the sidepanel debug toggle (debugVisible)

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

  // Note: detailed debug output (render/id/sample docs) is emitted below
  // inside a useEffect that checks `debugVisible` so it only appears when
  // the user enables the "Debug network" toggle in the sidepanel.
  // (debug effect moved lower so it runs after debugVisible is declared)
  // UI state/hooks must come before any early return to keep hook order stable
  // UI state: allow the user to override the layout (or choose 'auto' to use computed)
  const [selectedLayout, setSelectedLayout] = useState('auto')
  // Node title font size (px)
  const [titleSize, setTitleSize] = useState(12)
  // Graph renderer selection: null means "follow defaults / query param"; user choice stored here
  const [graphAdapter, setGraphAdapter] = useState(null)

  // Node sizing mode: 'weight' (default) or 'degree' (use node degree)
  const [nodeSizeMode, setNodeSizeMode] = useState(() => {
    try { const v = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.nodeSizeMode') : null; return v || 'weight' } catch (e) { return 'weight' }
  })

  // initialize from localStorage if present
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const v = window.localStorage.getItem('topo.graphAdapter')
        if (v) setGraphAdapter(v)
      }
    } catch (e) {}
  }, [])
  // Keep a ref to the Cytoscape instance so we can trigger layouts on demand
  const cyRef = useRef(null)
  // Also keep the Cytoscape instance in state so React re-renders consumers when it becomes available
  const [cyInstance, setCyInstance] = useState(null)
  // remember last visible nodes count to detect visibility changes
  const lastVisibleCountRef = useRef(null)
  // remember last timeline range so we can detect which side moved
  const lastTimelineRangeRef = useRef(null)
  // keep cyInstance in state for panels/widgets that consume it

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
  // Selected elements shared between Cytoscape and GeoMap — now backed by SelectionManager
  const [selectedElements, setSelectedElements] = useState(() => SelectionManager.getSelection())
  // subscribe to SelectionManager changes once
  useEffect(() => {
    const unsub = SelectionManager.subscribe(({ action, selected }) => {
      try { setSelectedElements(Array.isArray(selected) ? selected : SelectionManager.getSelection()) } catch (e) {}
    })
    return () => { try { unsub && unsub() } catch (e) {} }
  }, [])
  // Panel visibility flags (persisted in localStorage and controllable from PanelSettings)
  // Initialize to safe defaults and sync from localStorage once on mount to avoid
  // reading window during hook initialization (helps keep hook order stable under HMR).
  const [geoMapVisible, setGeoMapVisible] = useState(false)
  const [networkVisible, setNetworkVisible] = useState(true)
  // Edge relationship visibility per-view (independent)
  const [networkEdgeRelVisible, setNetworkEdgeRelVisible] = useState(true)
  // Default to true, but for large graphs we'll default to false unless user stored a preference
  const [geoEdgeRelVisible, setGeoEdgeRelVisible] = useState(true)
  const [timeLineVisible, setTimeLineVisible] = useState(true)
  const [debugVisible, setDebugVisible] = useState(false)
  const [chartsVisible, setChartsVisible] = useState(true)
  // Selection panel pinned/visible flag (persisted via localStorage)
  const [selectionPanelPinned, setSelectionPanelPinned] = useState(false)
  // Emoji rendering toggle (default: true; for large graphs default to false unless user override exists)
  const [emojiVisible, setEmojiVisible] = useState(() => {
    try {
      const v = window.localStorage.getItem('topo.emojiVisible')
      if (v != null) return (v === 'true')
      // Defer large-graph default until nodes are known; assume true for now and we'll re-sync after nodes load
      return true
    } catch (e) { return true }
  })
  // Node label display mode in network: 'name' | 'emoji' | 'both'
  const [nodeLabelMode, setNodeLabelMode] = useState(() => {
    try { const v = window.localStorage.getItem('topo.nodeLabelMode'); return v || 'both' } catch (e) { return 'both' }
  })

  // Edge relationship label display mode in network: 'text' | 'emoji' | 'both'
  // Edge relationship label display mode in network: 'text' | 'emoji' | 'both' | 'none'
  const [edgeRelLabelMode, setEdgeRelLabelMode] = useState(() => {
    try {
      const v = window.localStorage.getItem('topo.edgeRelLabelMode')
      if (v) return v
      // If no user preference, for very large graphs default to 'none' to reduce clutter
      try {
        // nodes may not be populated yet; guard access
        if (Array.isArray(nodes) && nodes.length > 1500) return 'none'
      } catch (e) {}
      return 'text'
    } catch (e) { return 'text' }
  })

  // Emit verbose render/sample diagnostics only when debugVisible is enabled.
  useEffect(() => {
    if (!debugVisible) return
    try {
  // console.debug && console.debug('TopogramDetail rendered with id:', id)
  // console.debug && console.debug('TopogramDetail isReady:', isReady(), 'tops.length:', tops.length, 'nodes.length:', nodes.length, 'edges.length:', edges.length)
      const dbgTops = tops.slice(0, 3).map(t => ({ _id: t._id, title: t.title || t.name }))
      const dbgNodes = nodes.slice(0, 6).map(n => ({ _id: n._id, id: n.id || (n.data && n.data.id), name: n.name || n.label || (n.data && n.data.name), topogramId: n.topogramId || (n.data && n.data.topogramId) }))
      const dbgEdges = edges.slice(0, 6).map(e => ({ _id: e._id, source: e.source || (e.data && e.data.source), target: e.target || (e.data && e.data.target) }))
  // console.log && console.log('TopogramDetail sample docs', { dbgTops, dbgNodes, dbgEdges })
    } catch (err) {
      console.error && console.error('TopogramDetail debug panel error:', err)
    }
  }, [debugVisible, id, tops.length, nodes.length, edges.length])

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

  // When edgeRelLabelMode or emojiVisible changes, update edge labels on the live cy instance
  useEffect(() => {
    try {
      const cy = cyRef.current
      if (!cy) return
      const mode = edgeRelLabelMode || 'text'
      cy.edges().forEach(e => {
        try {
          const d = e.data() || {}
          const text = d.name || d.relationship || ''
          const emoji = d.relationshipEmoji || ''
          if (mode === 'emoji') {
            e.data('_relVizLabel', emoji || String(text || ''))
          } else if (mode === 'text') {
            e.data('_relVizLabel', String(text || ''))
          } else if (mode === 'none') {
            e.data('_relVizLabel', '')
          } else {
            // both
            e.data('_relVizLabel', emoji ? `${String(emoji)} ${String(text || '')}` : String(text || ''))
          }
        } catch (err) {}
      })
      try { if (typeof cy.style === 'function') cy.style().update() } catch (e) {}
    } catch (e) {}
  }, [edgeRelLabelMode, emojiVisible])

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

  // Deterministic color helper: hash a string to an HSL color and return hex
  const _stringToColorHex = (str) => {
    try {
      if (!str) str = '';
      // simple hash
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
      const hue = h % 360;
      const sat = 62;
      const light = 52;
      // convert HSL to RGB hex
      const hNorm = hue / 360;
      const s = sat / 100;
      const l = light / 100;
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      let r, g, b;
      if (s === 0) { r = g = b = l; } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, hNorm + 1/3);
        g = hue2rgb(p, q, hNorm);
        b = hue2rgb(p, q, hNorm - 1/3);
      }
      const toHex = (x) => { const v = Math.round(x * 255); return (v < 16 ? '0' : '') + v.toString(16); };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch (e) { return '#1f2937'; }
  };

  const isSelectedKey = (key) => selectedElements.some(e => canonicalKey(e) === key)

  // selectElement/unselectElement are used by GeoMap (and can be used programmatically)
  const selectElement = (json) => {
    try {
      // delegate to SelectionManager; adapters or cy may also listen
      SelectionManager.select(json)
    } catch (e) { console.warn('selectElement: SelectionManager.select failed', e) }
  }

  const unselectElement = (json) => {
    try {
      SelectionManager.unselect(json)
    } catch (e) { console.warn('unselectElement: SelectionManager.unselect failed', e) }
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

  // After nodes load, apply large-graph conservative defaults for certain vis flags
  useEffect(() => {
    try {
      if (!Array.isArray(nodes)) return
      const large = nodes.length > 1500
      // If the user has not explicitly set geoEdgeRelVisible in localStorage, default to false for large graphs
      try {
        const ger = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.geoEdgeRelVisible') : null
        if (large && (ger === null)) setGeoEdgeRelVisible(false)
      } catch (e) {}
      // If the user has not explicitly set emojiVisible in localStorage, default to false for large graphs
      try {
        const ev = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.emojiVisible') : null
        if (large && (ev === null)) { setEmojiVisible(false) }
      } catch (e) {}
      // If the user has not set edgeRelLabelMode, and we previously defaulted to 'text', adjust to 'none'
      try {
        const erm = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.edgeRelLabelMode') : null
        if (large && (erm === null) && edgeRelLabelMode !== 'none') setEdgeRelLabelMode('none')
      } catch (e) {}
    } catch (e) {}
  }, [nodes.length])

  // Detect if nodes carry time information (common legacy fields: start/end/time/date)
  // Provide helpers to read time fields from either top-level properties or nested `.data`.
  const _timeFields = ['start', 'end', 'time', 'date', 'from', 'to']
  const getTimeValue = (doc, field) => {
    if (!doc) return undefined
    try {
      if (doc.data && typeof doc.data[field] !== 'undefined' && doc.data[field] !== '') return doc.data[field]
      if (typeof doc[field] !== 'undefined' && doc[field] !== '') return doc[field]
    } catch (e) {}
    return undefined
  }

  // Compute how many nodes have any time-like field present. We'll enable the
  // timeline only when a sufficient portion of nodes carry time info to avoid
  // misleading filtering on mostly-timeless graphs.
  const nodeTimePresentCount = nodes.reduce((acc, n) => {
    try {
      for (const f of _timeFields) {
        const v = getTimeValue(n, f)
        if (v != null && String(v).trim() !== '') { return acc + 1 }
      }
    } catch (e) {}
    return acc
  }, 0)
  const timeCoverage = nodes.length ? (nodeTimePresentCount / nodes.length) : 0
  const TIME_COVERAGE_THRESHOLD = 0.8
  const hasTimeInfo = timeCoverage >= TIME_COVERAGE_THRESHOLD
  // Debug: report time coverage when the developer toggles debugVisible
  try {
    if (debugVisible) console.info && console.info('TOPOGRAM: timeCoverage', { timeCoverage, nodeTimePresentCount, totalNodes: nodes.length, threshold: TIME_COVERAGE_THRESHOLD })
  } catch (e) {}

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
    // If there's no active range, keep nodes visible
    if (!activeRange) return true
    if (!node) return true
    // Track whether the node actually has any valid time fields
    let hasTimeField = false
    for (const f of _timeFields) {
      const v = getTimeValue(node, f)
      if (v == null || String(v).trim() === '') continue
      const t = (typeof v === 'number') ? v : (new Date(v)).getTime()
      if (!Number.isFinite(t)) continue
      hasTimeField = true
      if (t >= activeRange[0] && t <= activeRange[1]) return true
    }
    // If the node had time fields but none matched the active range, hide it.
    // If the node had no time fields, keep it visible.
    return !hasTimeField
  }

  // Build cytoscape elements and pick a layout. Memoize the result so
  // prop identities passed to CytoscapeComponent remain stable while the
  // timeline only toggles classes. This avoids unnecessary remounts/updates
  // during playback (inspired by the original `topogram` project patterns).
  const { elements, layout, stylesheet } = React.useMemo(() => {
    const nodeMap = new Map()
    const vizIdToNode = new Map()
    nodes.forEach(node => {
      const vizId = node.data && node.data.id ? String(node.data.id) : String(node._id)
      const candidates = new Set()
      candidates.add(vizId)
      candidates.add(String(node._id))
      if (node.id) candidates.add(String(node.id))
      if (node.data && node.data.id) candidates.add(String(node.data.id))
      if (node.data && node.data.name) candidates.add(String(node.data.name))
      if (node.name) candidates.add(String(node.name))
      candidates.forEach(k => nodeMap.set(k, vizId))
      vizIdToNode.set(String(vizId), node)
    })

    const nodeEls = nodes.map(node => {
      const vizId = nodeMap.get(String((node.data && node.data.id) || node.id || node._id)) || String(node._id)
      const label = (node.data && (node.data.name || node.data.label)) || node.name || node.label || node.id
      const color = (node.data && (node.data.color || node.data.fillColor || node.data.fill || node.data.backgroundColor || node.data.bg || node.data.colour || node.data.hex))
      const rawWeight = node.data && (node.data.weight || (node.data.rawData && node.data.rawData.weight))
      const data = { id: String(vizId), label, weight: rawWeight, topogramId: node.topogramId || (node.data && node.data.topogramId), rawWeight }
      // Preserve time fields on the Cytoscape element so timeline visibility
      // logic can inspect them directly on cy.nodes(). Read from either
      // top-level or nested `.data` fields to handle CSV/imported shapes.
      try {
        _timeFields.forEach(f => {
          const v = getTimeValue(node, f)
          if (typeof v !== 'undefined' && v !== null && String(v).trim() !== '') data[f] = v
        })
      } catch (e) {}
      if (node.data && node.data.emoji) data.emoji = node.data.emoji
      const nlm = nodeLabelMode || 'both'
      let vizLabel = ''
      if (nlm === 'emoji') vizLabel = (node.data && node.data.emoji) ? String(node.data.emoji) : String(label || '')
      else if (nlm === 'name') vizLabel = String(label || '')
      else { vizLabel = (node.data && node.data.emoji) ? `${String(node.data.emoji)} ${String(label || '')}` : String(label || '') }
      data._vizLabel = vizLabel
    if (color != null) data.color = color
    else data.color = _stringToColorHex(String(node.data && (node.data.id || node.data.name) || node._id || node.id || ''))
  const el = { data }
      if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
        el.position = { x: node.position.x, y: node.position.y }
      }
      return el
    }).filter(Boolean)

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
        // Copy time fields from the original edge into the element so
        // timeline visibility checks on cy.edges() can read them. Also
        // accept edgeStart/edgeEnd variants from CSV imports and map them to
        // start/end for easier downstream checks.
        try {
          _timeFields.forEach(f => {
            const v = getTimeValue(edge, f)
            if (typeof v !== 'undefined' && v !== null && String(v).trim() !== '') data[f] = v
          })
          // Accept common CSV edge columns like edgeStart/edgeEnd and map them
          if (edge && edge.edgeStart && !data.start) data.start = edge.edgeStart
          if (edge && edge.edgeEnd && !data.end) data.end = edge.edgeEnd
          if (edge && edge.data && edge.data.edgeStart && !data.start) data.start = edge.data.edgeStart
          if (edge && edge.data && edge.data.edgeEnd && !data.end) data.end = edge.data.edgeEnd
        } catch (e) {}
        if (edge.data && typeof edge.data.relationship !== 'undefined') data.relationship = edge.data.relationship
        if (edge.data && typeof edge.data.relationshipEmoji !== 'undefined') data.relationshipEmoji = edge.data.relationshipEmoji
        if (edge.data && typeof edge.data.enlightement !== 'undefined') data.enlightement = edge.data.enlightement
        // preserve edge weight (or width) so renderers can map it to visual width
        try {
          const rawEdgeWeight = edge && edge.data ? (edge.data.weight || edge.data.rawWeight || edge.data.width) : (edge.weight || edge.width || null)
          data.weight = (typeof rawEdgeWeight !== 'undefined' && rawEdgeWeight !== null) ? rawEdgeWeight : 1
        } catch (e) {}
        data._parallelIndex = idx
        data._parallelCount = groupEdges.length
        if (ecolor != null) data.color = ecolor
  else data.color = _stringToColorHex(String(edge._id || (edge.data && (edge.data.source || '') + '|' + (edge.data && edge.data.target || ''))))
        try {
          const relText = data.relationship || data.name || ''
          const relEmoji = data.relationshipEmoji || ''
          if (edgeRelLabelMode === 'emoji') data._relVizLabel = relEmoji || String(relText || '')
          else if (edgeRelLabelMode === 'text') data._relVizLabel = String(relText || '')
          else if (edgeRelLabelMode === 'none') data._relVizLabel = ''
          else data._relVizLabel = relEmoji ? `${String(relEmoji)} ${String(relText || '')}` : String(relText || '')
        } catch (e) { data._relVizLabel = data.relationship || data.name || '' }
        let visible = true
        try {
          const srcNode = vizIdToNode.get(String(resolvedSrc))
          const tgtNode = vizIdToNode.get(String(resolvedTgt))
          if (srcNode && !isNodeInRange(srcNode)) visible = false
          if (tgtNode && !isNodeInRange(tgtNode)) visible = false
          const edgeHasTime = ['start','end','time','date','from','to'].some(f => edge.data && edge.data[f] != null)
          if (edgeHasTime) {
            const activeRange = (timelineUI && Array.isArray(timelineUI.valueRange) && timelineUI.valueRange[0] != null && timelineUI.valueRange[1] != null)
              ? [Number(timelineUI.valueRange[0]), Number(timelineUI.valueRange[1])] : null
            if (activeRange) {
              let edgeVisible = false
              for (const f of ['start','end','time','date','from','to']) {
                const v = edge.data && edge.data[f]
                if (v == null) continue
                const t = (typeof v === 'number') ? v : (new Date(v)).getTime()
                if (!Number.isFinite(t)) continue
                if (t >= activeRange[0] && t <= activeRange[1]) { edgeVisible = true; break }
              }
              visible = edgeVisible
            }
          }
        } catch (e) {}
  edgeEls.push({ data })
      })
    })

    const allEls = [...nodeEls, ...edgeEls]
      // If user requested degree-based sizing, compute node degrees and set data.weight accordingly
      try {
        if (nodeSizeMode === 'degree') {
          const degMap = new Map();
          edgeEls.forEach(e => {
            try {
              const s = e.data && e.data.source; const t = e.data && e.data.target;
              if (s != null) degMap.set(String(s), (degMap.get(String(s)) || 0) + 1);
              if (t != null) degMap.set(String(t), (degMap.get(String(t)) || 0) + 1);
            } catch (er) {}
          });
          nodeEls.forEach(n => {
            try {
              const id = n && n.data && n.data.id;
              const d = degMap.get(String(id)) || 0;
              if (n && n.data) n.data.weight = d || 1;
            } catch (er) {}
          });
        }
      } catch (e) {}
    const hasPositions = nodeEls.some(n => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number')
    const layout = hasPositions
      ? { name: 'preset' }
      : { name: 'cola', nodeSpacing: 5, avoidOverlap: true, randomize: true, maxSimulationTime: 1500 }

  const numericWeights = allEls.filter(el => el.data && el.data.id && (el.data.source == null && el.data.target == null)).map(el => Number(el.data.weight || 1))
  const minW = numericWeights.length ? Math.min(...numericWeights) : 1
  const maxW = numericWeights.length ? Math.max(...numericWeights) : (minW + 1)
  // edge weight range for width mapping
  const numericEdgeWeights = allEls.filter(el => el.data && el.data.source != null && el.data.target != null).map(el => Number(el.data.weight || el.data.width || 1))
  const minEW = numericEdgeWeights.length ? Math.min(...numericEdgeWeights) : 1
  const maxEW = numericEdgeWeights.length ? Math.max(...numericEdgeWeights) : (minEW + 1)

    const stylesheet = [
      { selector: 'node', style: { 'label': 'data(_vizLabel)', 'background-color': '#666', 'text-valign': 'center', 'color': '#fff', 'text-outline-width': 2, 'text-outline-color': '#000', 'width': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'height': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'font-size': `${titleSize}px` } },
      { selector: 'node[color]', style: { 'background-color': 'data(color)' } },
  { selector: 'edge', style: { 'width': `mapData(weight, ${minEW}, ${maxEW}, 1, 6)`, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'curve-style': 'bezier', 'control-point-step-size': 'mapData(_parallelIndex, 0, _parallelCount, 10, 40)' } },
      { selector: 'edge[enlightement = "arrow"]', style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)', 'target-arrow-fill': 'filled' } },
      { selector: 'edge[color]', style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)' } },
      { selector: 'edge[relationship], edge', style: {
        'label': 'data(_relVizLabel)',
        'text-rotation': 'autorotate',
        'font-size': 10,
        'text-outline-width': 2,
        'text-outline-color': '#fff',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.85,
        'text-background-padding': 3,
        'text-margin-y': `mapData(_parallelIndex, 0, _parallelCount, -18, 18)`
      } },
    ]

    if (nodeLabelMode === 'emoji') {
      stylesheet.push({ selector: 'node[emoji]', style: { 'label': 'data(emoji)', 'font-size': `mapData(weight, ${minW}, ${maxW}, ${Math.max(16, titleSize)}, 48)`, 'text-valign': 'center', 'text-halign': 'center', 'text-outline-width': 0 } })
    }
    stylesheet.push(
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#FFD54F', 'text-outline-color': '#000', 'z-index': 9999 } },
      { selector: 'edge:selected', style: { 'line-color': '#1976D2', 'target-arrow-color': '#1976D2', 'width': 3, 'z-index': 9998 } }
    )
  // Avoid using `display: none` which removes elements from the renderer
  // completely and can interfere with interactivity. Use visibility/opacity
  // and disable events instead so elements can be restored without layout
  // side-effects and interactions on visible elements remain functional.
  stylesheet.push({ selector: 'node.hidden', style: { 'visibility': 'hidden', 'opacity': 0, 'text-opacity': 0, 'events': 'no' } })
  stylesheet.push({ selector: 'edge.hidden', style: { 'visibility': 'hidden', 'opacity': 0, 'line-opacity': 0, 'text-opacity': 0, 'events': 'no' } })

    return { elements: allEls, layout, stylesheet }
  }, [nodes, edges, nodeLabelMode, edgeRelLabelMode, titleSize, nodeSizeMode])

  // Debug: log element counts so we can detect why network appears empty
  try {
    if (typeof window !== 'undefined' && debugVisible) {
      try {
        const nCount = Array.isArray(nodes) ? nodes.length : 0
        const eCount = Array.isArray(edges) ? edges.length : 0
        const elCount = Array.isArray(elements) ? elements.length : 0
        const hiddenNodes = Array.isArray(elements) ? elements.filter(el => el && el.classes && String(el.classes).split(/\s+/).includes('hidden') && el.data && el.data.id && (el.data.source == null && el.data.target == null)).length : 0
        const hiddenEdges = Array.isArray(elements) ? elements.filter(el => el && el.classes && String(el.classes).split(/\s+/).includes('hidden') && (el.data && (el.data.source != null || el.data.target != null))).length : 0
  if (debugVisible) console.debug && console.debug('TopogramDetail elements debug', { nodes: nCount, edges: eCount, elements: elCount, hiddenNodes, hiddenEdges })
      } catch (e) { /* ignore */ }
    }
  } catch (e) {}


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
  try { if (debugVisible) console.info('TOPOGRAM: TopogramDetail will apply timeline defaults', { min, max, valueRange: [min, max], nodesCount: nodes.length }) } catch (e) {}
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
  runLayout.on && runLayout.on('layoutstop', () => { try { if (typeof cy.resize === 'function') cy.resize(); safeFit(cy); } catch (e) {} })
  setTimeout(() => { try { if (typeof cy.resize === 'function') cy.resize(); safeFit(cy); } catch (e) {} }, 150)
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
      setTimeout(() => { try { if (cy && networkVisible) { if (typeof cy.resize === 'function') cy.resize(); safeFit(cy); } } catch(e){} }, 80)
    } catch (e) {}
  }, [networkVisible, geoMapVisible])

  // Ensure Cytoscape resizes on window resize events (helps when moving between displays)
  useEffect(() => {
    const handler = () => {
      const cy = cyRef.current
      if (!cy) return
      try { if (typeof cy.resize === 'function') cy.resize(); safeFit(cy) } catch (e) {}
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Note: do NOT trigger cy.resize()/fit on every timeline tick. The
  // timeline's job is to hide/show elements; resizing/fitting is costly
  // and causes the layout to jitter during playback. Resize/fit happen on
  // panel toggles, window resizes, and after layout completes.

  // When the timeline selection changes, toggle a 'hidden' class on nodes
  // and edges so we avoid remounting Cytoscape or calling fit/resize during
  // playback. This keeps the layout stable and only updates element
  // visibility.
  useEffect(() => {
    const vr = (timelineUI && Array.isArray(timelineUI.valueRange)) ? timelineUI.valueRange : null
    const cy = cyRef.current
    if (!cy) return
    let raf = null
  // schedule a single fit after visibility changes
  let scheduleFitId = null
    try {
      // If cyRef points to the Sigma adapter, delegate timeline updates to it
      try {
        if (cy && cy.impl && cy.impl === 'sigma') {
          try { applyTimelineToSigmaAdapter(cy, vr, hasTimeInfo) } catch (e) { console.warn('sigma timeline apply failed', e) }
          return
        }
      } catch (e) {}
      raf = window.requestAnimationFrame(() => {
        try {
          const activeRange = (vr && vr[0] != null && vr[1] != null) ? [Number(vr[0]), Number(vr[1])] : null
          // Diagnostic: report activeRange and how many nodes carry a valid `start` field
          try {
            let nodesWithStart = 0
            let nodesWithoutStart = 0
            cy.nodes().forEach(n => {
              try {
                const d = n.data() || {}
                const v = d && d.start
                const t = (v == null) ? NaN : ((typeof v === 'number') ? v : (new Date(v)).getTime())
                if (Number.isFinite(t)) nodesWithStart += 1
                else nodesWithoutStart += 1
              } catch (e) {}
            })
            const visibleBefore = cy.nodes().filter(n => !n.hasClass || !n.hasClass('hidden')).length
            if (debugVisible) console.debug && console.debug('timeline visibility debug', { activeRange, totalNodes: cy.nodes().length, nodesWithStart, nodesWithoutStart, visibleBefore })
          } catch (e) {}

          // Legacy behavior: when the dataset `hasTimeInfo`, show only nodes
          // whose `start` timestamp is within the active range [left,right]. If
          // the dataset has no time info, show all nodes.
          // This mirrors the original implementation where filtering used
          // `minTime` and `currentSliderTime`.
          const left = activeRange ? Number(activeRange[0]) : null
          const right = activeRange ? Number(activeRange[1]) : null
          let wouldBeVisible = 0
          const sample = []
          if (!activeRange) {
            wouldBeVisible = cy.nodes().length
          } else {
            cy.nodes().forEach(n => {
              try {
                const d = n.data() || {}
                let visible = true
                if (hasTimeInfo) {
                  const vstart = d && d.start
                  const tstart = (vstart == null) ? NaN : ((typeof vstart === 'number') ? vstart : (new Date(vstart)).getTime())
                  visible = Number.isFinite(tstart) && (tstart >= left) && (tstart <= right)
                }
                if (visible) wouldBeVisible += 1
                if (sample.length < 12) sample.push({ id: n.id(), start: d && d.start, parsedStart: Number.isFinite((d && d.start) ? ((typeof d.start === 'number') ? d.start : (new Date(d.start)).getTime()) : NaN) })
              } catch (e) {}
            })
          }
          if (wouldBeVisible === 0) {
            try { if (debugVisible) console.warn('timeline visibility guard: applying this range would hide all nodes; skipping update', { activeRange, totalNodes: cy.nodes().length, wouldBeVisible, sample }) } catch (e) {}
          } else {
            cy.nodes().forEach(n => {
              try {
                const d = n.data() || {}
                let visible = true
                if (activeRange && hasTimeInfo) {
                  const vstart = d && d.start
                  const tstart = (vstart == null) ? NaN : ((typeof vstart === 'number') ? vstart : (new Date(vstart)).getTime())
                  visible = Number.isFinite(tstart) && (tstart >= left) && (tstart <= right)
                }
                if (visible) n.removeClass('hidden')
                else n.addClass('hidden')
              } catch (e) {}
            })
          }
          // After toggling node visibility, check how many nodes are visible
          try {
            const visibleNodes = cy.nodes().filter(n => !n.hasClass || !n.hasClass('hidden')).length
            const prev = lastVisibleCountRef.current
            if (prev == null || prev !== visibleNodes) {
              lastVisibleCountRef.current = visibleNodes
              // schedule a single fit/resize on the next animation frame, cancel previous
              try { if (scheduleFitId) { try { window.cancelAnimationFrame(scheduleFitId) } catch(e){} } } catch(e){}
              scheduleFitId = window.requestAnimationFrame(() => {
                try {
                  if (typeof cy.resize === 'function') cy.resize();
                  safeFit(cy);
                  if (visibleNodes === 0) {
                    // Recovery: timeline left zero visible nodes — un-hide everything,
                    // perform the fix view action, and show a small badge so the
                    // user knows a recovery was applied.
                    try {
                      if (debugVisible) console.warn('TopogramDetail recovery: timeline pass left zero visible nodes — un-hiding all elements and applying Fix view')
                      cy.elements().removeClass('hidden')
                    } catch (e) { if (debugVisible) console.warn('TopogramDetail recovery: failed to un-hide elements', e) }
                    try {
                      if (typeof doFixView === 'function') doFixView()
                      else if (typeof cy.fit === 'function') cy.fit()
                    } catch (e) { if (debugVisible) console.warn('TopogramDetail recovery: doFixView failed', e) }
                    try {
                      let badge = document.getElementById('topogram-fixview-badge')
                      if (!badge) {
                        badge = document.createElement('div')
                        badge.id = 'topogram-fixview-badge'
                        badge.textContent = 'Fix view applied'
                        badge.style.position = 'fixed'
                        badge.style.right = '12px'
                        badge.style.top = '12px'
                        badge.style.background = 'rgba(0,0,0,0.75)'
                        badge.style.color = '#fff'
                        badge.style.padding = '6px 10px'
                        badge.style.borderRadius = '6px'
                        badge.style.zIndex = 99999
                        badge.style.fontFamily = 'sans-serif'
                        badge.style.fontSize = '13px'
                        document.body.appendChild(badge)
                      }
                      setTimeout(() => { const b = document.getElementById('topogram-fixview-badge'); if (b) b.remove() }, 2500)
                    } catch (e) { /* ignore DOM issues */ }
                  }
                } catch (e) {}
              })
            }
          } catch (e) {}
          // Extra verbose diagnostics: when the visibleNodes count changes,
          // dump a compact report of hidden nodes and their incident edges.
          try {
            const prev = lastVisibleCountRef.current
            const curr = cy.nodes().filter(n => !n.hasClass || !n.hasClass('hidden')).length
            if (prev == null || prev !== curr) {
              const hiddenNodes = []
              const visibleEdges = []
              cy.nodes().forEach(n => {
                try {
                  const isHidden = n.hasClass && n.hasClass('hidden')
                  if (isHidden) {
                    const d = n.data() || {}
                    const raw = d.start
                    const parsed = (raw == null) ? null : ((typeof raw === 'number') ? raw : (new Date(raw)).getTime())
                    hiddenNodes.push({ id: n.id(), startRaw: raw, startParsed: Number.isFinite(parsed) ? parsed : null })
                  }
                } catch (e) {}
              })
              cy.edges().forEach(e => {
                try {
                  const isHidden = e.hasClass && e.hasClass('hidden')
                  if (!isHidden) {
                    const d = e.data() || {}
                    visibleEdges.push({ id: e.id(), source: e.source() && e.source().id(), target: e.target() && e.target().id(), start: d && d.start })
                  }
                } catch (e) {}
              })
              if (hiddenNodes.length || visibleEdges.length) {
                try {
                  if (debugVisible) {
                    console.groupCollapsed && console.groupCollapsed('timeline verbose report', { activeRange })
                    if (debugVisible) {
                      console.info && console.info('visibleNodes change', { prev, curr })
                      if (hiddenNodes.length) console.info('hidden nodes (sample up to 32)', hiddenNodes.slice(0, 32))
                      if (visibleEdges.length) console.info('visible edges (sample up to 32)', visibleEdges.slice(0, 32))
                    }
                    // For each visible edge, check if its endpoints are hidden and report
                    const inconsistencies = []
                    visibleEdges.slice(0, 64).forEach(ve => {
                      try {
                        const s = cy.getElementById(ve.source)
                        const t = cy.getElementById(ve.target)
                        const sHidden = s && s.hasClass && s.hasClass('hidden')
                        const tHidden = t && t.hasClass && t.hasClass('hidden')
                        if (sHidden || tHidden) inconsistencies.push({ edge: ve.id, source: ve.source, sourceHidden: !!sHidden, target: ve.target, targetHidden: !!tHidden })
                      } catch (e) {}
                    })
                    if (inconsistencies.length) console.warn('visible edges with hidden endpoints', inconsistencies.slice(0, 32))
                    console.groupEnd && console.groupEnd()
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
          // --- Per-tick diagnostics sampler: when the slider changes we may enter
          // transient states where elements are being hidden/unhidden rapidly.
          // To help with remote debugging, sample counts every 250ms for 2s and
          // print verbose details. Keep the logs short-lived to avoid noise.
          try {
            const sampleDuration = 2000 // ms
            const sampleInterval = 250 // ms
            let elapsed = 0
            const samplerId = setInterval(() => {
              try {
                const total = cy.nodes().length
                const hidden = cy.nodes().filter(n => n.hasClass && n.hasClass('hidden')).length
                const visible = total - hidden
                // print a concise one-line summary plus a tiny sample of starts
                const sample = []
                let c = 0
                cy.nodes().forEach(n => {
                  try {
                    if (c >= 8) return
                    const d = n.data() || {}
                    const v = d && d.start
                    sample.push({ id: n.id(), start: v })
                    c += 1
                  } catch (e) {}
                })
                if (debugVisible) console.info && console.info('timeline per-tick diag', { elapsed, total, visible, hidden, sample })
              } catch (e) {}
              elapsed += sampleInterval
              if (elapsed >= sampleDuration) try { clearInterval(samplerId) } catch (e) {}
            }, sampleInterval)
          } catch (e) {}
          // Edges: hide if either endpoint is hidden or if edge data itself is out of range
          cy.edges().forEach(e => {
            try {
              const d = e.data() || {}
              const srcId = d && d.source != null ? String(d.source) : (e.source && typeof e.source === 'function' && e.source().id ? String(e.source().id()) : null)
              const tgtId = d && d.target != null ? String(d.target) : (e.target && typeof e.target === 'function' && e.target().id ? String(e.target().id()) : null)
              const src = srcId ? cy.getElementById(srcId) : null
              const tgt = tgtId ? cy.getElementById(tgtId) : null
              const srcHidden = src && src.length ? (src.hasClass && src.hasClass('hidden')) : true
              const tgtHidden = tgt && tgt.length ? (tgt.hasClass && tgt.hasClass('hidden')) : true
              // If either endpoint is missing in the graph, treat the edge as not visible
              let visible = !(srcHidden || tgtHidden)
              if (visible && activeRange) {
                // if edge carries its own start field, respect it; otherwise
                // visibility follows endpoints.
                const v = d && d.start
                if (v != null) {
                  const t = (typeof v === 'number') ? v : (new Date(v)).getTime()
                  visible = Number.isFinite(t) && (t >= activeRange[0] && t <= activeRange[1])
                }
              }
              if (visible) e.removeClass('hidden')
              else e.addClass('hidden')
            } catch (e) {}
          })
          // Post-process: ensure any node that is incident to a visible edge is
          // visible. This prevents a node from disappearing while its connected
          // edges remain visible (user-reported behavior when moving the left
          // slider).
          try {
            cy.edges().forEach(e => {
              try {
                if (!(e.hasClass && e.hasClass('hidden'))) {
                  const d = e.data() || {}
                  const sId = d && d.source != null ? String(d.source) : (e.source && typeof e.source === 'function' && e.source().id ? String(e.source().id()) : null)
                  const tId = d && d.target != null ? String(d.target) : (e.target && typeof e.target === 'function' && e.target().id ? String(e.target().id()) : null)
                  const s = sId ? cy.getElementById(sId) : null
                  const t = tId ? cy.getElementById(tId) : null
                  if (s && s.length && (s.hasClass && s.hasClass('hidden'))) s.removeClass('hidden')
                  if (t && t.length && (t.hasClass && t.hasClass('hidden'))) t.removeClass('hidden')
                }
              } catch (e) {}
            })
          } catch (e) {}
        } catch (e) {}
      })
    } catch (e) {}
    return () => { try { if (raf) window.cancelAnimationFrame(raf) } catch (e) {} }
  }, [timelineUI && timelineUI.valueRange ? timelineUI.valueRange[0] : null, timelineUI && timelineUI.valueRange ? timelineUI.valueRange[1] : null])

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
  const doFixView = () => {
    try {
      const cy = cyRef.current
      if (!cy) return
      // Force a reseat: resize, reset zoom to 1, center and fit visible elements
      try { if (typeof cy.resize === 'function') cy.resize() } catch (e) {}
      try { if (typeof cy.zoom === 'function') cy.zoom(1) } catch (e) {}
      try { if (typeof cy.center === 'function') cy.center() } catch (e) {}
      safeFit(cy)
    } catch (e) { console.warn('doFixView failed', e) }
  }
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

  // Helper: apply timeline visibility when cyRef.current is a Sigma adapter
  const applyTimelineToSigmaAdapter = (adapter, vr, hasTimeInfo) => {
    try {
      if (!adapter || !adapter.impl || adapter.impl !== 'sigma' || !adapter.graph) return
      const graph = adapter.graph
      const renderer = adapter.renderer
      const activeRange = (vr && vr[0] != null && vr[1] != null) ? [Number(vr[0]), Number(vr[1])] : null
      const left = activeRange ? Number(activeRange[0]) : null
      const right = activeRange ? Number(activeRange[1]) : null
      let wouldBeVisible = 0

      const nodeIds = graph.nodes()
      if (!nodeIds || !nodeIds.length) return

      if (!activeRange) {
        wouldBeVisible = nodeIds.length
      } else {
        nodeIds.forEach(id => {
          try {
            const attrs = graph.getNodeAttributes(id) || {}
            let visible = true
            if (hasTimeInfo) {
              const vstart = attrs && attrs.start
              const tstart = (vstart == null) ? NaN : ((typeof vstart === 'number') ? vstart : (new Date(vstart)).getTime())
              visible = Number.isFinite(tstart) && (tstart >= left) && (tstart <= right)
            }
            if (visible) wouldBeVisible += 1
          } catch (e) {}
        })
      }

      if (wouldBeVisible === 0) {
        // do not apply anything that hides all nodes
        return
      }

      // Apply hidden attribute only when state changes to minimize churn
      let visibleCount = 0
      nodeIds.forEach(id => {
        try {
          const attrs = graph.getNodeAttributes(id) || {}
          let visible = true
          if (activeRange && hasTimeInfo) {
            const vstart = attrs && attrs.start
            const tstart = (vstart == null) ? NaN : ((typeof vstart === 'number') ? vstart : (new Date(vstart)).getTime())
            visible = Number.isFinite(tstart) && (tstart >= left) && (tstart <= right)
          }
          const wasHidden = !!attrs.hidden
          if (!visible) {
            if (!wasHidden) graph.setNodeAttribute(id, 'hidden', true)
          } else {
            if (wasHidden) graph.removeNodeAttribute(id, 'hidden')
            visibleCount++
          }
        } catch (e) {}
      })

      // Edges: set hidden if either endpoint is hidden or if edge start out of range
      const edgeIds = graph.edges()
      edgeIds.forEach(eid => {
        try {
          const eattrs = graph.getEdgeAttributes(eid) || {}
          const src = graph.source(eid)
          const tgt = graph.target(eid)
          const srcHidden = !!(graph.getNodeAttribute(src, 'hidden'))
          const tgtHidden = !!(graph.getNodeAttribute(tgt, 'hidden'))
          let visible = !(srcHidden || tgtHidden)
          if (visible && activeRange && eattrs && eattrs.start != null) {
            const t = (typeof eattrs.start === 'number') ? eattrs.start : (new Date(eattrs.start)).getTime()
            visible = Number.isFinite(t) && (t >= left) && (t <= right)
          }
          const wasHidden = !!eattrs.hidden
          if (!visible) {
            if (!wasHidden) graph.setEdgeAttribute(eid, 'hidden', true)
          } else {
            if (wasHidden) graph.removeEdgeAttribute(eid, 'hidden')
          }
        } catch (e) {}
      })

      try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh() } catch (e) {}

      // update lastVisibleCountRef
      try { lastVisibleCountRef.current = visibleCount } catch (e) {}
    } catch (e) { console.warn('applyTimelineToSigmaAdapter failed', e) }
  }

  // Helper to read graph impl selection from query param
  const getGraphImpl = () => {
    try {
      // 1) user override via selector
      if (graphAdapter) return graphAdapter
      // 2) query param override
      const qp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('graph') : null
      if (qp) return qp
      // 3) sensible defaults: cytoscape for normal graphs, sigma for very large graphs
      try { if (Array.isArray(nodes) && nodes.length > 3000) return 'sigma' } catch (e) {}
      return 'cytoscape'
    } catch(e) { return 'cytoscape' }
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

  // compute min/max from normalized weights (elements comes from memoized value)
  const numericWeights = elements.filter(el => el.data && el.data.id && (el.data.source == null && el.data.target == null)).map(el => Number(el.data.weight || 1))
  const minW = numericWeights.length ? Math.min(...numericWeights) : 1
  const maxW = numericWeights.length ? Math.max(...numericWeights) : (minW + 1)

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

  return (<ErrorBoundary>
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
          {/* Quick rescue: force a resize/center/fit when the network appears blank */}
          <button onClick={() => { try { doFixView() } catch(e){} }} className="cy-control-btn" style={{ marginLeft: 8, padding: '4px 8px' }} title="Force Cytoscape to resize, center and fit">Fix view</button>

        {/* Graph adapter selector: user choice overrides query param/defaults. Placed between Fix view and Title size */}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Renderer:
          <select value={graphAdapter || ''} onChange={e => { const v = e.target.value || null; setGraphAdapter(v); try { if (v) window.localStorage.setItem('topo.graphAdapter', v); else window.localStorage.removeItem('topo.graphAdapter'); } catch(e){} }} style={{ minWidth: 120 }}>
            <option value="">(auto)</option>
            <option value="cytoscape">cytoscape</option>
            <option value="sigma">sigma</option>
            <option value="reagraph">reagraph</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Map renderer:
          <select value={((timelineUI && timelineUI.geoMapRenderer) || (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.geoMapRenderer') : null) || 'leaflet')} onChange={e => { const v = e.target.value || 'leaflet'; try { updateUI('geoMapRenderer', v); if (window && window.localStorage) window.localStorage.setItem('topo.geoMapRenderer', v); } catch (err) {} }} style={{ minWidth: 120 }}>
            <option value="leaflet">Leaflet</option>
            <option value="maplibre">MapLibre</option>
            <option value="cesium">Cesium</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Title size:
          <input type="range" min={8} max={36} value={titleSize} onChange={e => setTitleSize(Number(e.target.value))} />
          <span style={{ minWidth: 36, textAlign: 'right' }}>{titleSize}px</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Node size:
          <select value={nodeSizeMode} onChange={e => { const v = e.target.value || 'weight'; setNodeSizeMode(v); try { window.localStorage.setItem('topo.nodeSizeMode', v) } catch (err) {} }}>
            <option value="weight">by weight</option>
            <option value="degree">by degree</option>
          </select>
          <span title="Choose how node size is computed: 'by weight' uses node.data.weight (often from import); 'by degree' sizes nodes by the number of incident edges." style={{ fontSize: 12, color: '#666', marginLeft: 6, cursor: 'help' }}>?
          </span>
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
          Edge labels:
          <select value={edgeRelLabelMode} onChange={e => { const v = e.target.value; setEdgeRelLabelMode(v); try { window.localStorage.setItem('topo.edgeRelLabelMode', v) } catch (err) {} }}>
            <option value="text">Text</option>
            <option value="emoji">Emoji</option>
            <option value="both">Both</option>
            <option value="none">None</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={geoEdgeRelVisible} onChange={e => updateUI('geoEdgeRelVisible', e.target.checked)} />
          <span style={{ fontSize: 12 }}>Show GeoMap relationship labels</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={emojiVisible} onChange={e => { const val = !!e.target.checked; setEmojiVisible(val); try { window.localStorage.setItem('topo.emojiVisible', val ? 'true' : 'false') } catch (err) {} }} />
          <span style={{ fontSize: 12 }}>Show Geomap node emojis</span>
        </label>
      </div>

      {/* If geo is present, render a split view: network on left, map on right */}
      {/** Decide if any node has geo coords **/}
          {
            (() => {
          const visualHeight = 'calc(100vh - 140px)'
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
                <div style={{ width: '100%', height: visualHeight, border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div>Both views hidden — use the settings panel to show Network or GeoMap.</div>
                </div>
              )
            }
            {
              const impl = getGraphImpl()
              if (impl === 'sigma' || impl === 'reagraph') {
                return (
                  <div className="cy-container" style={{ width: '100%', height: visualHeight, border: '1px solid #ccc' }}>
                    <div className="cy-controls">
                      <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                      <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                      <button className="cy-control-btn" onClick={doFit}>Fit</button>
                      <div className="cy-control-row">
                        <button className="cy-control-btn" onClick={() => { try { doReset() } catch(e){} }}>Reset</button>
                      </div>
                    </div>
                    <GraphWrapper
                      elements={elements}
                      layout={layout}
                      stylesheet={stylesheet}
                      impl={impl}
                      cyCallback={(adapter) => {
                        try {
                          // For Sigma adapter, expose adapter as cyRef so existing helpers can detect and use it
                          if (adapter && adapter.impl === 'sigma') {
                            cyRef.current = adapter
                            setCyInstance && setCyInstance(adapter)
                          } else if (adapter && adapter.impl === 'reagraph') {
                            cyRef.current = adapter
                            setCyInstance && setCyInstance(adapter)
                          } else {
                            // fallback: if adapter exposes a raw cy instance, use that
                            cyRef.current = adapter
                            setCyInstance && setCyInstance(adapter)
                          }
                        } catch (e) { console.warn('GraphWrapper cyCallback error', e) }
                      }}
                    />
                  </div>
                )
              }
            }
            return (
              <div className="cy-container" style={{ width: '100%', height: visualHeight, border: '1px solid #ccc' }}>
                <div className="cy-controls">
                  <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                  <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                  <button className="cy-control-btn" onClick={doFit}>Fit</button>
                  <div className="cy-control-row">
                    <button className="cy-control-btn" onClick={() => { try { doReset() } catch(e){} }}>Reset</button>
                  </div>
                </div>
                <CytoscapeComponent
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
                      // ensure the renderer knows about the container size immediately
                      try { if (typeof cy.resize === 'function') cy.resize() } catch (e) {}
                      // expose cy on state for any consumers
                      try { setCyInstance && setCyInstance(cy) } catch (e) {}
                      // If the react-cytoscapejs wrapper didn't synchronously add
                      // elements into the instance, add them here (guarded) so
                      // the renderer has data to display immediately.
                      try {
                        if (Array.isArray(elements) && elements.length && cy.elements().length === 0) {
                          try { cy.add(elements) } catch(e) {}
                        }
                      } catch (e) {}
                      try { if (debugVisible) console.debug && console.debug('cy mounted (no-geo)', { elementsProp: Array.isArray(elements) ? elements.length : 0, elements: cy.elements().length, nodesHidden: cy.nodes().filter('.hidden').length, edgesHidden: cy.edges().filter('.hidden').length }) } catch(e){}
                      try {
                        const rect = cy.container && cy.container() && cy.container().getBoundingClientRect ? cy.container().getBoundingClientRect() : null
                        const width = typeof cy.width === 'function' ? cy.width() : (rect ? rect.width : null)
                        const height = typeof cy.height === 'function' ? cy.height() : (rect ? rect.height : null)
                        const bb = cy.elements && cy.elements().length ? (() => { try { return cy.elements().boundingBox() } catch(e) { return null } })() : null
                        const zoom = typeof cy.zoom === 'function' ? cy.zoom() : null
                        const pan = typeof cy.pan === 'function' ? cy.pan() : null
                        if (debugVisible) console.debug && console.debug('cy diagnostics (no-geo)', { containerRect: rect, width, height, elementsBoundingBox: bb, zoom, pan })
                      } catch (e) {}
                      // small delayed fit to allow layout/renderer to settle and then log state
                        setTimeout(() => { try { safeFit(cy); const bb2 = cy.elements().length ? cy.elements().boundingBox() : null; if (debugVisible) console.debug && console.debug('cy post-fit diagnostics (no-geo)', { elements: cy.elements().length, bbox: bb2, zoom: cy.zoom(), pan: cy.pan() }) } catch(e){} }, 150)
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
          // Compute degree map for geo nodes so we can set weights when nodeSizeMode === 'degree'
          const degreeMapForGeo = new Map()
          try {
            (edges || []).forEach(e => {
              try {
                const s = e && e.data && (e.data.source || e.source)
                const t = e && e.data && (e.data.target || e.target)
                if (s != null) degreeMapForGeo.set(String(s), (degreeMapForGeo.get(String(s)) || 0) + 1)
                if (t != null) degreeMapForGeo.set(String(t), (degreeMapForGeo.get(String(t)) || 0) + 1)
              } catch (err) {}
            })
          } catch (err) {}

          const geoNodes = nodesWithGeo
            .map(({n, coords}) => ({ n, coords }))
            .filter(x => isNodeInRange(x.n))
            .map(({n, coords}) => {
              const vizId = (n.data && n.data.id) ? String(n.data.id) : String(n._id)
              // Decide weight: prefer explicit n.data.weight; if nodeSizeMode === 'degree' use degreeMap
              let weightVal = (n && n.data && typeof n.data.weight !== 'undefined') ? Number(n.data.weight) : undefined
              try {
                if ((nodeSizeMode === 'degree' || String(nodeSizeMode) === 'degree')) {
                  const deg = degreeMapForGeo.get(String(vizId)) || 0
                  // If upstream had a weight, don't override unless degree-based mode is selected
                  weightVal = deg || Math.max(1, Number(weightVal) || 1)
                }
              } catch (e) {}
              return { ...n, data: { ...n.data, id: vizId, lat: coords[0], lng: coords[1], weight: typeof weightVal !== 'undefined' ? Number(weightVal) : (n && n.data && n.data.weight ? Number(n.data.weight) : 1) } }
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
            const impl = getGraphImpl()
            return (
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div className="cy-container" style={{ width: '50%', height: visualHeight, border: '1px solid #ccc' }}>
                  <div className="cy-controls">
                    <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                    <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                    <button className="cy-control-btn" onClick={doFit}>Fit</button>
                    <div className="cy-control-row">
                      <button className="cy-control-btn" onClick={() => { try { doReset() } catch(e){} }}>Reset</button>
                    </div>
                  </div>
                  {
                    (impl === 'sigma' || impl === 'reagraph') ? (
                      <GraphWrapper
                        elements={elements}
                        layout={layout}
                        stylesheet={stylesheet}
                        impl={impl}
                        cyCallback={(adapter) => { try { cyRef.current = adapter; setCyInstance(adapter); try { window._topoCy = adapter } catch(e){} } catch(e){} }}
                      />
                    ) : (
                      <CytoscapeComponent
                        elements={elements}
                        style={{ width: '100%', height: '100%' }}
                        layout={layout}
                        stylesheet={stylesheet}
                        cy={(cy) => {
                          try { cyRef.current = cy; setCyInstance(cy); try { window._topoCy = cy } catch (err) {} } catch (e) {}
                          try {
                            if (typeof cy.boxSelectionEnabled === 'function') cy.boxSelectionEnabled(true)
                            if (typeof cy.selectionType === 'function') cy.selectionType('additive')
                            if (typeof cy.autounselectify === 'function') cy.autounselectify(false)
                            try { if (Array.isArray(elements) && elements.length && cy.elements().length === 0) { try { cy.add(elements) } catch(e) {} } } catch(e){}
                            try { if (debugVisible) console.debug && console.debug('cy mounted (both)', { elementsProp: Array.isArray(elements) ? elements.length : 0, elements: cy.elements().length, nodesHidden: cy.nodes().filter('.hidden').length, edgesHidden: cy.edges().filter('.hidden').length }) } catch(e){}
                            setTimeout(() => { safeFit(cy) }, 50)
                          } catch (err) { console.warn('cy.setup failed', err) }
                        }}
                      />
                    )
                  }
                </div>
                <div style={{ width: '50%', height: visualHeight, border: '1px solid #ccc' }}>
                  {/* debug: sample geoNodes weights passed to GeoMap */}
                  {(() => { try { if (typeof console !== 'undefined' && console.debug) console.debug('TopogramDetail: geoNodes sample before TopogramGeoMap (both)', { nodeSizeMode, sample: (geoNodes||[]).slice(0,6).map(n => ({ id: n && n.data && n.data.id, weight: n && n.data && n.data.weight })) }) } catch(e){} return null })()}
                  <TopogramGeoMap
                    nodes={geoNodes}
                    edges={geoEdges}
                    ui={{ selectedElements, geoEdgeRelVisible, emojiVisible, edgeRelLabelMode, nodeLabelMode, nodeSizeMode, titleSize, geoMapRenderer: (timelineUI && timelineUI.geoMapRenderer) || (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.geoMapRenderer') : null) }}
                      width={'50vw'}
                      height={visualHeight}
                      selectElement={(json) => selectElement(json)}
                      unselectElement={(json) => unselectElement(json)}
                      onFocusElement={() => {}}
                      onUnfocusElement={() => {}}
                    />
                </div>
                <div style={{ width: 320, alignSelf: 'flex-start' }}>
                  { selectionPanelPinned ? <SelectionPanel selectedElements={selectedElements} onUnselect={unselectElement} onClear={onClearSelection} updateUI={updateUI} light={true} /> : null }
                  {chartsVisible ? <Charts nodes={selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))} ui={{ cy: cyInstance, selectedElements, isolateMode: false }} updateUI={updateUI} /> : null}
                </div>
                <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
              </div>
            )
          }

          if (onlyNetwork) {
            const impl = getGraphImpl()
            return (
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div className="cy-container" style={{ width: '70%', height: visualHeight, border: '1px solid #ccc' }}>
                  <div className="cy-controls">
                    <button className="cy-control-btn" onClick={doZoomIn}>Zoom +</button>
                    <button className="cy-control-btn" onClick={doZoomOut}>Zoom -</button>
                    <button className="cy-control-btn" onClick={doFit}>Fit</button>
                    <div className="cy-control-row">
                      <button className="cy-control-btn" onClick={() => { try { doReset() } catch(e){} }}>Reset</button>
                    </div>
                  </div>
                  {
                    (impl === 'sigma' || impl === 'reagraph') ? (
                      <GraphWrapper
                        elements={elements}
                        layout={layout}
                        stylesheet={stylesheet}
                        impl={impl}
                        cyCallback={(adapter) => { try { cyRef.current = adapter } catch (e) {} try { setCyInstance && setCyInstance(adapter) } catch (e) {} }}
                      />
                    ) : (
                      <CytoscapeComponent
                        elements={elements}
                        style={{ width: '100%', height: '100%' }}
                        layout={layout}
                        stylesheet={stylesheet}
                        cy={(cy) => {
                          try { cyRef.current = cy } catch (e) {}
                          try { if (typeof cy.boxSelectionEnabled === 'function') cy.boxSelectionEnabled(true); if (typeof cy.selectionType === 'function') cy.selectionType('additive'); if (typeof cy.autounselectify === 'function') cy.autounselectify(false); try { if (Array.isArray(elements) && elements.length && cy.elements().length === 0) { try { cy.add(elements) } catch(e) {} } } catch(e){} try { if (debugVisible) console.debug && console.debug('cy mounted (onlyNetwork)', { elementsProp: Array.isArray(elements) ? elements.length : 0, elements: cy.elements().length, nodesHidden: cy.nodes().filter('.hidden').length, edgesHidden: cy.edges().filter('.hidden').length }) } catch(e){}; setTimeout(() => { safeFit(cy) }, 50) } catch (err) { console.warn('cy.setup failed', err) }
                        }}
                      />
                    )
                  }
                </div>
                <div style={{ width: 320, alignSelf: 'flex-start' }}>
                  { selectionPanelPinned ? <SelectionPanel selectedElements={selectedElements} onUnselect={onUnselect} onClear={onClearSelection} updateUI={updateUI} light={true} /> : null }
                  {chartsVisible ? <Charts nodes={selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))} ui={{ cy: cyInstance, selectedElements, isolateMode: false }} updateUI={updateUI} /> : null}
                </div>
                <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
              </div>
            )
          }

          if (onlyMap) {
            return (
              <div style={{ width: '100%', height: visualHeight, border: '1px solid #ccc' }}>
                {/* debug: sample geoNodes weights before TopogramGeoMap (onlyMap) */}
                {(() => { try { if (typeof console !== 'undefined' && console.debug) console.debug('TopogramDetail: geoNodes sample before TopogramGeoMap (onlyMap)', { nodeSizeMode, sample: (geoNodes||[]).slice(0,6).map(n => ({ id: n && n.data && n.data.id, weight: n && n.data && n.data.weight })) }) } catch(e){} return null })()}
                <TopogramGeoMap
                  nodes={geoNodes}
                  edges={geoEdges}
                      ui={{ selectedElements, geoEdgeRelVisible, emojiVisible, edgeRelLabelMode, nodeLabelMode, nodeSizeMode, titleSize, geoMapRenderer: (timelineUI && timelineUI.geoMapRenderer) || (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('topo.geoMapRenderer') : null) }}
                  width={'100%'}
                  height={visualHeight}
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
            <div style={{ width: '100%', height: visualHeight, border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div>Both views hidden — use the settings panel (top-right) to show them.</div>
              <SidePanelWrapper geoMapVisible={geoMapVisible} networkVisible={networkVisible} hasGeoInfo={true} hasTimeInfo={hasTimeInfo} />
            </div>
          )
        })()
      }

      {/* Timeline: render when this topogram appears to have time info */}
      { hasTimeInfo && timeLineVisible ? (
        <TimeLine hasTimeInfo={true} ui={timelineUI} updateUI={updateUI} debugVisible={debugVisible} />
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
    </div></ErrorBoundary>
  );
}
