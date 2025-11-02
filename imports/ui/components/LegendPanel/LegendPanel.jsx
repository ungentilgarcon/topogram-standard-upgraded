import React from 'react'
import Popup from '/imports/client/ui/components/common/Popup.jsx'

// Simple Legend panel. Mirrors the Popup usage in SelectionPanel and Charts
// so it supports pop-out to a new window. Consumers should call
// `updateUI('legendVisible', false)` on close to persist state.
export default function LegendPanel({ ui = {}, updateUI = () => {} , light = true, nodeSizeMode = 'weight', minNodeWeight = 1, maxNodeWeight = 2, minEdgeWeight = 1, maxEdgeWeight = 2, geoMapVisible = false, geoMinNodeWeight = null, geoMaxNodeWeight = null, geoMinEdgeWeight = null, geoMaxEdgeWeight = null, networkZoom = 1, geoZoom = 1, networkImpl = null, geoImpl = null }) {
  const handleClose = () => {
    try { updateUI('legendVisible', false) } catch (e) {}
  }

  // Map data value -> pixel size using same mapping as Cytoscape stylesheet: mapData(weight, minW, maxW, 12, 60)
  const mapWeightToPx = (v, minW, maxW) => {
    try {
      const a = Number(minW) || 1
      const b = Number(maxW) || (a + 1)
      const val = Number(v) || 1
      const outMin = 12
      const outMax = 60
      if (b === a) return Math.round((outMin + outMax) / 2)
      const t = (val - a) / (b - a)
      const clamped = Math.max(0, Math.min(1, t))
      return Math.round(outMin + clamped * (outMax - outMin))
    } catch (e) { return 18 }
  }

  const sizePxFor = (value) => mapWeightToPx(value, minNodeWeight, maxNodeWeight)
  const geoSizePxFor = (value) => mapWeightToPx(value, (geoMinNodeWeight != null ? geoMinNodeWeight : minNodeWeight), (geoMaxNodeWeight != null ? geoMaxNodeWeight : maxNodeWeight))

  // Map edge weight -> stroke width (px) using same mapping as stylesheet
  const mapEdgeWeightToPx = (v, minW, maxW) => {
    try {
      const a = Number(minW) || 1
      const b = Number(maxW) || (a + 1)
      const val = Number(v) || 1
      const outMin = 1
      const outMax = (b === a) ? 2 : 6
      if (b === a) return Math.round((outMin + outMax) / 2)
      const t = (val - a) / (b - a)
      const clamped = Math.max(0, Math.min(1, t))
      return Math.max(0.5, Math.round(outMin + clamped * (outMax - outMin)))
    } catch (e) { return 1 }
  }

  const edgeWidthFor = (value) => mapEdgeWeightToPx(value, minEdgeWeight, maxEdgeWeight)
  const geoEdgeWidthFor = (value) => mapEdgeWeightToPx(value, (geoMinEdgeWeight != null ? geoMinEdgeWeight : minEdgeWeight), (geoMaxEdgeWeight != null ? geoMaxEdgeWeight : maxEdgeWeight))

  // Optionally adjust display by renderer zoom value if provided. Different renderers
  // interpret "zoom" differently; this is a best-effort multiplier for the legend
  // readout so users get an approximate on-screen pixel size. If renderer-specific
  // transforms are needed, we should extend this with per-impl logic.
  const applyZoom = (px, zoom, impl) => {
    try {
      const z = (typeof zoom === 'number' && isFinite(zoom)) ? Number(zoom) : 1
      // conservative: don't allow absurd scaling in the legend display
      const clamped = Math.max(0.1, Math.min(10, z))
      return Math.round(px * clamped)
    } catch (e) { return Math.round(px) }
  }

  // Precompute sample sizes / widths and zoom-adjusted readouts for labels
  const netSize1 = sizePxFor(1)
  const netSize5 = sizePxFor(5)
  const netSize1Adj = applyZoom(netSize1, networkZoom, networkImpl)
  const netSize5Adj = applyZoom(netSize5, networkZoom, networkImpl)

  const geoSize1 = geoSizePxFor(1)
  const geoSize5 = geoSizePxFor(5)
  const geoSize1Adj = applyZoom(geoSize1, geoZoom, geoImpl)
  const geoSize5Adj = applyZoom(geoSize5, geoZoom, geoImpl)

  const netEdge1 = edgeWidthFor(1)
  const netEdge5 = edgeWidthFor(5)
  const netEdge1Adj = applyZoom(netEdge1, networkZoom, networkImpl)
  const netEdge5Adj = applyZoom(netEdge5, networkZoom, networkImpl)

  const geoEdge1 = geoEdgeWidthFor(1)
  const geoEdge5 = geoEdgeWidthFor(5)
  const geoEdge1Adj = applyZoom(geoEdge1, geoZoom, geoImpl)
  const geoEdge5Adj = applyZoom(geoEdge5, geoZoom, geoImpl)

  return (
    <Popup
      light={light}
      show
      title={'Legend'}
      onClose={handleClose}
      onPopOut={() => { try { /* Popup handles poppedOut internally */ } catch (e) {} }}
      width={380}
      height={460}
    >
      <div style={{ fontSize: 13, color: '#222' }}>
        <div style={{ marginBottom: 8 }}><strong>Legend</strong></div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6 }}><strong>Nodes</strong></div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 6 }}><em>Network nodes size</em></div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width={80} height={40} style={{ display: 'block' }}>
                  <circle cx={24} cy={20} r={Math.max(3, Math.round(sizePxFor(1) / 2))} fill="#666" />
                </svg>
                <div style={{ fontSize: 12 }}>size = 1 — <span style={{ color: '#444' }}>≈ {netSize1Adj}px</span></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width={80} height={40} style={{ display: 'block' }}>
                  <circle cx={24} cy={20} r={Math.max(3, Math.round(sizePxFor(5) / 2))} fill="#666" />
                </svg>
                <div style={{ fontSize: 12 }}>size = 5 — <span style={{ color: '#444' }}>≈ {netSize5Adj}px</span></div>
              </div>
            </div>

            <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current network presets ({String(nodeSizeMode)})</div>
          </div>

          {geoMapVisible ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ marginBottom: 6 }}><em>Geomap nodes size</em></div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={80} height={40} style={{ display: 'block' }}>
                    <circle cx={24} cy={20} r={Math.max(3, Math.round(geoSizePxFor(1) / 2))} fill="#1f77b4" />
                  </svg>
                  <div style={{ fontSize: 12 }}>size = 1 — <span style={{ color: '#444' }}>≈ {geoSize1Adj}px</span></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={80} height={40} style={{ display: 'block' }}>
                    <circle cx={24} cy={20} r={Math.max(3, Math.round(geoSizePxFor(5) / 2))} fill="#1f77b4" />
                  </svg>
                  <div style={{ fontSize: 12 }}>size = 5 — <span style={{ color: '#444' }}>≈ {geoSize5Adj}px</span></div>
                </div>
              </div>
              <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current geomap presets</div>
            </div>
          ) : null}

          <ul style={{ marginTop: 10, marginBottom: 8, paddingLeft: 18 }}>
            <li>Color: categorical or derived from node id/name</li>
            <li>Size: represents node weight (or degree)</li>
            <li>Selected nodes highlighted with a border</li>
          </ul>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6 }}><strong>Edges</strong></div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 6 }}><em>Network edges width</em></div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width={84} height={28} style={{ display: 'block' }}>
                  <line x1={8} y1={14} x2={64} y2={14} stroke="#333" strokeWidth={Math.max(0.5, edgeWidthFor(1))} strokeLinecap="round" />
                </svg>
                <div style={{ fontSize: 12 }}>weight = 1 — <span style={{ color: '#444' }}>≈ {netEdge1Adj}px</span></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width={84} height={28} style={{ display: 'block' }}>
                  <line x1={8} y1={14} x2={64} y2={14} stroke="#333" strokeWidth={Math.max(0.5, edgeWidthFor(5))} strokeLinecap="round" />
                </svg>
                <div style={{ fontSize: 12 }}>weight = 5 — <span style={{ color: '#444' }}>≈ {netEdge5Adj}px</span></div>
              </div>
            </div>
            <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current network edge presets</div>
          </div>

          {geoMapVisible ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ marginBottom: 6 }}><em>Geomap edges width</em></div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={84} height={28} style={{ display: 'block' }}>
                    <line x1={8} y1={14} x2={64} y2={14} stroke="#1f77b4" strokeWidth={Math.max(0.5, geoEdgeWidthFor(1))} strokeLinecap="round" />
                  </svg>
                  <div style={{ fontSize: 12 }}>weight = 1 — <span style={{ color: '#444' }}>≈ {geoEdge1Adj}px</span></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={84} height={28} style={{ display: 'block' }}>
                    <line x1={8} y1={14} x2={64} y2={14} stroke="#1f77b4" strokeWidth={Math.max(0.5, geoEdgeWidthFor(5))} strokeLinecap="round" />
                  </svg>
                  <div style={{ fontSize: 12 }}>weight = 5 — <span style={{ color: '#444' }}>≈ {geoEdge5Adj}px</span></div>
                </div>
              </div>
              <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current geomap edge presets</div>
            </div>
          ) : null}

          <ul style={{ marginTop: 10, marginBottom: 8, paddingLeft: 18 }}>
            <li>Color: edge-specific color when provided, else derived</li>
            <li>Width: represents edge weight</li>
            <li>Curved edges indicate multi-edges or self-loops</li>
            <li>Selected edges use a stronger stroke color</li>
          </ul>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>
          <div>Use the Pop out button to open this panel in a separate window.</div>
        </div>
      </div>
    </Popup>
  )
}
