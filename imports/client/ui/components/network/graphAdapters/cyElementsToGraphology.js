// Utility: convert Cytoscape-style elements into a Graphology-like shape
// This is a lightweight helper for the adapters to evolve.

export function cyElementsToGraphology(elements) {
  const nodes = (elements && elements.nodes) ? elements.nodes.map(n => ({
    id: n.data.id || n.data._id || String(Math.random()),
    ...n.data,
    x: n.position && n.position.x,
    y: n.position && n.position.y
  })) : []

  const edges = (elements && elements.edges) ? elements.edges.map(e => ({
    id: e.data.id || e.data._id || String(Math.random()),
    source: e.data.source,
    target: e.data.target,
    ...e.data
  })) : []

  return { nodes, edges }
}

export default cyElementsToGraphology
