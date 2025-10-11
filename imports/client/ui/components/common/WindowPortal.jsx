import React from 'react'
import ReactDOM from 'react-dom'

function copyStyles(sourceDoc, targetDoc) {
  try {
    const nodes = sourceDoc.querySelectorAll('style, link[rel="stylesheet"]')
    nodes.forEach((node) => {
      const clone = node.cloneNode(true)
      // Reduce devtools sourcemap noise inside the pop-out by stripping inline sourcemap comments
      if (clone.tagName === 'STYLE' && clone.textContent && /# sourceMappingURL=/.test(clone.textContent)) {
        try { clone.textContent = clone.textContent.replace(/\n\/\/# sourceMappingURL=.*$/gm, '') } catch (e) {}
      }
      // Mark as silent for tooling that might read this
      try { clone.setAttribute('data-sourcemap-silent', 'true') } catch (e) {}
      targetDoc.head.appendChild(clone)
    })
  } catch (e) {
    // best effort; ignore cross-origin or other failures
  }
}

export default class WindowPortal extends React.Component {
  componentDidMount() {
    if (typeof window === 'undefined') return
    const { title, features } = this.props
    this.externalWindow = window.open('', this.props.name || '', features || 'width=800,height=600,resizable=yes,scrollbars=yes')
    if (!this.externalWindow || this.externalWindow.closed) return
    const baseHref = (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : (window.location.origin + '/')
    try {
      this.externalWindow.document.open()
      const injectedStyle = `
        html, body.__popup_theme { background:#37474F; color:#F2EFE9; font-family:Arial,Helvetica,sans-serif; }
        /* Constrain content width for better readability in pop-outs */
        body.__popup_theme .__popup_content { max-width: 1100px; margin: 0 auto; }

        /* Generic chart readability on dark background (SVG text labels, axes, legends) */
        body.__popup_theme svg text { fill: #F2EFE9; }
        /* Outline arc/pie labels for contrast against bright slices */
        body.__popup_theme .chart-arc-label, body.__popup_theme svg .arc-label, body.__popup_theme svg .recharts-text {
          stroke: rgba(38,50,56,0.65); stroke-width: 1.6px; paint-order: stroke fill;
        }
        /* Recharts tooltip container tweaks */
        body.__popup_theme .recharts-default-tooltip { background: rgba(33, 33, 33, 0.9) !important; color: #F2EFE9 !important; border: 1px solid #78909C !important; }
        body.__popup_theme .recharts-default-tooltip ul, body.__popup_theme .recharts-default-tooltip li { color: #F2EFE9 !important; }

        /* Material button tweaks inside pop-out */
        body.__popup_theme .mui-raised-button, body.__popup_theme .mui-raised-button > button { background: #546E7A !important; color: #F2EFE9 !important; }
        body.__popup_theme .mui-raised-button-label { color: #F2EFE9 !important; font-weight: 700; }

        /* Slight font bump for typical text containers inside pop-outs (helps legends) */
        body.__popup_theme .__popup_content, body.__popup_theme .__popup_content a,
        body.__popup_theme .__popup_content td, body.__popup_theme .__popup_content tbody,
        body.__popup_theme .__popup_content div { font-size: 12pt !important; }
      `
      this.externalWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title || ''}</title><base href="${baseHref}"><style>${injectedStyle}</style></head><body class="__popup_theme" style="margin:0;"><div id="__popup_root" style="padding:10px">Loading…</div></body></html>`)
      this.externalWindow.document.close()
    } catch (e) { /* ignore */ }
    try { this.externalWindow.focus() } catch (e) {}
    // Defer initialization until the external window is ready
    const init = () => {
      try {
  // Copy styles after skeleton is ready
        copyStyles(document, this.externalWindow.document)
  this.containerEl = this.externalWindow.document.getElementById('__popup_root')
  // Trigger an initial render into the external window via React portal
  try { this.forceUpdate() } catch (e) {}
        // Nudge layouts (like C3) inside the pop-out to compute to the new window size
        try {
          const fire = () => { try { this.externalWindow.dispatchEvent(new this.externalWindow.Event('resize')) } catch (e) {} }
          if (this.externalWindow.requestAnimationFrame) this.externalWindow.requestAnimationFrame(fire)
          setTimeout(fire, 50)
        } catch (e) { /* ignore */ }

        // Attempt to resize the external window to fit content nicely
        const adjustToContent = () => {
          try {
            if (!this.externalWindow || this.externalWindow.closed) return
            const doc = this.externalWindow.document
            const body = doc && doc.body
            const container = this.containerEl
            if (!body || !container) return
            const aw = this.externalWindow.screen ? (this.externalWindow.screen.availWidth || this.externalWindow.innerWidth || 1280) : (this.externalWindow.innerWidth || 1280)
            const ah = this.externalWindow.screen ? (this.externalWindow.screen.availHeight || this.externalWindow.innerHeight || 800) : (this.externalWindow.innerHeight || 800)
            // Measure desired content size (include some padding for header/margins)
            const desiredW = Math.min(Math.round(aw * 0.85), Math.max(760, Math.min(1100, (container.scrollWidth || container.offsetWidth || 900) + 40)))
            const desiredH = Math.min(ah - 80, Math.max(560, (container.scrollHeight || container.offsetHeight || 600) + 80))
            // Resize and center
            try { this.externalWindow.resizeTo(desiredW, desiredH) } catch (e) {}
            try {
              const l = Math.max(0, Math.round((aw - desiredW) / 2))
              const t = Math.max(0, Math.round((ah - desiredH) / 2))
              this.externalWindow.moveTo(l, t)
            } catch (e) {}
            // Trigger a final layout after resizing
            try { this.externalWindow.dispatchEvent(new this.externalWindow.Event('resize')) } catch (e) {}
          } catch (e) { /* ignore */ }
        }
        // Run once soon and once after a short delay to catch late layout
        setTimeout(adjustToContent, 120)
        setTimeout(adjustToContent, 450)
      } catch (e) {
        // best effort
      }
    }

    // If document is already ready, init immediately; otherwise wait for load
    try {
      const ready = this.externalWindow.document && (this.externalWindow.document.readyState === 'interactive' || this.externalWindow.document.readyState === 'complete')
      if (ready) {
        init()
      } else {
        // Try multiple signals
        this.externalWindow.addEventListener('DOMContentLoaded', init, { once: true })
        this.externalWindow.addEventListener('load', init, { once: true })
        // Poll as a fallback to handle edge cases where events are missed
        let tries = 0
        this._ensureReadyInterval = setInterval(() => {
          tries += 1
          try {
            if (!this.externalWindow || this.externalWindow.closed) { clearInterval(this._ensureReadyInterval); return }
            const doc = this.externalWindow.document
            if (doc && doc.body) {
              clearInterval(this._ensureReadyInterval)
              init()
            }
          } catch (e) {
            clearInterval(this._ensureReadyInterval)
          }
          if (tries > 40) { // ~8s at 200ms
            clearInterval(this._ensureReadyInterval)
            init()
          }
        }, 200)
      }
    } catch (e) {
      // fallback
      setTimeout(init, 0)
    }

    this.externalWindow.addEventListener('beforeunload', this.handleExternalClose)
  }

  componentDidUpdate() { this._renderSubtree() }
  // With portals we don't need imperative re-rendering; keep for backward safety
  // componentDidUpdate() { /* no-op */ }

  componentWillUnmount() {
    this._teardown()
  }

  handleExternalClose = () => {
    if (this.props.onClose) this.props.onClose()
    this._teardown()
  }

  _teardown() {
    if (this._ensureReadyInterval) { try { clearInterval(this._ensureReadyInterval) } catch (e) {} this._ensureReadyInterval = null }
    if (this.containerEl) {
      try { ReactDOM.unmountComponentAtNode(this.containerEl) } catch (e) {}
    }
    if (this.externalWindow) {
      try { this.externalWindow.removeEventListener('beforeunload', this.handleExternalClose) } catch (e) {}
      try { this.externalWindow.close() } catch (e) {}
    }
    this.containerEl = null
    this.externalWindow = null
  }

  _renderSubtree() { /* legacy no-op */ }

  render() {
    if (!this.containerEl) return null
    let content = this.props.children
    if (Array.isArray(content)) content = React.createElement('div', null, content)
    return ReactDOM.createPortal(content, this.containerEl)
  }
}
