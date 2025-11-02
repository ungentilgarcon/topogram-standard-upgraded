import React from 'react'
import Popup from '/imports/client/ui/components/common/Popup.jsx'

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

const coerceNumber = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const mapLinear = (value, dmin, dmax, rmin, rmax) => {
  const v = Number(value)
  const a = Number(dmin)
  const b = Number(dmax)
  const mn = Number(rmin)
  const mx = Number(rmax)
  if (!Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(mn) || !Number.isFinite(mx)) return Number.isFinite(mn) && Number.isFinite(mx) ? (mn + mx) / 2 : 0
  if (b === a) return (mn + mx) / 2
  const t = (v - a) / (b - a)
  const clamped = Math.max(0, Math.min(1, t))
  return mn + clamped * (mx - mn)
}

const normalizeImpl = (impl) => {
  if (!impl) return ''
  if (typeof impl === 'string') return impl.toLowerCase()
  if (typeof impl === 'object') {
    if (impl.impl) return normalizeImpl(impl.impl)
    if (impl.name) return normalizeImpl(impl.name)
  }
  return String(impl).toLowerCase()
}

const formatPx = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 10) return String(Math.round(n))
  return (Math.round(n * 10) / 10).toString()
}

const formatValue = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  if (Number.isInteger(n)) return n
  return Math.round(n * 100) / 100
}

const adjustForZoom = (px, zoom, implName) => {
  const base = Number(px)
  if (!Number.isFinite(base)) return 0
  const impl = normalizeImpl(implName)
  const zNum = Number(zoom)
  const isSigma = impl.includes('sigma')
  const isCy = impl.includes('cyto') || impl === 'cy'
  const isReagraph = impl.includes('reagraph')
  if (isSigma) {
    if (!Number.isFinite(zNum) || zNum <= 0) return base
    const adjusted = base / zNum
    return Number.isFinite(adjusted) && adjusted > 0 ? adjusted : base
  }
  if (isCy || isReagraph) {
    if (!Number.isFinite(zNum) || zNum <= 0) return base
    const adjusted = base * zNum
    return Number.isFinite(adjusted) && adjusted > 0 ? adjusted : base
  }
  return base
}

const computeNetworkNodeDiameter = (value, minW, maxW, implName) => {
  const base = mapLinear(value, minW, maxW, 12, 60)
  const impl = normalizeImpl(implName)
  if (impl.includes('sigma')) {
    const radius = clamp(base / 2, 6, 30)
    return radius * 2
  }
  if (impl.includes('reagraph')) {
    const minNum = Number(minW)
    const maxNum = Number(maxW)
    const start = Number.isFinite(minNum) ? minNum : 1
    const end = (() => {
      if (Number.isFinite(maxNum) && maxNum !== start) return maxNum
      return start + 1
    })()
    const valNum = Number(value)
    const span = end - start || 1
    const mapped = 12 + ((Number.isFinite(valNum) ? valNum : start) - start) / span * (60 - 12)
    const rounded = Math.round(Number.isFinite(mapped) ? mapped : 12)
    const radius = clamp(rounded, 8, 48)
    // Reagraph renders circles using the provided size as an approximate radius,
    // but the on-screen diameter tends to expand by roughly √2 due to stroke
    // inflation. Multiply by √2 so the legend sample matches the canvas glyph.
    return radius * Math.SQRT2
  }
  return base
}

const computeNetworkEdgeWidth = (value, minW, maxW, implName) => {
  const impl = normalizeImpl(implName)
  const outMax = (Number(maxW) === Number(minW)) ? 2 : 6
  const base = mapLinear(value, minW, maxW, 1, outMax)
  if (impl.includes('sigma')) {
    return Math.max(1, base * 0.3)
  }
  return base
}

const geoRadiusFromWeight = (value) => {
  const w = coerceNumber(value, 1)
  if (w > 0) return w > 100 ? 167 : w * 5
  return 3
}

const computeGeoNodeSize = (value, implName) => {
  const impl = normalizeImpl(implName)
  const visualRadius = geoRadiusFromWeight(value)
  if (impl.includes('cesium')) {
    return Math.max(2, Math.round(visualRadius * 0.5))
  }
  return visualRadius * 2
}

