import React, { useMemo, useState, useEffect } from 'react'
import Popup from '/imports/client/ui/components/common/Popup.jsx'

// SelectionPanel: lightweight list of selected nodes/edges. Can be rendered
// inline or as a floating popup (pop-out) via the Popup component.
export default function SelectionPanel({ selectedElements = [], onUnselect = () => {}, onClear = () => {}, onSelectAdjacent = null, updateUI = null, availableNodes = null, onAddNode = null, light = true }) {
  const nodes = selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))
  const edges = selectedElements.filter(e => e && e.data && (e.data.source != null || e.data.target != null))
  const [exportTitle, setExportTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)
  const [activeKey, setActiveKey] = useState(null)

  const buildKey = (el, fallbackIndex, scope = 'generic') => {
    if (!el) return `${scope}-null`
    const data = el.data || {}
    if (data.id != null) return `${scope}-data-${String(data.id)}`
    if (data.source != null || data.target != null) {
      const base = data.id != null ? String(data.id) : `${String(data.source || '')}->${String(data.target || '')}`
      return `${scope}-edge-${base}`
    }
    if (el._id != null) return `${scope}-doc-${String(el._id)}`
    if (el.id != null) return `${scope}-obj-${String(el.id)}`
    return `${scope}-idx-${fallbackIndex}`
  }

  const nodeEntries = useMemo(() => nodes.map((n, idx) => ({ element: n, key: buildKey(n, idx, 'node') })), [nodes])
  const edgeEntries = useMemo(() => edges.map((e, idx) => ({ element: e, key: buildKey(e, idx, 'edge') })), [edges])

  const activeElement = useMemo(() => {
    if (!activeKey) return null
    const all = [...nodeEntries, ...edgeEntries]
    const found = all.find(entry => entry.key === activeKey)
    return found ? found.element : null
  }, [activeKey, nodeEntries, edgeEntries])

  useEffect(() => {
    if (!activeKey) return
    const stillExists = nodeEntries.some(entry => entry.key === activeKey) || edgeEntries.some(entry => entry.key === activeKey)
    if (!stillExists) setActiveKey(null)
  }, [activeKey, nodeEntries, edgeEntries])

  const matchesFor = (q) => {
    if (!q || !availableNodes || !Array.isArray(availableNodes)) return []
    const s = String(q).trim().toLowerCase()
    if (!s) return []
    const results = []
    try {
      for (let i = 0; i < availableNodes.length; i++) {
        const n = availableNodes[i]
        if (!n) continue
        const d = n.data || {}
        const cand = [String(d && d.name || ''), String(d && d.label || ''), String(d && d.id || ''), String(n._id || ''), String(n.id || '')].join(' ').toLowerCase()
        if (cand.indexOf(s) !== -1) results.push(n)
        if (results.length >= 40) break
      }
    } catch (e) {}
    return results
  }

  const handlePick = (node) => {
    try {
      try { console.debug && console.debug('SelectionPanel.handlePick', { pickedNode: node && (node._id || node.id) }) } catch (e) {}
      if (!node) return
      if (typeof onAddNode === 'function') onAddNode(node)
    } catch (e) {}
    setSearchQuery('')
    setSuggestionsVisible(false)
  }

  const handleClose = () => {
    // Prefer consumer-provided updateUI to persist the panel hidden; otherwise fall back to noop
    try {
      if (updateUI) updateUI('selectionPanelPinned', false)
      try {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('topo.selectionPanelPinned', 'false')
      } catch (e) {}
      try { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('topo:panelToggle', { detail: { selectionPanelPinned: false } })) } catch (e) {}
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

  const renderChipLabel = (element, type) => {
    const data = element && element.data
    if (type === 'edge') {
      const name = data && (data.name || data.label || data.type || data.relation)
      if (name) return name
      const src = data && (data.source || data.from)
      const tgt = data && (data.target || data.to)
      if (src != null || tgt != null) return `${src || '?'} → ${tgt || '?'}`
      return 'Edge'
    }
    return (data && (data.label || data.name)) || element._id || (data && data.id) || 'Node'
  }

  const renderValue = (value) => {
    if (value == null || value === '') return <span className="selection-detail-empty">—</span>
    if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
      try {
        const formatted = JSON.stringify(value, null, 2)
        return <pre>{formatted}</pre>
      } catch (e) {
        return <pre>{String(value)}</pre>
      }
    }
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  const detailEntries = useMemo(() => {
    if (!activeElement) return []
    const data = activeElement.data || {}
    const entries = []
    if (activeElement._id != null) entries.push(['_id', activeElement._id])
    if (activeElement.id != null) entries.push(['id', activeElement.id])
    Object.keys(data).sort().forEach(key => {
      entries.push([key, data[key]])
    })
    return entries
  }, [activeElement])

  const dismissDetail = () => setActiveKey(null)

  const isActive = (entryKey) => activeKey === entryKey

  const handleUnselect = (element, entryKey) => {
    try { onUnselect(element) } catch (e) {}
    if (entryKey && entryKey === activeKey) setActiveKey(null)
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
            {availableNodes && Array.isArray(availableNodes) ? (
              <div style={{ display: 'inline-block', position: 'relative', marginRight: 8 }}>
                <input
                  className="selection-search-input"
                  placeholder="Add node to selection..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSuggestionsVisible(true) }}
                  onFocus={() => setSuggestionsVisible(true)}
                  onBlur={() => setTimeout(() => setSuggestionsVisible(false), 150)}
                  style={{ minWidth: 160 }}
                />
                {suggestionsVisible && searchQuery ? (
                  <div className="selection-search-suggestions" style={{ position: 'absolute', left: 0, right: 0, zIndex: 1000, background: '#fff', border: '1px solid #ddd', maxHeight: 220, overflow: 'auto' }}>
                    {matchesFor(searchQuery).length ? matchesFor(searchQuery).slice(0, 40).map((n, idx) => (
                      <div key={idx} className="selection-suggestion-item" style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={() => handlePick(n)}>
                        {(n && n.data && (n.data.name || n.data.label)) || n.name || n.label || String(n._id || n.id || '')}
                      </div>
                    )) : <div style={{ padding: 8, color: '#666' }}>No matches</div>}
                  </div>
                ) : null}
              </div>
            ) : null}
            <input
              className="selection-export-title"
              placeholder="Export title (optional)"
              value={exportTitle}
              onChange={e => setExportTitle(e.target.value)}
              style={{ marginRight: 8 }}
            />
            <button className="cy-control-btn" onClick={exportSelectedCsv}>Export CSV</button>
            {onSelectAdjacent ? (
              <button
                className="cy-control-btn"
                onClick={onSelectAdjacent}
                disabled={!nodes.length}
              >
                Select adjacent
              </button>
            ) : null}
            <button className="cy-control-btn" onClick={onClear}>Clear</button>
          </div>
        </div>
        <div className="selection-body">
          <div className="selection-section">
            <div className="selection-section-title">Nodes ({nodes.length})</div>
            <div className="selection-chip-row">
              {nodeEntries.length ? nodeEntries.map(({ element, key }) => (
                <div key={key} className={`selection-chip${isActive(key) ? ' is-active' : ''}`} onClick={() => setActiveKey(key)} role="button" tabIndex={0} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setActiveKey(key) } }}>
                  <span className="selection-chip-label">{renderChipLabel(element, 'node')}</span>
                  <button type="button" className="selection-chip-remove" aria-label="Remove node from selection" onClick={ev => { ev.stopPropagation(); handleUnselect(element, key) }}>×</button>
                </div>
              )) : <div className="selection-chip-empty">No nodes selected.</div>}
            </div>
          </div>
          <div className="selection-section">
            <div className="selection-section-title">Edges ({edges.length})</div>
            <div className="selection-chip-row">
              {edgeEntries.length ? edgeEntries.map(({ element, key }) => (
                <div key={key} className={`selection-chip${isActive(key) ? ' is-active' : ''}`} onClick={() => setActiveKey(key)} role="button" tabIndex={0} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setActiveKey(key) } }}>
                  <span className="selection-chip-label">{renderChipLabel(element, 'edge')}</span>
                  <button type="button" className="selection-chip-remove" aria-label="Remove edge from selection" onClick={ev => { ev.stopPropagation(); handleUnselect(element, key) }}>×</button>
                </div>
              )) : <div className="selection-chip-empty">No edges selected.</div>}
            </div>
          </div>
          {activeElement ? (
            <div className="selection-detail-card">
              <div className="selection-detail-header">
                <div>
                  <strong>{renderChipLabel(activeElement, activeElement && activeElement.data && (activeElement.data.source != null || activeElement.data.target != null) ? 'edge' : 'node')}</strong>
                  <span className="selection-detail-subtitle">{(activeElement.data && (activeElement.data.source != null || activeElement.data.target != null)) ? 'Edge details' : 'Node details'}</span>
                </div>
                <button type="button" className="selection-detail-close" onClick={dismissDetail}>Close</button>
              </div>
              <dl className="selection-detail-grid">
                {detailEntries.length ? detailEntries.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{renderValue(v)}</dd>
                  </React.Fragment>
                )) : (
                  <React.Fragment>
                    <dt>Info</dt>
                    <dd className="selection-detail-empty">No additional data.</dd>
                  </React.Fragment>
                )}
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </Popup>
  )
}
