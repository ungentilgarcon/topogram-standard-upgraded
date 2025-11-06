/* CytoscapeWrapper
 * Mounts a real Cytoscape instance into the provided container and returns
 * an adapter object exposing a cy-like API. Uses dynamic require to avoid
 * static module resolution errors during incremental migration.
 */

function safeRequire(name) {
  try { return require(name); } catch (e) { return null; }
}

const CytoscapeWrapper = {
  async mount({ container, elements = [], layout = { name: 'preset' }, stylesheet = [] }) {
    const cytoscape = safeRequire('cytoscape');
    if (!cytoscape) {
      console.warn('Cytoscape not installed; returning noop adapter');
      return {
        impl: 'cy',
        getInstance() { return null },
        on() {}, off() {}, fit() {}, resize() {}, zoom() {}, center() {},
        nodes() { return { length: 0, forEach: () => {}, filter: () => [] } },
        edges() { return { length: 0, forEach: () => {}, filter: () => [] } },
        elements() { return { nodes: [], edges: [] } },
        select() {}, unselect() {}, add() {}, remove() {}, filter() { return [] },
        destroy() {}
      }
    }

    // mount DOM holder
    const holder = document.createElement('div')
    holder.style.width = '100%'
    holder.style.height = '100%'
    container.appendChild(holder)

    // try to load cola plugin if available
    const cola = safeRequire('cytoscape-cola')
    if (cola && typeof cytoscape.use === 'function') {
      try { cytoscape.use(cola) } catch (e) { /* ignore */ }
    }

  const cy = cytoscape({ container: holder, elements: elements || [], style: stylesheet || [], layout: layout || { name: 'preset' } })

    const adapter = {
      impl: 'cy',
      getInstance() { return cy },
      on(event, handler) { try { cy.on(event, handler) } catch (e) {} },
      off(event, handler) { try { cy.off(event, handler) } catch (e) {} },
      fit() { try { cy.fit() } catch (e) {} },
      resize() { try { cy.resize() } catch (e) {} },
      zoom(level) { try { cy.zoom(level) } catch (e) {} },
      center() { try { cy.center() } catch (e) {} },
      nodes() { try { return cy.nodes() } catch (e) { return { length: 0, forEach: () => {}, filter: () => [] } } },
      edges() { try { return cy.edges() } catch (e) { return { length: 0, forEach: () => {}, filter: () => [] } } },
      elements() { try { return cy.elements() } catch (e) { return { nodes: [], edges: [] } } },
      select(id) { try { const el = cy.getElementById(id); if (el && el.select) el.select() } catch (e) {} },
      unselect(id) { try { const el = cy.getElementById(id); if (el && el.unselect) el.unselect() } catch (e) {} },
      add(elementsToAdd) { try { if (elementsToAdd && elementsToAdd.length) cy.add(elementsToAdd) } catch (e) {} },
      remove(elementsToRemove) { try { if (elementsToRemove && elementsToRemove.length) cy.remove(elementsToRemove) } catch (e) {} },
      filter(fn) { try { return cy.nodes().filter(fn) } catch (e) { return [] } },
      destroy() { try { if (cy && cy.destroy) cy.destroy() } catch (e) {} try { if (holder && holder.parentNode) holder.parentNode.removeChild(holder) } catch (e) {} }
    }

    // --- Extra position layer (positionx/positiony) ----------------------------
    try {
      // Ensure the outer container can host absolute overlays
      try { if (container && (!container.style || !container.style.position || container.style.position === '')) container.style.position = 'relative' } catch (e) {}
      const overlayPoints = []
      try {
        (elements || []).forEach(el => {
          try {
            if (!el || !el.data) return
            const d = el.data
            const isNode = d && (d.source == null && d.target == null)
            if (!isNode) return
            const px = (d.positionx != null) ? Number(d.positionx) : (d.posx != null ? Number(d.posx) : (d.xPos != null ? Number(d.xPos) : null))
            const py = (d.positiony != null) ? Number(d.positiony) : (d.posy != null ? Number(d.posy) : (d.yPos != null ? Number(d.yPos) : null))
            if (!Number.isFinite(px) || !Number.isFinite(py)) return
            overlayPoints.push({ id: String(d.id != null ? d.id : ''), x: px, y: py })
          } catch (e) {}
        })
      } catch (e) {}
      if (overlayPoints.length) {
        const canvas = document.createElement('canvas')
        canvas.style.position = 'absolute'
        canvas.style.left = '0'
        canvas.style.top = '0'
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.pointerEvents = 'none'
        canvas.style.zIndex = '5'
        container.appendChild(canvas)

        const pad = 8
        const ext = overlayPoints.reduce((acc, p) => ({
          minX: Math.min(acc.minX, p.x),
          maxX: Math.max(acc.maxX, p.x),
          minY: Math.min(acc.minY, p.y),
          maxY: Math.max(acc.maxY, p.y)
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })

        const draw = () => {
          try {
            const w = container.clientWidth || 0
            const h = container.clientHeight || 0
            if (!w || !h) return
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            ctx.clearRect(0, 0, w, h)
            if (!Number.isFinite(ext.minX) || !Number.isFinite(ext.maxX) || !Number.isFinite(ext.minY) || !Number.isFinite(ext.maxY)) return
            const spanX = (ext.maxX - ext.minX) || 1
            const spanY = (ext.maxY - ext.minY) || 1
            const sx = (w - pad * 2) / spanX
            const sy = (h - pad * 2) / spanY
            ctx.fillStyle = 'rgba(30, 136, 229, 0.35)'
            const r = 3
            overlayPoints.forEach(p => {
              const vx = pad + (p.x - ext.minX) * sx
              const vy = pad + (p.y - ext.minY) * sy
              ctx.beginPath()
              ctx.arc(vx, h - vy, r, 0, Math.PI * 2)
              ctx.fill()
            })
          } catch (e) {}
        }

        let ro = null
        try {
          if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => draw())
            ro.observe(container)
          } else {
            window.addEventListener('resize', draw)
          }
        } catch (e) {}
        try { draw(); requestAnimationFrame(draw) } catch (e) {}
        // cleanup
        try { adapter.destroy = ((orig) => () => { try { if (ro && ro.disconnect) ro.disconnect() } catch (e) {} try { if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas) } catch (e) {} try { if (typeof orig === 'function') orig() } catch (e) {} })(adapter.destroy) } catch (e) {}
      }
    } catch (e) {}

    return adapter
  }
}

export default CytoscapeWrapper;
