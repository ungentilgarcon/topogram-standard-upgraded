// Utility: convert Cytoscape-style elements into a Graphology-like shape
// This is a lightweight helper for the adapters to evolve.

export function cyElementsToGraphology(elements) {
  const safeNodes = Array.isArray(elements && elements.nodes) ? elements.nodes : [];
  const safeEdges = Array.isArray(elements && elements.edges) ? elements.edges : [];
  const arrayEls = Array.isArray(elements) ? elements : [];

  const nodes = [];
  const edges = [];

  function normalizeNode(entry) {
    const data = (entry && entry.data) ? { ...entry.data } : {};
    const pos = (entry && entry.position) ? entry.position : {};
    const classes = entry && entry.classes ? String(entry.classes).split(/\s+/).filter(Boolean) : [];
    const id = data.id || data._id || String(Math.random());
    if (data.id == null) data.id = id;
    const attrs = { ...data };
    if (classes.length) attrs.classes = classes.join(' ');
    if ((entry && entry.selected) || classes.includes('selected')) attrs.selected = true;
    if (classes.includes('hidden') && attrs.hidden == null) attrs.hidden = true;
    const node = {
      id,
      attrs,
      data: attrs,
      ...attrs,
    };
    if (pos && pos.x != null) node.x = pos.x;
    if (pos && pos.y != null) node.y = pos.y;
    return node;
  }

  function normalizeEdge(entry) {
    const data = (entry && entry.data) ? { ...entry.data } : {};
    const classes = entry && entry.classes ? String(entry.classes).split(/\s+/).filter(Boolean) : [];
    const id = data.id || data._id || String(Math.random());
    const source = data.source != null ? String(data.source) : undefined;
    const target = data.target != null ? String(data.target) : undefined;
    if (data.id == null) data.id = id;
    const attrs = { ...data };
    if (classes.length) attrs.classes = classes.join(' ');
    if ((entry && entry.selected) || classes.includes('selected')) attrs.selected = true;
    if (classes.includes('hidden') && attrs.hidden == null) attrs.hidden = true;
    const edge = {
      id,
      source,
      target,
      attrs,
      data: attrs,
      ...attrs,
    };
    return edge;
  }

  safeNodes.forEach((entry) => { nodes.push(normalizeNode(entry)); });
  safeEdges.forEach((entry) => { edges.push(normalizeEdge(entry)); });

  if (arrayEls.length) {
    arrayEls.forEach((entry) => {
      const data = entry && entry.data;
      const looksLikeEdge = !!(data && (data.source != null || data.target != null)) || (entry && String(entry.group || '').toLowerCase() === 'edges');
      if (looksLikeEdge) {
        edges.push(normalizeEdge(entry));
      } else {
        nodes.push(normalizeNode(entry));
      }
    });
  }

  return { nodes, edges };
}

export default cyElementsToGraphology