const computeGeoEdgeWidth = (value, implName) => {
  const impl = normalizeImpl(implName)
  const w = coerceNumber(value, 1)
  if (impl.includes('maplibre')) {
    return Math.max(1, w)
  }
  if (impl.includes('leaflet') || impl.includes('cesium')) {
    if (w > 6) return 20
    if (w <= 0) return 1
    return Math.max(1, Math.pow(w, 2))
  }
  return Math.max(1, w)
}

const renderNodeSample = (diameterPx, color) => {
  const dia = Number(diameterPx)
  const safeDia = Number.isFinite(dia) && dia > 0 ? dia : 6
  const radius = Math.max(3, safeDia / 2)
  const pad = Math.max(8, radius * 0.35)
  const size = Math.round(radius * 2 + pad * 2)
  const center = size / 2
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={center} cy={center} r={radius} fill={color} />
    </svg>
  )
}

const renderEdgeSample = (strokeWidth, color) => {
  const widthVal = Number(strokeWidth)
  const safeWidth = Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 1
  const pad = 8
  const height = Math.max(24, safeWidth + pad * 2)
  const length = 120
  const y = height / 2
  return (
    <svg width={length} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <line x1={pad} y1={y} x2={length - pad} y2={y} stroke={color} strokeWidth={safeWidth} strokeLinecap="round" />
    </svg>
  )
}

