// Deprecated shim delegating to RealReagraphAdapter. Lightweight SVG implementation removed.
import RealReagraphAdapter from './RealReagraphAdapter';

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  try { console.warn && console.warn('Deprecated: reagraph/ReagraphAdapter.js now delegates to RealReagraphAdapter. Please update imports.'); } catch (e) {}
}

export default {
  async mount(opts = {}, env = {}) {
    warnOnce();
    const mod = RealReagraphAdapter && (RealReagraphAdapter.default || RealReagraphAdapter);
    const mount = (mod && mod.mount) || (RealReagraphAdapter && RealReagraphAdapter.mount);
    if (typeof mount === 'function') return mount(opts, env);
    return { impl: 'reagraph', noop: true };
  }
};
/* ReagraphAdapter
 * Lightweight, dependency-free adapter that renders a simple SVG graph in the
 * provided container and exposes a small Cytoscape-like API so TopogramDetail
 * can use `?graph=reagraph` without pulling the full Reagraph dependency.
 */

/* Legacy lightweight SVG implementation (commented out)
// Translate cy-style elements to simple node/edge arrays
let cyElementsToGraphology = null;
try {
  const mod = require('../graphAdapters/cyElementsToGraphology');
  cyElementsToGraphology = mod && (mod.default || mod);
} catch (e) {
  cyElementsToGraphology = null;
}

const ReagraphAdapter = {
  async mount({ container, elements = [], layout = null, stylesheet = null } = {}) {
    if (!container) return { impl: 'reagraph', noop: true };

    if (typeof cyElementsToGraphology !== 'function') {
      console.warn('ReagraphAdapter: cyElementsToGraphology not available');
      return { impl: 'reagraph', noop: true };
    }

  // build internal model
  const { nodes = [], edges = [] } = cyElementsToGraphology(elements || []);
    const nodeMap = new Map();
    nodes.forEach(n => {
      const attrs = Object.assign({}, n.attrs || {});
      // coerce numeric x/y
      
  try { numericWeights.push(Number((n.attrs && (n.attrs.weight != null ? n.attrs.weight : 1)) || 1)); } catch (e) {}
*/
