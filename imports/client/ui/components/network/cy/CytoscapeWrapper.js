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

    return adapter
  }
}

export default CytoscapeWrapper;
