import React, { useState } from 'react'
import Popup from '/imports/client/ui/components/common/Popup.jsx'

// SelectionPanel: lightweight list of selected nodes/edges. Can be rendered
// inline or as a floating popup (pop-out) via the Popup component.
export default function SelectionPanel({ selectedElements = [], onUnselect = () => {}, onClear = () => {}, updateUI = null, light = true }) {
  const nodes = selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))
  const edges = selectedElements.filter(e => e && e.data && (e.data.source != null || e.data.target != null))
  const [exportTitle, setExportTitle] = useState('')

  const handleClose = () => {
    // Prefer consumer-provided updateUI to persist the panel hidden; otherwise fall back to noop
    try {
      if (updateUI) updateUI('selectionPanelPinned', false)
    } catch (e) {
      try { if (typeof console !== 'undefined') console.error('[SelectionPanel] updateUI threw', e) } catch (_) {}
    }
  }

  const _quote = (v) => {
    if (v === null || typeof v === 'undefined') return '""'
    const s = String(v)
    return '"' + s.replace(/"/g, '""') + '"'
  }

  const exportSelectedCsv = () => {
    try {
  const headerArr = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','emoji','extra']
      const idMap = new Map()
      // create id mapping for nodes similar to topogram exporter
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
        return String(v)
      }

      const rows = []
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

      const EOL = '\r\n'
      const rawTitle = exportTitle || 'selection'
      let safeTitleStr = rawTitle.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
      safeTitleStr = safeTitleStr.replace(/^\s*#+\s*/, '')
      safeTitleStr = safeTitleStr.replace(/[\u0000-\u001F\u007F]/g, '')
      const titleLine = `# Selection: ${safeTitleStr}`
      const headerLine = headerArr.map(_quote).join(',')
      const bodyLines = rows.map(r => r.map(_quote).join(','))
      const csvText = [titleLine, headerLine, ...bodyLines].join(EOL)

      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      let safeTitle = rawTitle.replace(/[^a-z0-9-_\.]/gi, '_')
      safeTitle = safeTitle.slice(0, 24)
      safeTitle = safeTitle.replace(/^[_\.]+|[_\.]+$/g, '') || String(Date.now()).slice(-8)
      a.download = `selection-${safeTitle}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      try { if (typeof console !== 'undefined') console.error('[SelectionPanel] exportSelectedCsv failed', e) } catch (_) {}
      alert('Failed to export selection CSV: ' + String(e))
    }
  }

  return (
    <Popup
      light={light}
      show
      title={'Selection'}
      onClose={handleClose}
      onPopOut={() => { /* Popup handles poppedOut state internally */ }}
      width={380}
      height={420}
    >
      <div className="selection-panel">
        <div className="selection-header">
          <strong>Selection</strong>
          <div className="selection-actions">
            <input
              className="selection-export-title"
              placeholder="Export title (optional)"
              value={exportTitle}
              onChange={e => setExportTitle(e.target.value)}
              style={{ marginRight: 8 }}
            />
            <button className="cy-control-btn" onClick={exportSelectedCsv}>Export CSV</button>
            <button className="cy-control-btn" onClick={onClear}>Clear</button>
          </div>
        </div>
        <div className="selection-body">
          <div className="selection-section">
            <div className="selection-section-title">Nodes ({nodes.length})</div>
            <ul className="selection-list">
              {nodes.map((n, idx) => (
                <li key={idx} className="selection-item">
                  <span className="selection-item-label">{(n.data && (n.data.label || n.data.name)) || n._id || (n.data && n.data.id)}</span>
                  <button className="cy-control-btn" onClick={() => onUnselect(n)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="selection-section">
            <div className="selection-section-title">Edges ({edges.length})</div>
            <ul className="selection-list">
              {edges.map((e, idx) => (
                <li key={idx} className="selection-item">
                  <span className="selection-item-label">{(e.data && e.data.name) || `${e.data && e.data.source} → ${e.data && e.data.target}`}</span>
                  <button className="cy-control-btn" onClick={() => onUnselect(e)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Popup>
  )
}
