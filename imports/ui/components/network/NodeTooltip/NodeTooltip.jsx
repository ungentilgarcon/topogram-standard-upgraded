import React, { useEffect, useState } from 'react'
import './NodeTooltip.css'

// Normalized hover event: window.dispatchEvent(new CustomEvent('topo:nodeHover', { detail }))
// detail: { impl, id, data, screenX, screenY } or null to hide
function NodeTooltip() {
  const [visible, setVisible] = useState(false)
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return undefined
    function handler(evt) {
      try {
        const d = evt && evt.detail
        if (!d) {
          setVisible(false)
          setPayload(null)
          return
        }
        setPayload(d)
        setVisible(true)
      } catch (e) {
        setVisible(false)
        setPayload(null)
      }
    }
    window.addEventListener('topo:nodeHover', handler)
    return () => window.removeEventListener('topo:nodeHover', handler)
  }, [])

  if (!visible || !payload) return null

  const x = Number(payload.screenX || 0)
  const y = Number(payload.screenY || 0)

  // Render a compact key/value list. Keep z-index high so it overlays renderers.
  const rows = []
  try {
    const data = payload.data || {}
    Object.keys(data).forEach(k => {
      try { rows.push({ k, v: data[k] }) } catch (e) {}
    })
    // ensure id is visible
    if (!rows.find(r => r.k === 'id')) rows.unshift({ k: 'id', v: payload.id })
  } catch (e) { rows.push({ k: 'id', v: payload.id }) }

  // clamp to viewport roughly
  const style = { position: 'fixed', left: x + 12, top: y + 12 }
  return (
    <div className="topo-node-tooltip" style={style} role="dialog" aria-hidden={!visible}>
      <div className="topo-node-tooltip-header">{payload.impl || 'node'}</div>
      <div className="topo-node-tooltip-body">
        {rows.map((r, i) => (
          <div className="topo-node-tooltip-row" key={i}><span className="k">{String(r.k)}</span>: <span className="v">{String(typeof r.v === 'undefined' ? '' : r.v)}</span></div>
        ))}
      </div>
    </div>
  )
}

export default NodeTooltip
// Also expose CommonJS-compatible exports to defend against module namespace quirks.
// This mirrors the default export so `require()` callers receive the component function.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NodeTooltip
  module.exports.default = NodeTooltip
}

export { NodeTooltip }
