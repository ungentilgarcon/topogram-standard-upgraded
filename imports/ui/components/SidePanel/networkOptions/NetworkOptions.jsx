import React, { useEffect, useMemo, useState } from 'react'

// Side-panel Network options: compact accordions hosting graph/map settings.
// Emits 'topo:networkOptionsChanged' events with partial payloads so the page
// can update live. Persists user choices to localStorage where appropriate.
export default function NetworkOptions({ hasGeoInfo = false }) {
  const ls = (k, d) => {
    try { const v = window.localStorage.getItem(k); return v === null ? d : v; } catch { return d }
  }
  const lsb = (k, d) => {
    const v = ls(k, d ? 'true' : 'false'); return String(v) === 'true'
  }
  const setLs = (k, v) => { try { window.localStorage.setItem(k, String(v)) } catch {} }
  const fire = (detail) => { try { window.dispatchEvent(new CustomEvent('topo:networkOptionsChanged', { detail })) } catch {} }

  // Local UI state (initialized from localStorage where it makes sense)
  const [graphAdapter, setGraphAdapter] = useState(() => ls('topo.graphAdapter', ''))
  const [layout, setLayout] = useState('auto')
  const [titleSize, setTitleSize] = useState(() => Number(ls('topo.titleSize', '12')) || 12)
  const [nodeSizeMode, setNodeSizeMode] = useState(() => ls('topo.nodeSizeMode', 'weight'))
  const [nodeLabelMode, setNodeLabelMode] = useState(() => ls('topo.nodeLabelMode', 'name'))
  const [edgeRelLabelMode, setEdgeRelLabelMode] = useState(() => ls('topo.edgeRelLabelMode', 'text'))

  const [geoMapRenderer, setGeoMapRenderer] = useState(() => ls('topo.geoMapRenderer', 'leaflet'))
  const [geoMapTile, setGeoMapTile] = useState(() => ls('topo.geoMapTile', 'default'))
  const [geoEdgeRelVisible, setGeoEdgeRelVisible] = useState(() => lsb('topo.geoEdgeRelVisible', false))
  const [geoEdgeLabelAggregate, setGeoEdgeLabelAggregate] = useState(() => lsb('topo.geoEdgeLabelAggregate', false))
  const [emojiVisible, setEmojiVisible] = useState(() => lsb('topo.emojiVisible', true))

  // Reagraph-only advanced toggle
  const [aggregateEdges, setAggregateEdges] = useState(false)

  // Sigma debug: force straight edges (disable curved WebGL program) at runtime
  const [sigmaNoCurves, setSigmaNoCurves] = useState(false)

  // Clear legacy persisted flag so the debug toggle defaults to off on reload.
  useEffect(() => {
    try { window.localStorage.removeItem('topo.sigmaNoCurves') } catch {}
  }, [])

  // Persist some values when they change (match existing behavior)
  useEffect(() => { setLs('topo.graphAdapter', graphAdapter) }, [graphAdapter])
  useEffect(() => { setLs('topo.titleSize', titleSize) }, [titleSize])
  useEffect(() => { setLs('topo.nodeSizeMode', nodeSizeMode) }, [nodeSizeMode])
  useEffect(() => { setLs('topo.nodeLabelMode', nodeLabelMode) }, [nodeLabelMode])
  useEffect(() => { setLs('topo.edgeRelLabelMode', edgeRelLabelMode) }, [edgeRelLabelMode])
  useEffect(() => { setLs('topo.geoMapRenderer', geoMapRenderer) }, [geoMapRenderer])
  useEffect(() => { setLs('topo.geoMapTile', geoMapTile) }, [geoMapTile])
  useEffect(() => { setLs('topo.geoEdgeRelVisible', geoEdgeRelVisible) }, [geoEdgeRelVisible])
  useEffect(() => { setLs('topo.geoEdgeLabelAggregate', geoEdgeLabelAggregate) }, [geoEdgeLabelAggregate])
  useEffect(() => { setLs('topo.emojiVisible', emojiVisible) }, [emojiVisible])

  const section = (title, children, { defaultOpen = false } = {}) => (
    <details open={defaultOpen} style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{title}</summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  )

  const row = (label, control) => (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 8 }}>
      <label style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{label}</label>
      {control}
    </div>
  )

  const disabledGeo = !hasGeoInfo

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Network options</div>

      {section('Rendering', (
        <>
          {row('Graph renderer', (
            <select
              value={graphAdapter}
              onChange={(e) => { const v = e.target.value; setGraphAdapter(v); fire({ graphAdapter: v || null }) }}
              style={{ width: '100%' }}
            >
              <option value="">(auto)</option>
              <option value="cytoscape">cytoscape</option>
              <option value="sigma">sigma</option>
              <option value="reagraph">reagraph</option>
            </select>
          ))}
          {row('Layout', (() => {
            // Renderer-specific layout options
            const adapter = String(graphAdapter || '').toLowerCase();
            let options = [ { v: 'auto', t: 'auto' }, { v: 'preset', t: 'preset' } ];
            if (adapter === 'cytoscape' || adapter === 'cy') {
              options = [
                { v: 'auto', t: 'auto' },
                { v: 'preset', t: 'preset' },
                { v: 'grid', t: 'grid' },
                { v: 'circle', t: 'circle' },
                { v: 'concentric', t: 'concentric' },
                { v: 'breadthfirst', t: 'breadthfirst' },
                { v: 'cose', t: 'cose' },
                { v: 'cola', t: 'cola' },
                { v: 'fcose', t: 'fcose' },
              ];
            } else if (adapter === 'sigma') {
              options = [
                { v: 'auto', t: 'auto' },
                { v: 'preset', t: 'preset' },
                { v: 'random', t: 'random' },
                { v: 'circular', t: 'circular' },
                { v: 'forceatlas2', t: 'forceatlas2' },
                { v: 'noverlap', t: 'noverlap' },
              ];
            } else if (adapter === 'reagraph') {
              options = [
                { v: 'auto', t: 'auto' },
                { v: 'preset', t: 'preset' },
                { v: 'forceatlas2', t: 'forceatlas2' },
                { v: 'circular', t: 'circular' },
                { v: 'concentric', t: 'concentric' },
                { v: 'radial', t: 'radial' },
                { v: 'nooverlap', t: 'nooverlap' },
                { v: 'force-directed', t: 'force-directed' },
                { v: 'breadthfirst', t: 'tree' },
              ];
            }
            return (
              <select
                value={layout}
                onChange={(e) => { const v = e.target.value; setLayout(v); fire({ layout: v }) }}
                style={{ width: '100%' }}
              >
                {options.map(opt => (
                  <option key={opt.v} value={opt.v}>{opt.t}</option>
                ))}
              </select>
            );
          })())}
        </>
      ), { defaultOpen: true })}

      {section('Labels & sizing', (
        <>
          {row('Title size', (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={8} max={36} value={titleSize}
                onChange={(e) => { const v = Number(e.target.value); setTitleSize(v); fire({ titleSize: v }) }}
                style={{ flex: '1 1 auto' }}
              />
              <span style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{titleSize}px</span>
            </div>
          ))}
          {row('Node size', (
            <select value={nodeSizeMode} onChange={(e) => { const v = e.target.value; setNodeSizeMode(v); fire({ nodeSizeMode: v }) }}>
              <option value="weight">by weight</option>
              <option value="degree">by degree</option>
            </select>
          ))}
          {row('Node labels', (
            <select value={nodeLabelMode} onChange={(e) => { const v = e.target.value; setNodeLabelMode(v); fire({ nodeLabelMode: v }) }}>
              <option value="name">Name</option>
              <option value="emoji">Emoji</option>
              <option value="both">Both</option>
            </select>
          ))}
          {row('Edge labels', (
            <select value={edgeRelLabelMode} onChange={(e) => { const v = e.target.value; setEdgeRelLabelMode(v); fire({ edgeRelLabelMode: v }) }}>
              <option value="text">Text</option>
              <option value="emoji">Emoji</option>
              <option value="both">Both</option>
              <option value="none">None</option>
            </select>
          ))}
        </>
      ))}

      {section('Geo features', (
        <>
          {row('Map renderer', (
            <select disabled={disabledGeo} value={geoMapRenderer}
              onChange={(e) => { const v = e.target.value; setGeoMapRenderer(v); fire({ geoMapRenderer: v }) }}>
              <option value="leaflet">Leaflet</option>
              <option value="maplibre">MapLibre</option>
              <option value="cesium">Cesium</option>
            </select>
          ))}
          {row('Map background', (
            <select disabled={disabledGeo} value={geoMapTile}
              onChange={(e) => { const v = e.target.value; setGeoMapTile(v); fire({ geoMapTile: v }) }}>
              <option value="default">Default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="satellite">Satellite</option>
            </select>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" disabled={disabledGeo} checked={geoEdgeRelVisible}
                onChange={(e) => { const v = !!e.target.checked; setGeoEdgeRelVisible(v); fire({ geoEdgeRelVisible: v }) }} />
              <span style={{ marginLeft: 6 }}>Show GeoMap relationship labels</span>
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" disabled={disabledGeo} checked={geoEdgeLabelAggregate}
                onChange={(e) => { const v = !!e.target.checked; setGeoEdgeLabelAggregate(v); fire({ geoEdgeLabelAggregate: v }) }} />
              <span style={{ marginLeft: 6 }}>Aggregate GeoMap edge labels</span>
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" disabled={disabledGeo} checked={emojiVisible}
                onChange={(e) => { const v = !!e.target.checked; setEmojiVisible(v); fire({ emojiVisible: v }) }} />
              <span style={{ marginLeft: 6 }}>Show Geomap node emojis</span>
            </label>
          </div>
        </>
      ))}

      {section('Advanced', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button style={{ padding: '6px 8px', borderRadius: 4 }} onClick={() => fire({ exportCSV: true })}>Export CSV</button>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={aggregateEdges} onChange={(e) => { const v = !!e.target.checked; setAggregateEdges(v); fire({ aggregateEdges: v }) }} disabled={graphAdapter !== 'reagraph'} />
            <span style={{ marginLeft: 6 }}>Aggregate edges (Reagraph only)</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ padding: '6px 8px', borderRadius: 4 }} onClick={() => fire({ exportSVG: true })} disabled={graphAdapter !== 'reagraph'}>Export SVG</button>
            <button style={{ padding: '6px 8px', borderRadius: 4 }} onClick={() => fire({ exportPNG: true })} disabled={graphAdapter !== 'reagraph'}>Export PNG</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '6px 8px', borderRadius: 4 }} onClick={() => fire({ fixView: true })}>Fix view</button>
            <button style={{ padding: '6px 8px', borderRadius: 4 }} onClick={() => fire({ resetView: true })}>Reset</button>
          </div>
          <label style={{ fontSize: 12 }} title="Developer debug: force straight edges instead of curved WebGL rendering (Sigma only)">
            <input type="checkbox" checked={sigmaNoCurves}
              disabled={graphAdapter !== 'sigma'}
              onChange={(e) => { const v = !!e.target.checked; setSigmaNoCurves(v); fire({ sigmaNoCurves: v }) }}
            />
            <span style={{ marginLeft: 6 }}>{graphAdapter !== 'sigma' ? 'Disable curved edges (Sigma debug) — Sigma only' : 'Disable curved edges (Sigma debug)'}</span>
          </label>
        </div>
      ))}
    </div>
  )
}
