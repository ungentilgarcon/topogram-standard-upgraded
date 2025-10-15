/**
 * cyElementsToGraphology
 * Convert Cytoscape-style elements array to { nodes: [{id, attrs}], edges: [{id, source, target, attrs}] }
 */
export default function cyElementsToGraphology(elements = []) {
  const nodes = [];
  const edges = [];

  elements.forEach(el => {
    if (!el || !el.data) return;
    if (el.group === 'nodes' || el.data && el.data.source === undefined && el.data.target === undefined) {
      nodes.push({ id: el.data.id, attrs: { ...el.data, x: el.position ? el.position.x : el.data.x, y: el.position ? el.position.y : el.data.y } });
    } else {
      edges.push({ id: el.data.id || `${el.data.source}-${el.data.target}`, source: el.data.source, target: el.data.target, attrs: { ...el.data } });
    }
  });

  return { nodes, edges };
}