// Simple Legend panel. Mirrors the Popup usage in SelectionPanel and Charts
// so it supports pop-out to a new window. Consumers should call
// `updateUI('legendVisible', false)` on close to persist state.
export default function LegendPanel({ ui = {}, updateUI = () => {} , light = true, nodeSizeMode = 'weight', minNodeWeight = 1, maxNodeWeight = 2, minEdgeWeight = 1, maxEdgeWeight = 2, geoMapVisible = false, geoMinNodeWeight = null, geoMaxNodeWeight = null, geoMinEdgeWeight = null, geoMaxEdgeWeight = null, networkZoom = 1, geoZoom = 1, networkImpl = null, geoImpl = null }) {
  const handleClose = () => {
    try { updateUI('legendVisible', false) } catch (e) {}
  }

  const networkImplName = normalizeImpl(networkImpl)
  const geoImplName = normalizeImpl(geoImpl)
  const networkValueLabel = nodeSizeMode === 'degree' ? 'degree' : 'weight'

  const netRangeMin = coerceNumber(minNodeWeight, 1)
  const netRangeMax = coerceNumber(maxNodeWeight, netRangeMin + 1)
  const geoRangeMin = coerceNumber(geoMinNodeWeight != null ? geoMinNodeWeight : minNodeWeight, netRangeMin)
  const geoRangeMax = coerceNumber(geoMaxNodeWeight != null ? geoMaxNodeWeight : maxNodeWeight, geoRangeMin + 1)
  const netEdgeRangeMin = coerceNumber(minEdgeWeight, 1)
  const netEdgeRangeMax = coerceNumber(maxEdgeWeight, netEdgeRangeMin + 1)
  const geoEdgeRangeMin = coerceNumber(geoMinEdgeWeight != null ? geoMinEdgeWeight : minEdgeWeight, netEdgeRangeMin)
  const geoEdgeRangeMax = coerceNumber(geoMaxEdgeWeight != null ? geoMaxEdgeWeight : maxEdgeWeight, geoEdgeRangeMin + 1)

  // Precompute sample sizes / widths and zoom-adjusted readouts for labels
  // Decide which data values to sample for the legend: prefer min/max from props.
  const netNodeLowValRaw = (minNodeWeight != null) ? Number(minNodeWeight) : NaN
  const netNodeHighValRaw = (maxNodeWeight != null) ? Number(maxNodeWeight) : NaN
  const netNodeLowVal = Number.isFinite(netNodeLowValRaw) ? netNodeLowValRaw : 1
  let netNodeHighVal = Number.isFinite(netNodeHighValRaw) ? netNodeHighValRaw : (netNodeLowVal + 4)
  if (netNodeHighVal === netNodeLowVal) netNodeHighVal = netNodeLowVal + 1

  const netSizeLow = computeNetworkNodeDiameter(netNodeLowVal, netRangeMin, netRangeMax, networkImplName)
  const netSizeHigh = computeNetworkNodeDiameter(netNodeHighVal, netRangeMin, netRangeMax, networkImplName)
  const netSizeLowAdj = adjustForZoom(netSizeLow, networkZoom, networkImplName)
  const netSizeHighAdj = adjustForZoom(netSizeHigh, networkZoom, networkImplName)

  const geoNodeLowValRaw = (geoMinNodeWeight != null) ? Number(geoMinNodeWeight) : NaN
  const geoNodeHighValRaw = (geoMaxNodeWeight != null) ? Number(geoMaxNodeWeight) : NaN
  const geoNodeLowVal = Number.isFinite(geoNodeLowValRaw) ? geoNodeLowValRaw : netNodeLowVal
  let geoNodeHighVal = Number.isFinite(geoNodeHighValRaw) ? geoNodeHighValRaw : netNodeHighVal
  if (geoNodeHighVal === geoNodeLowVal) geoNodeHighVal = geoNodeLowVal + 1

  const geoSizeLow = computeGeoNodeSize(geoNodeLowVal, geoImplName)
  const geoSizeHigh = computeGeoNodeSize(geoNodeHighVal, geoImplName)
  const geoSizeLowAdj = adjustForZoom(geoSizeLow, geoZoom, geoImplName)
  const geoSizeHighAdj = adjustForZoom(geoSizeHigh, geoZoom, geoImplName)

  const netEdgeLowValRaw = (minEdgeWeight != null) ? Number(minEdgeWeight) : NaN
  const netEdgeHighValRaw = (maxEdgeWeight != null) ? Number(maxEdgeWeight) : NaN
  const netEdgeLowVal = Number.isFinite(netEdgeLowValRaw) ? netEdgeLowValRaw : 1
  let netEdgeHighVal = Number.isFinite(netEdgeHighValRaw) ? netEdgeHighValRaw : (netEdgeLowVal + 4)
  if (netEdgeHighVal === netEdgeLowVal) netEdgeHighVal = netEdgeLowVal + 1

  const netEdgeLow = computeNetworkEdgeWidth(netEdgeLowVal, netEdgeRangeMin, netEdgeRangeMax, networkImplName)
  const netEdgeHigh = computeNetworkEdgeWidth(netEdgeHighVal, netEdgeRangeMin, netEdgeRangeMax, networkImplName)
  const netEdgeLowAdj = adjustForZoom(netEdgeLow, networkZoom, networkImplName)
  const netEdgeHighAdj = adjustForZoom(netEdgeHigh, networkZoom, networkImplName)

  const geoEdgeLowValRaw = (geoMinEdgeWeight != null) ? Number(geoMinEdgeWeight) : NaN
  const geoEdgeHighValRaw = (geoMaxEdgeWeight != null) ? Number(geoMaxEdgeWeight) : NaN
  const geoEdgeLowVal = Number.isFinite(geoEdgeLowValRaw) ? geoEdgeLowValRaw : netEdgeLowVal
  let geoEdgeHighVal = Number.isFinite(geoEdgeHighValRaw) ? geoEdgeHighValRaw : netEdgeHighVal
  if (geoEdgeHighVal === geoEdgeLowVal) geoEdgeHighVal = geoEdgeLowVal + 1

  const geoEdgeLow = computeGeoEdgeWidth(geoEdgeLowVal, geoImplName)
  const geoEdgeHigh = computeGeoEdgeWidth(geoEdgeHighVal, geoImplName)
  const geoEdgeLowAdj = adjustForZoom(geoEdgeLow, geoZoom, geoImplName)
  const geoEdgeHighAdj = adjustForZoom(geoEdgeHigh, geoZoom, geoImplName)

  const netSizeLowDisplay = formatPx(netSizeLowAdj)
  const netSizeHighDisplay = formatPx(netSizeHighAdj)
  const geoSizeLowDisplay = formatPx(geoSizeLowAdj)
  const geoSizeHighDisplay = formatPx(geoSizeHighAdj)
  const netEdgeLowDisplay = formatPx(netEdgeLowAdj)
  const netEdgeHighDisplay = formatPx(netEdgeHighAdj)
  const geoEdgeLowDisplay = formatPx(geoEdgeLowAdj)
  const geoEdgeHighDisplay = formatPx(geoEdgeHighAdj)

  return (
    <Popup
      light={light}
      show
      title={'Legend'}
      onClose={handleClose}
      onPopOut={() => { try { /* Popup handles poppedOut internally */ } catch (e) {} }}
  width={572}
  height={598}
    >
      <div style={{ fontSize: 13, color: '#222' }}>
        <div style={{ marginBottom: 8 }}><strong>Legend</strong></div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6 }}><strong>Nodes</strong></div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 6 }}><em>Network nodes size</em></div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {renderNodeSample(netSizeLowAdj, '#666')}
                <div style={{ fontSize: 12 }}>
                  <div>{networkValueLabel} = {formatValue(netNodeLowVal)}</div>
                  <div style={{ color: '#444' }}>≈ {netSizeLowDisplay}px</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {renderNodeSample(netSizeHighAdj, '#666')}
                <div style={{ fontSize: 12 }}>
                  <div>{networkValueLabel} = {formatValue(netNodeHighVal)}</div>
                  <div style={{ color: '#444' }}>≈ {netSizeHighDisplay}px</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current network presets ({String(nodeSizeMode)})</div>
          </div>

          {geoMapVisible ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ marginBottom: 6 }}><em>Geomap nodes size</em></div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {renderNodeSample(geoSizeLowAdj, '#1f77b4')}
                  <div style={{ fontSize: 12 }}>
                    <div>weight = {formatValue(geoNodeLowVal)}</div>
                    <div style={{ color: '#444' }}>≈ {geoSizeLowDisplay}px</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {renderNodeSample(geoSizeHighAdj, '#1f77b4')}
                  <div style={{ fontSize: 12 }}>
                    <div>weight = {formatValue(geoNodeHighVal)}</div>
                    <div style={{ color: '#444' }}>≈ {geoSizeHighDisplay}px</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current geomap presets</div>
            </div>
          ) : null}

          <ul style={{ marginTop: 10, marginBottom: 8, paddingLeft: 18 }}>
            <li>Color: categorical or derived from node id/name</li>
            <li>Size: represents node {networkValueLabel}</li>
            <li>Selected nodes highlighted with a border</li>
          </ul>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6 }}><strong>Edges</strong></div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 6 }}><em>Network edges width</em></div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {renderEdgeSample(netEdgeLowAdj, '#333')}
                <div style={{ fontSize: 12 }}>
                  <div>weight = {formatValue(netEdgeLowVal)}</div>
                  <div style={{ color: '#444' }}>≈ {netEdgeLowDisplay}px</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {renderEdgeSample(netEdgeHighAdj, '#333')}
                <div style={{ fontSize: 12 }}>
                  <div>weight = {formatValue(netEdgeHighVal)}</div>
                  <div style={{ color: '#444' }}>≈ {netEdgeHighDisplay}px</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, marginLeft: 4, fontSize: 12, color: '#444' }}>Scaled using current network edge presets</div>
          </div>

          {geoMapVisible ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ marginBottom: 6 }}><em>Geomap edges width</em></div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {renderEdgeSample(geoEdgeLowAdj, '#1f77b4')}
                  <div style={{ fontSize: 12 }}>
                    <div>weight = {formatValue(geoEdgeLowVal)}</div>
                    <div style={{ color: '#444' }}>≈ {geoEdgeLowDisplay}px</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {renderEdgeSample(geoEdgeHighAdj, '#1f77b4')}
                  <div style={{ fontSize: 12 }}>
                    <div>weight = {formatValue(geoEdgeHighVal)}</div>
                    <div style={{ color: '#444' }}>≈ {geoEdgeHighDisplay}px</div>
                  </div>
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
