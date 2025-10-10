import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSubscribe, useFind } from 'meteor/react-meteor-data';
import { Topograms, Nodes, Edges } from '/imports/api/collections';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

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
        const vizId = nodeMap.get(String((node.data && node.data.id) || node.id || node._id)) || String(node._id)
        const label = (node.data && (node.data.name || node.data.label)) || node.name || node.label || node.id
        // pick a color from several commonly-used fields in legacy docs
        const color = (node.data && (node.data.color || node.data.fillColor || node.data.fill || node.data.backgroundColor || node.data.bg || node.data.colour || node.data.hex)) || null
  const rawWeight = node.data && (node.data.weight || (node.data.rawData && node.data.rawData.weight))
  const el = { data: { id: String(vizId), label, color, weight: rawWeight, topogramId: node.topogramId || (node.data && node.data.topogramId), rawWeight } }
        // If the node document contains a saved position, pass it through
        // to Cytoscape as `position: { x, y }` so the 'preset' layout works.
        if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
          el.position = { x: node.position.x, y: node.position.y }
        }
        return el
      })

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
        const ecolor = (edge.data && (edge.data.color || edge.data.strokeColor || edge.data.lineColor)) || null
        return { data: { id: String(edge._id), source: String(resolvedSrc), target: String(resolvedTgt), color: ecolor } }
      }).filter(Boolean)

      const allEls = [...nodeEls, ...edgeEls]
      const hasPositions = nodeEls.some(n => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number')
      const layout = hasPositions
        ? { name: 'preset' }
        : { name: 'cola', nodeSpacing: 5, avoidOverlap: true, randomize: true, maxSimulationTime: 1500 }
      return { elements: allEls, layout }
    })()

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
    <div style={{ padding: 12 }}>
      <h1>{top.title || top.name || 'Topogram'}</h1>
      {top.description ? <p>{top.description}</p> : null}
      <p><Link to="/">Back to list</Link></p>
      {/* Temporary visible debug panel so you can see what arrived in Minimongo */}
      <div style={{ marginBottom: 12, padding: 8, border: '1px dashed #ddd', background: '#fafafa' }}>
        <strong>Debug</strong>
        <div>isReady: {String(isReady())} — tops: {tops.length}, nodes: {nodes.length}, edges: {edges.length}</div>
        <details style={{ marginTop: 8 }}>
          <summary>Show sample documents</summary>
          <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify({ tops: tops.slice(0,3), nodes: nodes.slice(0,6), edges: edges.slice(0,6) }, null, 2)}</pre>
        </details>
      </div>

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

      <div style={{ width: '100%', height: '600px', border: '1px solid #ccc' }}>
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: '100%' }}
          layout={layout}
          stylesheet={stylesheet}
          cy={(cy) => {
            // store cy instance for programmatic layout control
            try { cyRef.current = cy } catch (e) {}
            // Ensure the rendered graph is visible and fits the container.
            // Use a short timeout so this runs after the layout completes.
            try {
              setTimeout(() => { if (cy && cy.fit) cy.fit(); }, 50)
            } catch (err) {
              console.warn('cy.fit() failed', err)
            }
          }}
        />
      </div>
    </div>
  );
}
