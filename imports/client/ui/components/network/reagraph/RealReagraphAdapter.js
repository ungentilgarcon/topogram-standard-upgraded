import React from 'react';
import { createRoot } from 'react-dom/client';

let cyElementsToGraphology = null;

async function ensureCyElementsToGraphology() {
  if (typeof cyElementsToGraphology === 'function') return cyElementsToGraphology;
  try {
    const mod = await import('../utils/cyElementsToGraphology.js');
    cyElementsToGraphology = mod && (mod.default || mod);
  } catch (err) {
    cyElementsToGraphology = null;
  }
  return cyElementsToGraphology;
}

function stringToColorHex(str) {
  try {
    const value = str || '';
    let h = 0;
    for (let i = 0; i < value.length; i += 1) {
      h = (h * 31 + value.charCodeAt(i)) >>> 0;
    }
    const hue = h % 360;
    const sat = 62;
    const light = 52;
    const hNorm = hue / 360;
    const s = sat / 100;
    const l = light / 100;
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    let r;
    let g;
    let b;
    if (s === 0) {
      r = l;
      g = l;
      b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, hNorm + 1 / 3);
      g = hue2rgb(p, q, hNorm);
      b = hue2rgb(p, q, hNorm - 1 / 3);
    }
    const toHex = (x) => {
      const v = Math.round(x * 255);
      return (v < 16 ? '0' : '') + v.toString(16);
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch (err) {
    return '#1f2937';
  }
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const val = Number.isFinite(value) ? value : Number(value || 0);
  const imin = Number.isFinite(inMin) ? inMin : 0;
  const imax = Number.isFinite(inMax) && inMax !== inMin ? inMax : imin + 1;
  const omin = Number.isFinite(outMin) ? outMin : 0;
  const omax = Number.isFinite(outMax) ? outMax : omin + 1;
  const t = (val - imin) / (imax - imin);
  return omin + t * (omax - omin);
}

function buildNodeMeta(rawNodes) {
  const nodes = new Map();
  const weights = [];
  rawNodes.forEach((node) => {
    if (!node || !node.id) return;
    const id = String(node.id);
    const attrs = { ...(node.attrs || {}) };
    if (attrs.weight != null) {
      const w = Number(attrs.weight);
      if (Number.isFinite(w)) weights.push(w);
    }
    nodes.set(id, {
      id,
      attrs,
      data: { ...attrs },
    });
  });
  const minWeight = weights.length ? Math.min(...weights) : 1;
  const maxWeight = weights.length ? Math.max(...weights) : minWeight + 1;
  return { nodes, minWeight, maxWeight };
}

function buildEdgeMeta(rawEdges) {
  const edges = new Map();
  const weights = [];
  rawEdges.forEach((edge) => {
    if (!edge || !edge.source || !edge.target) return;
    const eid = String(edge.id || `${edge.source}-${edge.target}`);
    const attrs = { ...(edge.attrs || {}) };
    const weight = attrs.weight != null ? Number(attrs.weight) : (attrs.width != null ? Number(attrs.width) : null);
    if (Number.isFinite(weight)) weights.push(weight);
    edges.set(eid, {
      id: eid,
      source: String(edge.source),
      target: String(edge.target),
      attrs,
      data: { ...attrs },
    });
  });
  const minWeight = weights.length ? Math.min(...weights) : 1;
  const maxWeight = weights.length ? Math.max(...weights) : minWeight + 1;
  return { edges, minWeight, maxWeight };
}

function deriveNodeSize(attrs, minWeight, maxWeight) {
  const base = attrs && attrs.size != null ? Number(attrs.size) : null;
  if (Number.isFinite(base) && base > 0) return Math.max(6, Math.min(40, base));
  const weight = attrs && attrs.weight != null ? Number(attrs.weight) : null;
  if (Number.isFinite(weight)) {
    return Math.max(8, Math.min(48, Math.round(mapRange(weight, minWeight, maxWeight, 12, 60))));
  }
  return 14;
}

function deriveEdgeWidth(attrs, minWeight, maxWeight) {
  const base = attrs && attrs.width != null ? Number(attrs.width) : null;
  if (Number.isFinite(base) && base > 0) return Math.max(0.5, Math.min(8, base));
  const weight = attrs && attrs.weight != null ? Number(attrs.weight) : null;
  if (Number.isFinite(weight)) {
    return Math.max(0.75, Math.min(6, mapRange(weight, minWeight, maxWeight, 1, 6)));
  }
  return 1.2;
}

function deriveNodeLabel(attrs) {
  if (!attrs) return '';
  if (Object.prototype.hasOwnProperty.call(attrs, '_vizLabel')) return String(attrs._vizLabel || '');
  if (attrs.label) return String(attrs.label);
  if (attrs.name) return String(attrs.name);
  if (attrs.title) return String(attrs.title);
  if (attrs.emoji) return String(attrs.emoji);
  if (attrs.id != null) return String(attrs.id);
  return '';
}

function deriveEdgeLabel(attrs) {
  if (!attrs) return '';
  if (Object.prototype.hasOwnProperty.call(attrs, '_relVizLabel')) return String(attrs._relVizLabel || '');
  if (attrs.label) return String(attrs.label);
  if (attrs.relationship) return String(attrs.relationship);
  if (attrs.emoji) return String(attrs.emoji);
  if (attrs.title) return String(attrs.title);
  if (attrs.name) return String(attrs.name);
  return '';
}

function makeSelectionPayload(id, type, edgeData) {
  if (type === 'edge') {
    return { data: { id: edgeData && edgeData.id ? edgeData.id : id, source: edgeData ? edgeData.source : null, target: edgeData ? edgeData.target : null } };
  }
  return { data: { id } };
}

function mapLayoutNameToReagraph(name) {
  if (!name) return 'forceatlas2';
  const lower = String(name).toLowerCase();
  switch (lower) {
    case 'concentric':
      return 'concentric2d';
    case 'circle':
    case 'circular':
      return 'circular2d';
    case 'breadthfirst':
      return 'treeTd2d';
    case 'radial':
    case 'radialout':
    case 'radial-out':
      return 'radialOut2d';
    case 'nooverlap':
    case 'grid':
      return 'nooverlap';
    case 'cose':
    case 'cola':
    case 'force-directed':
    case 'spring':
      return 'forceDirected2d';
    case 'preset':
    case 'custom':
      return 'forceatlas2';
    default:
      return 'forceatlas2';
  }
}

function recomputeNodeWeights(meta) {
  let min = Infinity;
  let max = -Infinity;
  meta.nodes.forEach((entry) => {
    const attrs = entry && entry.attrs;
    const weight = attrs && attrs.weight != null ? Number(attrs.weight) : null;
    if (Number.isFinite(weight)) {
      if (weight < min) min = weight;
      if (weight > max) max = weight;
    }
  });
  if (!Number.isFinite(min)) min = 1;
  if (!Number.isFinite(max)) max = min + 1;
  meta.minWeight = min;
  meta.maxWeight = max;
}

function recomputeEdgeWeights(meta) {
  let min = Infinity;
  let max = -Infinity;
  meta.edges.forEach((entry) => {
    const attrs = entry && entry.attrs;
    const weight = attrs && (attrs.weight != null ? Number(attrs.weight) : (attrs.width != null ? Number(attrs.width) : null));
    if (Number.isFinite(weight)) {
      if (weight < min) min = weight;
      if (weight > max) max = weight;
    }
  });
  if (!Number.isFinite(min)) min = 1;
  if (!Number.isFinite(max)) max = min + 1;
  meta.minWeight = min;
  meta.maxWeight = max;
}

export async function mountRealReagraphAdapter(opts = {}, env = {}) {
  const { container, elements = [], layout = null } = opts;
  if (!container) return { impl: 'reagraph', noop: true };

  const GraphCanvas = env.reagraph && (env.reagraph.GraphCanvas || (env.reagraph.default && env.reagraph.default.GraphCanvas));
  if (!GraphCanvas) return null;

  const cyToGraph = await ensureCyElementsToGraphology();
  if (typeof cyToGraph !== 'function') return null;

  const { nodes: rawNodes, edges: rawEdges } = cyToGraph(elements || []);
  const nodeMeta = buildNodeMeta(rawNodes);
  const edgeMeta = buildEdgeMeta(rawEdges);

  const nodeWrappers = new Map();
  const edgeWrappers = new Map();
  const selectedNodeIds = new Set();
  const selectedEdgeIds = new Set();
  const hiddenNodeIds = new Set();
  const hiddenEdgeIds = new Set();
  const localSelectionKeys = new Set();
  let currentLayoutName = layout && layout.name ? String(layout.name) : null;

  let SelectionManager = null;
  try {
    const maybeSelection = require('/imports/client/selection/SelectionManager');
    SelectionManager = maybeSelection && (maybeSelection.default || maybeSelection);
  } catch (err) {
    SelectionManager = null;
  }

  const canvasRef = { current: null };
  let baseDistance = null;
  let zoomLevel = 1;
  let animationFrame = null;
  let disposed = false;

  container.innerHTML = '';
  const root = createRoot(container);

  function scheduleRender() {
    if (disposed) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      renderGraph();
      return;
    }
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      renderGraph();
    });
  }

  function nodeIsHidden(id) {
    const entry = nodeMeta.nodes.get(id);
    if (!entry) return false;
    return !!entry.attrs.hidden || hiddenNodeIds.has(id);
  }

  function edgeIsHidden(id) {
    const entry = edgeMeta.edges.get(id);
    if (!entry) return true;
    if (hiddenEdgeIds.has(id)) return true;
    if (entry.attrs && entry.attrs.hidden) return true;
    if (nodeIsHidden(entry.source) || nodeIsHidden(entry.target)) return true;
    return false;
  }

  function toGraphNodes() {
    const nodes = [];
    nodeMeta.nodes.forEach((entry, id) => {
      if (nodeIsHidden(id)) return;
      const { attrs, data } = entry;
      const label = deriveNodeLabel(attrs);
      const color = attrs && attrs.color ? attrs.color : stringToColorHex(id);
      const selected = selectedNodeIds.has(id) || !!attrs.selected;
      const size = deriveNodeSize(attrs, nodeMeta.minWeight, nodeMeta.maxWeight);
      nodes.push({
        id,
        label,
        data: { ...data, id, selected },
        size,
        fill: selected ? '#ef4444' : color,
        labelVisible: !!label,
        cluster: attrs && attrs.cluster ? String(attrs.cluster) : undefined,
        icon: attrs && attrs.icon ? attrs.icon : undefined,
      });
    });
    return nodes;
  }

  function toGraphEdges() {
    const edges = [];
    edgeMeta.edges.forEach((entry, id) => {
      if (edgeIsHidden(id)) return;
      const { attrs, data, source, target } = entry;
      const label = deriveEdgeLabel(attrs);
      const selected = selectedEdgeIds.has(id) || !!attrs.selected;
      const width = deriveEdgeWidth(attrs, edgeMeta.minWeight, edgeMeta.maxWeight);
      edges.push({
        id,
        source,
        target,
        label,
        data: { ...data, id, source, target, selected },
        size: Math.max(selected ? width * 1.8 : width, 0.75),
        fill: selected ? '#facc15' : (attrs && attrs.color ? attrs.color : 'rgba(30,41,59,0.65)'),
        dashed: !!attrs.dashed,
        subLabel: attrs && attrs.subLabel ? String(attrs.subLabel) : undefined,
      });
    });
    return edges;
  }

  function attachCanvasRef(instance) {
    canvasRef.current = instance;
    if (!instance) return;
    try {
      const controls = instance.getControls && instance.getControls();
      if (controls && baseDistance == null) {
        baseDistance = controls.distance || 1;
        zoomLevel = 1;
      }
    } catch (err) {
      baseDistance = baseDistance || 1;
    }
  }

  function getControls() {
    if (!canvasRef.current || typeof canvasRef.current.getControls !== 'function') return null;
    try { return canvasRef.current.getControls(); } catch (err) { return null; }
  }

  function getZoom() {
    const controls = getControls();
    if (controls) {
      if (baseDistance == null) baseDistance = controls.distance || 1;
      const dist = controls.distance || baseDistance || 1;
      const computed = baseDistance / dist;
      if (Number.isFinite(computed) && computed > 0) zoomLevel = computed;
    }
    return zoomLevel;
  }

  function setZoom(value) {
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) return getZoom();
    const controls = getControls();
    if (!controls) {
      zoomLevel = target;
      return zoomLevel;
    }
    if (baseDistance == null) baseDistance = controls.distance || 1;
    const rawDist = baseDistance / target;
    const clamped = Math.max(controls.minDistance || rawDist, Math.min(controls.maxDistance || rawDist, rawDist));
    try {
      controls.distance = clamped;
    } catch (err) {
      /* noop */
    }
    zoomLevel = target;
    return zoomLevel;
  }

  function selectNode(id, opts = {}) {
    const entry = nodeMeta.nodes.get(id);
    if (!entry) return false;
    if (selectedNodeIds.has(id) && !opts.force) return false;
    selectedNodeIds.add(id);
    entry.attrs.selected = true;
    entry.data.selected = true;
    if (!opts.silent && SelectionManager) {
      const payload = makeSelectionPayload(id, 'node');
      const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `node:${id}`;
      if (key) {
        localSelectionKeys.add(key);
        try { SelectionManager.select(payload); } catch (err) {}
      }
    }
  scheduleRender();
  emitEvent('select', { type: 'select', target: { id, source: entry.source, target: entry.target } });
    return true;
  }

  function unselectNode(id, opts = {}) {
    const entry = nodeMeta.nodes.get(id);
    if (!entry) return false;
    if (!selectedNodeIds.has(id) && !opts.force) return false;
    selectedNodeIds.delete(id);
    if (entry.attrs) delete entry.attrs.selected;
    if (entry.data) delete entry.data.selected;
    if (!opts.silent && SelectionManager) {
      const payload = makeSelectionPayload(id, 'node');
      const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `node:${id}`;
      if (key) {
        localSelectionKeys.add(key);
        try { SelectionManager.unselect(payload); } catch (err) {}
      }
    }
  scheduleRender();
  emitEvent('unselect', { type: 'unselect', target: { id, source: entry.source, target: entry.target } });
    return true;
  }

  function selectEdge(id, opts = {}) {
    const entry = edgeMeta.edges.get(id);
    if (!entry) return false;
    if (selectedEdgeIds.has(id) && !opts.force) return false;
    selectedEdgeIds.add(id);
    entry.attrs.selected = true;
    entry.data.selected = true;
    if (!opts.silent && SelectionManager) {
      const payload = makeSelectionPayload(id, 'edge', entry);
      const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `edge:${id}`;
      if (key) {
        localSelectionKeys.add(key);
        try { SelectionManager.select(payload); } catch (err) {}
      }
    }
    scheduleRender();
    emitEvent('select', { type: 'select', target: { id } });
    return true;
  }

  function unselectEdge(id, opts = {}) {
    const entry = edgeMeta.edges.get(id);
    if (!entry) return false;
    if (!selectedEdgeIds.has(id) && !opts.force) return false;
    selectedEdgeIds.delete(id);
    if (entry.attrs) delete entry.attrs.selected;
    if (entry.data) delete entry.data.selected;
    if (!opts.silent && SelectionManager) {
      const payload = makeSelectionPayload(id, 'edge', entry);
      const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `edge:${id}`;
      if (key) {
        localSelectionKeys.add(key);
        try { SelectionManager.unselect(payload); } catch (err) {}
      }
    }
    scheduleRender();
    emitEvent('unselect', { type: 'unselect', target: { id } });
    return true;
  }

  function clearSelection(opts = {}) {
    nodeMeta.nodes.forEach((_, id) => unselectNode(id, { silent: true }));
    edgeMeta.edges.forEach((_, id) => unselectEdge(id, { silent: true }));
    if (!opts.silent && SelectionManager) {
      try { SelectionManager.clear(); } catch (err) {}
    }
    scheduleRender();
  }

  function makeNodeWrapper(id) {
    if (nodeWrappers.has(id)) return nodeWrappers.get(id);
    const wrapper = {
      id: () => id,
      data: (key, value) => {
        const entry = nodeMeta.nodes.get(id);
        if (!entry) return undefined;
        if (typeof key === 'undefined') return { ...(entry.data || {}) };
        if (typeof value === 'undefined') return entry.data ? entry.data[key] : undefined;
        if (!entry.data) entry.data = {};
        entry.data[key] = value;
        entry.attrs[key] = value;
        if (key === 'weight') recomputeNodeWeights(nodeMeta);
        if (key === 'hidden') {
          if (value) hiddenNodeIds.add(id); else hiddenNodeIds.delete(id);
        }
        if (key === 'selected') {
          if (value) selectNode(id, { silent: true }); else unselectNode(id, { silent: true });
        }
        scheduleRender();
        return value;
      },
      json: () => {
        const entry = nodeMeta.nodes.get(id);
        return { data: { ...(entry ? entry.data : {}) } };
      },
      isNode: () => true,
      select: () => selectNode(id),
      unselect: () => unselectNode(id),
      addClass: (cls) => {
        if (cls === 'hidden') hiddenNodeIds.add(id);
        if (cls === 'selected') selectNode(id);
        scheduleRender();
      },
      removeClass: (cls) => {
        if (cls === 'hidden') hiddenNodeIds.delete(id);
        if (cls === 'selected') unselectNode(id);
        scheduleRender();
      },
      hasClass: (cls) => {
        if (cls === 'hidden') return nodeIsHidden(id);
        if (cls === 'selected') return selectedNodeIds.has(id);
        return false;
      },
    };
    nodeWrappers.set(id, wrapper);
    return wrapper;
  }

  function makeEdgeWrapper(id) {
    if (edgeWrappers.has(id)) return edgeWrappers.get(id);
    const wrapper = {
      id: () => id,
      data: (key, value) => {
        const entry = edgeMeta.edges.get(id);
        if (!entry) return undefined;
        if (typeof key === 'undefined') return { ...(entry.data || {}) };
        if (typeof value === 'undefined') return entry.data ? entry.data[key] : undefined;
        if (!entry.data) entry.data = {};
        entry.data[key] = value;
        entry.attrs[key] = value;
        if (key === 'weight' || key === 'width') recomputeEdgeWeights(edgeMeta);
        if (key === 'hidden') {
          if (value) hiddenEdgeIds.add(id); else hiddenEdgeIds.delete(id);
        }
        if (key === 'selected') {
          if (value) selectEdge(id, { silent: true }); else unselectEdge(id, { silent: true });
        }
        scheduleRender();
        return value;
      },
      json: () => {
        const entry = edgeMeta.edges.get(id);
        return { data: { ...(entry ? entry.data : {}) } };
      },
      isNode: () => false,
      select: () => selectEdge(id),
      unselect: () => unselectEdge(id),
      addClass: (cls) => {
        if (cls === 'hidden') hiddenEdgeIds.add(id);
        if (cls === 'selected') selectEdge(id);
        scheduleRender();
      },
      removeClass: (cls) => {
        if (cls === 'hidden') hiddenEdgeIds.delete(id);
        if (cls === 'selected') unselectEdge(id);
        scheduleRender();
      },
      source: () => ({ id: () => (edgeMeta.edges.get(id) ? edgeMeta.edges.get(id).source : undefined) }),
      target: () => ({ id: () => (edgeMeta.edges.get(id) ? edgeMeta.edges.get(id).target : undefined) }),
      hasClass: (cls) => {
        if (cls === 'hidden') return edgeIsHidden(id);
        if (cls === 'selected') return selectedEdgeIds.has(id);
        return false;
      },
    };
    edgeWrappers.set(id, wrapper);
    return wrapper;
  }

  function nodesCollection() {
    const arr = [];
    nodeMeta.nodes.forEach((_, id) => arr.push(makeNodeWrapper(id)));
    return arr;
  }

  function edgesCollection() {
    const arr = [];
    edgeMeta.edges.forEach((_, id) => arr.push(makeEdgeWrapper(id)));
    return arr;
  }

  function elementsCollection() {
    return nodesCollection().concat(edgesCollection());
  }

  function renderGraph() {
    if (disposed) return;
    const graphNodes = toGraphNodes();
    const graphEdges = toGraphEdges();
    const requestedLayout = currentLayoutName;
    const layoutType = mapLayoutNameToReagraph(requestedLayout);
    const element = React.createElement(GraphCanvas, {
      ref: attachCanvasRef,
      nodes: graphNodes,
      edges: graphEdges,
      layoutType,
      animated: true,
      aggregateEdges: true,
      labelType: 'all',
      edgeLabelPosition: 'center',
      onNodeClick: (node) => {
        try {
          if (!node || !node.id) return;
          const id = String(node.id);
          if (selectedNodeIds.has(id)) unselectNode(id);
          else selectNode(id);
        } catch (err) {}
      },
      onEdgeClick: (edge) => {
        try {
          if (!edge || !edge.id) return;
          const id = String(edge.id);
          if (selectedEdgeIds.has(id)) unselectEdge(id);
          else selectEdge(id);
        } catch (err) {}
      },
      onCanvasClick: () => {
        clearSelection();
      },
      onLassoEnd: (ids) => {
        if (!ids || !ids.length) return;
        ids.forEach((id) => {
          try { selectNode(String(id)); } catch (err) {}
        });
      },
    });
    root.render(element);
  }

  renderGraph();

  const selectionHandlers = [];
  if (SelectionManager) {
    selectionHandlers.push(SelectionManager.on('select', ({ element } = {}) => {
      if (!element || !element.data) return;
      const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(element) : null;
      if (key && localSelectionKeys.has(key)) {
        localSelectionKeys.delete(key);
        return;
      }
      if (element.data.source != null || element.data.target != null) {
        const id = String(element.data.id || `${element.data.source}-${element.data.target}`);
        selectEdge(id, { silent: true, force: true });
      } else if (element.data.id != null) {
        const id = String(element.data.id);
        selectNode(id, { silent: true, force: true });
      }
      scheduleRender();
    }));
    selectionHandlers.push(SelectionManager.on('unselect', ({ element } = {}) => {
      if (!element || !element.data) return;
      const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(element) : null;
      if (key && localSelectionKeys.has(key)) {
        localSelectionKeys.delete(key);
        return;
      }
      if (element.data.source != null || element.data.target != null) {
        const id = String(element.data.id || `${element.data.source}-${element.data.target}`);
        unselectEdge(id, { silent: true, force: true });
      } else if (element.data.id != null) {
        const id = String(element.data.id);
        unselectNode(id, { silent: true, force: true });
      }
      scheduleRender();
    }));
    selectionHandlers.push(SelectionManager.on('clear', () => {
      clearSelection({ silent: true });
    }));
  }

  const eventHandlers = {};
  function emitEvent(event, payload) {
    const handlers = eventHandlers[event];
    if (!handlers || !handlers.length) return;
    handlers.forEach((fn) => {
      try { fn(payload); } catch (err) {}
    });
  }

  const adapter = {
    impl: 'reagraph',
    noop: false,
    getInstance: () => canvasRef.current,
    on(event, handler) {
      if (!handler || typeof handler !== 'function') return;
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
    },
    off(event, handler) {
      if (!eventHandlers[event]) return;
      eventHandlers[event] = eventHandlers[event].filter((fn) => fn !== handler);
    },
    fit() {
      try { if (canvasRef.current && typeof canvasRef.current.fitNodesInView === 'function') canvasRef.current.fitNodesInView(); } catch (err) {}
    },
    center() {
      try { if (canvasRef.current && typeof canvasRef.current.centerGraph === 'function') canvasRef.current.centerGraph(); } catch (err) {}
    },
    resize() {
      try { renderGraph(); } catch (err) {}
    },
    zoom(value) {
      if (typeof value === 'undefined') return getZoom();
      return setZoom(value);
    },
    nodes: () => nodesCollection(),
    edges: () => edgesCollection(),
    elements: () => elementsCollection(),
    select(id) {
      if (nodeMeta.nodes.has(String(id))) return selectNode(String(id));
      if (edgeMeta.edges.has(String(id))) return selectEdge(String(id));
      return false;
    },
    unselect(id) {
      if (nodeMeta.nodes.has(String(id))) return unselectNode(String(id));
      if (edgeMeta.edges.has(String(id))) return unselectEdge(String(id));
      return false;
    },
    unselectAll() {
      clearSelection({ silent: false });
    },
    filter(selector) {
      if (!selector) return [];
      if (selector === 'node') return nodesCollection();
      if (selector === 'edge') return edgesCollection();
      if (selector === ':selected') {
        const res = [];
        selectedNodeIds.forEach((id) => res.push(makeNodeWrapper(id)));
        selectedEdgeIds.forEach((id) => res.push(makeEdgeWrapper(id)));
        return res;
      }
      const match = selector.match(/id\s*=\s*['"]([^'"]+)['"]/);
      if (match) {
        const id = match[1];
        if (nodeMeta.nodes.has(id)) return [makeNodeWrapper(id)];
        if (edgeMeta.edges.has(id)) return [makeEdgeWrapper(id)];
      }
      return [];
    },
    add(elementsToAdd = []) {
      try {
        const { nodes = [], edges = [] } = cyToGraph(elementsToAdd);
        nodes.forEach((n) => {
          const id = String(n.id);
          if (!id) return;
          const attrs = { ...(n.attrs || {}) };
          nodeMeta.nodes.set(id, { id, attrs, data: { ...attrs } });
        });
        edges.forEach((e) => {
          const id = String(e.id || `${e.source}-${e.target}`);
          const attrs = { ...(e.attrs || {}) };
          edgeMeta.edges.set(id, { id, source: String(e.source), target: String(e.target), attrs, data: { ...attrs } });
        });
        if (nodes.length) recomputeNodeWeights(nodeMeta);
        if (edges.length) recomputeEdgeWeights(edgeMeta);
        scheduleRender();
      } catch (err) {}
    },
    remove(elementsToRemove = []) {
      elementsToRemove.forEach((el) => {
        const id = el && el.data && el.data.id ? String(el.data.id) : null;
        if (!id) return;
        if (nodeMeta.nodes.delete(id)) {
          selectedNodeIds.delete(id);
          hiddenNodeIds.delete(id);
        }
        if (edgeMeta.edges.delete(id)) {
          selectedEdgeIds.delete(id);
          hiddenEdgeIds.delete(id);
        }
      });
      recomputeNodeWeights(nodeMeta);
      recomputeEdgeWeights(edgeMeta);
      scheduleRender();
    },
    layout(layoutOptions) {
      return {
        run: () => {
          if (layoutOptions && layoutOptions.name) {
            const name = String(layoutOptions.name);
            adapter._layoutName = name;
            currentLayoutName = name;
          }
          scheduleRender();
        },
        on: () => {},
      };
    },
    destroy() {
      disposed = true;
      try {
        if (animationFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
      } catch (err) {}
      animationFrame = null;
      try { selectionHandlers.forEach((off) => { if (typeof off === 'function') off(); }); } catch (err) {}
      try { root.unmount(); } catch (err) {}
    },
  };

  adapter.container = container;
  adapter._root = root;
  adapter._layoutName = currentLayoutName;

  return adapter;
}

export default { mountRealReagraphAdapter };
