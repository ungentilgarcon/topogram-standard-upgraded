import React from 'react'
import Popup from '/imports/client/ui/components/common/Popup.jsx'

// SelectionPanel: lightweight list of selected nodes/edges. Can be rendered
// inline or as a floating popup (pop-out) via the Popup component.
export default function SelectionPanel({ selectedElements = [], onUnselect = () => {}, onClear = () => {}, updateUI = null, light = true }) {
  const nodes = selectedElements.filter(e => e && e.data && (e.data.source == null && e.data.target == null))
  const edges = selectedElements.filter(e => e && e.data && (e.data.source != null || e.data.target != null))

  const handleClose = () => {
    // Prefer consumer-provided updateUI to persist the panel hidden; otherwise fall back to noop
    try {
      if (updateUI) updateUI('selectionPanelPinned', false)
    } catch (e) {
      try { if (typeof console !== 'undefined') console.error('[SelectionPanel] updateUI threw', e) } catch (_) {}
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
