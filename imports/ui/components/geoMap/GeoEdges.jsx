import React from 'react'
import PropTypes from 'prop-types'
import { FeatureGroup, Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'

export default class GeoEdges extends React.Component {
  static propTypes = {
    edges : PropTypes.array.isRequired,
    isolateMode : PropTypes.bool,
    handleClickGeoElement : PropTypes.func.isRequired,
    onFocusElement : PropTypes.func.isRequired,
    onUnfocusElement : PropTypes.func.isRequired
    , ui: PropTypes.object
  }

  // Return segments and chevrons for an edge, splitting at the antimeridian when needed
  buildSegmentsAndChevrons(coords, color, selected, label) {
    if (!coords || coords.length !== 2) return { segments: [], chevrons: [] }
    let [[lat1, lng1], [lat2, lng2]] = coords
    lat1 = parseFloat(lat1); lng1 = parseFloat(lng1)
    lat2 = parseFloat(lat2); lng2 = parseFloat(lng2)

    const norm = lng => {
      let x = lng
      while (x > 180) x -= 360
      while (x < -180) x += 360
      return x
    }
    lng1 = norm(lng1); lng2 = norm(lng2)

    const delta = lng2 - lng1
    if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) {
      return { segments: [], chevrons: [] }
    }
    const wrappedDelta = ((delta + 540) % 360) - 180
    if (Math.abs(delta) <= 180) {
      return { segments: [ [[lat1, lng1], [lat2, lng2]] ], chevrons: [] }
    }

    const dirSign = wrappedDelta >= 0 ? 1 : -1
    const distAlong = (a, b, sign) => sign > 0 ? ((b - a + 360) % 360) : ((a - b + 360) % 360)
    const boundaryLng = dirSign > 0 ? 180 : -180
    const otherBoundaryLng = boundaryLng === 180 ? -180 : 180

    const total = Math.abs(wrappedDelta)
    const toSeam = distAlong(lng1, boundaryLng, dirSign)
    let t = total > 0 ? (toSeam / total) : 0
    if (!isFinite(t)) t = 0
    if (t < 0) t = 0
    if (t > 1) t = 1
    const latInt = lat1 + t * (lat2 - lat1)
    if (!isFinite(latInt)) {
      return { segments: [ [[lat1, lng1], [lat2, lng2]] ], chevrons: [] }
    }

    const seamA = [latInt, boundaryLng]
    const seamB = [latInt, otherBoundaryLng]
    if (!isFinite(seamA[0]) || !isFinite(seamA[1]) || !isFinite(seamB[0]) || !isFinite(seamB[1])) {
      return { segments: [ [[lat1, lng1], [lat2, lng2]] ], chevrons: [] }
    }

    const segments = [
      [[lat1, lng1], seamA],
      [seamB, [lat2, lng2]]
    ]

    const glyph = dirSign > 0 ? '\u00BB' : '\u00AB'
    const makeIcon = (g, col, label) => L.divIcon({
      className: 'geo-chevron',
      html: `<span class="chev" style="color:${col}; border-color:${col}; white-space:nowrap; display:inline-flex; align-items:center; gap:2px;"><b style="line-height:1">${g}</b><em class="chev-n" style="color:#000; line-height:1;">${label != null ? label : ''}</em></span>`,
      iconSize: [0, 0]
    })

    const chevrons = [
      { position: seamA, icon: makeIcon(glyph, color, label), key: `chev-a-${latInt}-${boundaryLng}` , boundary: boundaryLng },
      { position: seamB, icon: makeIcon(glyph, color, label), key: `chev-b-${latInt}-${otherBoundaryLng}`, boundary: otherBoundaryLng }
    ]

    return { segments, chevrons }
  }

  render() {
    const {
      isolateMode,
      handleClickGeoElement,
      onFocusElement,
      onUnfocusElement
     } = this.props

    const children = []
    const isChevronsOn = (this.state && typeof this.state.chevronsOn === 'boolean') ? this.state.chevronsOn : (!this.props.ui || this.props.ui.showChevrons !== false)
    const chevKeyPart = isChevronsOn ? 'with' : 'no'
    const seamSlots = { '180': new Map(), '-180': new Map() }
  // labelSlots used to keep track of mid-point label buckets to avoid overlaps
  const labelSlots = new Map()
    const getOffsetLat = (boundary, lat) => {
      const key = boundary === 180 ? '180' : '-180'
      const bucket = Math.round(lat * 10) / 10
      const map = seamSlots[key]
      const n = map.has(bucket) ? map.get(bucket) : 0
      const step = 0.12
      const mult = Math.floor(n / 2) + 1
      const sign = (n % 2 === 0) ? 1 : -1
      const offset = mult * step * sign
      map.set(bucket, n + 1)
      return offset
    }

    this.props.edges.forEach( (e,i) => {
      const label = i + 1
      const color = e.selected ? 'yellow' : (e.data.color ? e.data.color : 'purple')
      const weight = e.data.weight ? (e.data.weight > 6 ? 20 : Math.pow(e.data.weight,2)) : 1
      const dashArray = e.data.group ? (
        e.data.group.includes("DASHED2")?"5,2":
        e.data.group.includes("DASHED1")?"5,4":
        e.data.group.includes("DASHED-2")?"5,2,2,5,2,2,5":
        e.data.group.includes("DASHED-1")? "1,5,1,5,1":
        ""
      ) : ""
      const edgeIdSafe = (e && e.data && e.data.id != null) ? String(e.data.id) : ''
      const keyRoot = `edge-${edgeIdSafe}-${i}`
  const showChevrons = isChevronsOn
  let segments = []
  let chevrons = []
      if (showChevrons) {
        const built = this.buildSegmentsAndChevrons(e.coords, color, e.selected, label)
        segments = built.segments
        chevrons = built.chevrons
      } else {
        if (e.coords && e.coords.length === 2) {
          let [[lat1, lng1], [lat2, lng2]] = e.coords
          lat1 = parseFloat(lat1); lng1 = parseFloat(lng1)
          lat2 = parseFloat(lat2); lng2 = parseFloat(lng2)
          if (isFinite(lat1) && isFinite(lng1) && isFinite(lat2) && isFinite(lng2)) {
            segments = [ [[lat1, lng1], [lat2, lng2]] ]
          }
        }
      }
      if (segments && segments.length) {
        segments.forEach((seg, sIdx) => {
          children.push(
            <Polyline
              key={`${keyRoot}-seg-${sIdx}-${e.data && e.data.selected ? 1 : 0}-${chevKeyPart}-chev`}
              opacity={0.8}
              color={color}
              weight={weight}
              dashArray={dashArray}
              positions={seg}
              bubblingMouseEvents={false}
              eventHandlers={{
                click: () => { if (!isolateMode) handleClickGeoElement({ group: 'edge', el: e }) },
                mousedown: () => { if (isolateMode) onFocusElement(e) },
                mouseup: () => { if (isolateMode) onUnfocusElement() }
              }}
            />
          )
          const hitWeight = Math.max(weight, 24)
          children.push(
            <Polyline
              key={`${keyRoot}-seg-${sIdx}-hit-${e.data && e.data.selected ? 1 : 0}-${chevKeyPart}-chev`}
              opacity={0.001}
              color={color}
              weight={hitWeight}
              bubblingMouseEvents={false}
              positions={seg}
              eventHandlers={{
                click: () => { if (!isolateMode) handleClickGeoElement({ group: 'edge', el: e }) },
                mousedown: () => { if (isolateMode) onFocusElement(e) },
                mouseup: () => { if (isolateMode) onUnfocusElement() }
              }}
            />
          )
        })
      }
  // Render chevrons whenever the global UI toggle allows them (chevrons are
  // a drawing convention). Do not gate chevrons per-edge here; per-edge
  // arrow semantics are handled separately via the `enlightement` field
  // and the network (Cytoscape) view.
  if (isChevronsOn && chevrons && chevrons.length) {
        chevrons.forEach((ch, cIdx) => {
          let lat = parseFloat(ch.position[0])
          let lng = parseFloat(ch.position[1])
          if (!isFinite(lat) || !isFinite(lng)) return
          const boundary = ch.boundary
          if (boundary === 180 || boundary === -180) {
            lat = lat + getOffsetLat(boundary, lat)
          }
          children.push(
            <Marker
              key={`${ch.key}-${i}-${cIdx}-${chevKeyPart}-chev`}
              position={[lat, lng]}
              icon={ch.icon}
              interactive={true}
              eventHandlers={{
                click: () => { if (!isolateMode) handleClickGeoElement({ group: 'edge', el: e }) }
              }}
            />
          )
        })
      }

      // Add per-edge small arrow markers at segment ends when the CSV/DB
      // `enlightement` field equals 'arrow'. These are distinct from the
      // global drawing chevrons above and represent semantic arrowheads.
      try {
        const hasEnlight = e && e.data && String(e.data.enlightement).toLowerCase() === 'arrow'
        if (hasEnlight && segments && segments.length) {
          // small arrow icon generator (tight, no label)
          const makeArrowIcon = (col) => L.divIcon({
            className: 'geo-arrowhead',
            html: `<span style="display:inline-block; transform: translateY(-2px); color:${col}; font-size:14px;">\u25B6</span>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })
          // Place an arrow near the end of each segment, rotated to face the
          // target and slightly offset back so it visually touches the target
          segments.forEach((seg, sIdx) => {
            const last = seg && seg.length ? seg[seg.length - 1] : null
            const prev = seg && seg.length ? seg[seg.length - 2] : null
            if (!last || !prev) return
            let latA = parseFloat(last[0]); let lngA = parseFloat(last[1])
            let latP = parseFloat(prev[0]); let lngP = parseFloat(prev[1])
            if (!isFinite(latA) || !isFinite(lngA) || !isFinite(latP) || !isFinite(lngP)) return
            // compute heading from prev -> last (degrees), scaling longitude
            // differences by cos(meanLat) to approximate projection distortion
            const dy = latA - latP
            let dx = lngA - lngP
            if (dx > 180) dx -= 360
            if (dx < -180) dx += 360
            const meanLat = (latA + latP) / 2
            const meanLatRad = meanLat * Math.PI / 180
            const dxScaled = dx * Math.cos(meanLatRad)
            const rad = Math.atan2(dy, dxScaled)
            const deg = rad * 180 / Math.PI

            // offset back along the line by a small fraction so the arrow
            // appears touching the target marker instead of overlaying it.
            const backFraction = 0.02 // fraction of the segment length to step back
            const stepLat = (latA - latP) * backFraction
            const stepLng = (dx) * backFraction
            let renderLat = latA - stepLat
            let renderLng = lngA - stepLng

            // seam handling: if the last point is on the seam adjust lat offset
            const boundary = (last[1] === 180 || last[1] === -180) ? last[1] : null
            if (boundary === 180 || boundary === -180) {
              renderLat = renderLat + getOffsetLat(boundary, renderLat)
            }

            // create a rotated icon by embedding inline transform into the HTML
            const makeRotatedArrowIcon = (col, angleDeg) => L.divIcon({
              className: 'geo-arrowhead',
              html: `<span style="display:inline-block; transform: rotate(${angleDeg}deg); color:${col}; font-size:14px; line-height:1;">\u25B6</span>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            })

            const arrowIcon = makeRotatedArrowIcon(color, deg)
            children.push(
              <Marker
                key={`${keyRoot}-seg-${sIdx}-arrow-${i}-${chevKeyPart}`}
                position={[renderLat, renderLng]}
                icon={arrowIcon}
                interactive={false}
              />
            )
          })
        }
      } catch (err) { /* ignore arrow rendering errors */ }

      // Draw midpoint relationship label when geoEdgeRelVisible UI flag is true
      try {
        const geoRelVisible = !this.props.ui || typeof this.props.ui.geoEdgeRelVisible === 'undefined' ? true : !!this.props.ui.geoEdgeRelVisible
        if (geoRelVisible && e.data && e.data.relationship && e.coords && e.coords.length === 2) {
          const [[lat1, lng1], [lat2, lng2]] = e.coords
          const a1 = parseFloat(lat1); const o1 = parseFloat(lng1)
          const a2 = parseFloat(lat2); const o2 = parseFloat(lng2)
          if (isFinite(a1) && isFinite(o1) && isFinite(a2) && isFinite(o2)) {
            const midLat = (a1 + a2) / 2
            let midLng = (o1 + o2) / 2
            // normalize midLng into -180..180
            if (midLng > 180) midLng = ((midLng + 180) % 360) - 180
            if (midLng < -180) midLng = ((midLng - 180) % 360) + 180
            // compute heading angle in degrees from point1 to point2
            const dy = a2 - a1
            const dx = (o2 - o1)
            const rad = Math.atan2(dy, dx)
            const deg = rad * 180 / Math.PI
            const safeRel = String(e.data.relationship).replace(/[<>]/g, '')
            // rotate the label so it follows the line angle but keep it
            // upright (avoid upside-down text).
            const normDeg = ((deg % 360) + 360) % 360
            const uprightDeg = (normDeg > 90 && normDeg < 270) ? (normDeg + 180) % 360 : normDeg
            // compute a small perpendicular offset (in degrees lat/lng approx).
            // Use mean latitude to scale longitude effect so rotation/offset are more accurate.
            let lineLenLat = a2 - a1
            let lineLenLng = o2 - o1
            if (lineLenLng > 180) lineLenLng -= 360
            if (lineLenLng < -180) lineLenLng += 360
            const lineLen = Math.sqrt(lineLenLat * lineLenLat + lineLenLng * lineLenLng)
            const perpFactor = 0.015
            const oxUnscaled = - (lineLenLng / (lineLen || 1)) * perpFactor
            const oy = (lineLenLat / (lineLen || 1)) * perpFactor
            const meanLatRad = ((a1 + a2) / 2) * Math.PI / 180
            const ox = oxUnscaled / Math.max(0.15, Math.cos(meanLatRad))
            // To reduce overlap when many edges share the same route, use a
            // simple slotting keyed by rounded mid-lat/lng bucket and increment
            // the slot count to offset subsequent labels.
            const bucketKey = `${Math.round(midLat * 10)}/${Math.round(midLng * 10)}`
            const slotIndex = labelSlots.has(bucketKey) ? labelSlots.get(bucketKey) : 0
            labelSlots.set(bucketKey, slotIndex + 1)
            // deterministic hash of bucketKey to create stable jitter
            const hash = Math.abs(String(bucketKey).split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0))
            const rnd = ((hash % 1000) / 1000) - 0.5 // -0.5 .. +0.499
            const jitterLat = rnd * 0.06 // up to ~0.06 degrees jitter
            const rndLng = (((hash >> 3) % 1000) / 1000) - 0.5
            const jitterLng = rndLng * 0.06
            const slotOffset = (slotIndex - 0.5) * 0.025 // slightly larger separation per slot
            const offsetMidLat = midLat + oy + slotOffset + jitterLat
            const offsetMidLng = midLng + ox + jitterLng
            const html = `<div style="display:inline-block; transform: rotate(${uprightDeg}deg); background: rgba(255,255,255,0.95); padding: 2px 6px; border-radius: 3px; font-size: 11px; color: #222; white-space: nowrap;">${safeRel}</div>`
            const icon = L.divIcon({ className: 'edge-rel-label', html, iconSize: null })
            children.push(
              <Marker
                key={`rel-${keyRoot}`}
                position={[offsetMidLat, offsetMidLng]}
                icon={icon}
                interactive={false}
              />
            )
          }
        }
      } catch (err) { /* ignore malformed coords */ }
    })

    const uiKey = isChevronsOn ? 'with-chevrons' : 'no-chevrons'
    return (
      <FeatureGroup name="GeoEdges"
        pane="edgesPane"
        key={`edges-${uiKey}`}
        ref={(el) => { this._edgesGroup = el }}>
        {children}
      </FeatureGroup>
    )
  }
}
