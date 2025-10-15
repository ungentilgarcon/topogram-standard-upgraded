/* ReagraphAdapter stub
 * Minimal adapter shape to mount Reagraph and expose a cy-like API
 * This is a placeholder implementation — Reagraph mounting may be done via React rendering.
 */
const ReagraphAdapter = {
  async mount({ container, elements, layout, stylesheet }) {
    // For now, provide a no-op adapter with methods for compatibility.
    const adapter = {
      impl: 'reagraph',
      getInstance() { return null; },
      on() {}, off() {}, fit() {}, resize() {}, zoom() {}, center() {},
      nodes() { return elements.filter(e => e.group === 'nodes').map(n => n.data.id); },
      edges() { return elements.filter(e => e.group === 'edges').map(e => e.data); },
      elements() { return { nodes: [], edges: [] }; },
      select() {}, unselect() {}, add() {}, remove() {}, filter() { return []; },
      destroy() {}
    };

    return adapter;
  }
};

export default ReagraphAdapter;
