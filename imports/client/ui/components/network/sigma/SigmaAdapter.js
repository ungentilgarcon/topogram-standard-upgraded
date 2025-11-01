/* SigmaAdapter.js
   Lightweight adapter that mounts a Graphology graph and Sigma renderer and
   exposes a small Cytoscape-like API surface used by TopogramDetail.
*/

// require the translator; support both CommonJS and ES default export shapes
let cyElementsToGraphology = null;
try {
  const mod = require('../utils/cyElementsToGraphology');
  cyElementsToGraphology = mod && (mod.default || mod);
} catch (e) {
  // will be handled later
  cyElementsToGraphology = null;
}

  // optional EdgeCurveProgram loaded at runtime (if available)
  let SigmaAdapter__EdgeCurveProgram = null;

// Attempt to require @sigma/edge-curve at module load time so bundlers
// pick it up when present. Keep a reference to the raw module; we'll
// normalize it into a callable program class inside SigmaAdapter.
let SigmaAdapter__EdgeCurveModule = null;
try {
  SigmaAdapter__EdgeCurveModule = require('@sigma/edge-curve');
} catch (e) {
  SigmaAdapter__EdgeCurveModule = null;
}

// SelectionManager integration (optional)
let SelectionManager = null;
try {
  const sm = require('/imports/client/selection/SelectionManager');
  SelectionManager = sm && (sm.default || sm);
} catch (e) { SelectionManager = null }

// Left-Control detector (physical LeftCtrl only)
let LeftCtrl = null;
try {
  const lc = require('/imports/client/utils/leftCtrl');
  LeftCtrl = lc && (lc.default || lc);
} catch (e) { LeftCtrl = null }

function SigmaAdapter(container, elements = [], options = {}) {
  let GraphConstructor = null;
  let SigmaCtor = null;
  try {
    // dynamic require to avoid hard dependency during import-time
    const gmod = require('graphology');
    GraphConstructor = gmod && (gmod.Graph || gmod);
    const smod = require('sigma');
    SigmaCtor = smod && (smod.Sigma || smod.default || smod);
    // try to load optional edge program for curved edges. Be defensive about
    // different module shapes and only accept it if it looks like a constructor
    // / callable program class.
    try {
      // Prefer the module-level require result (helps bundlers include it).
      const eprog = SigmaAdapter__EdgeCurveModule || (() => { try { return require('@sigma/edge-curve'); } catch (e) { return null; } })();
      // Candidate picks: default export, named export, or the module itself
      let candidate = null;
      if (eprog) candidate = (eprog.default || eprog.EdgeCurveProgram || eprog);
      // If candidate is an object with a default, dig one level deeper
      if (candidate && typeof candidate !== 'function' && candidate.default) candidate = candidate.default;
      // Only accept if candidate is callable (function/class)
      if (typeof candidate === 'function') SigmaAdapter__EdgeCurveProgram = candidate;
      else SigmaAdapter__EdgeCurveProgram = null;
    } catch (e) {
      SigmaAdapter__EdgeCurveProgram = null;
    }

    // Informational: indicate whether the optional curved-edge program was
    // detected and will be registered with Sigma's edgeProgramClasses.
    try {
      if (SigmaAdapter__EdgeCurveProgram) {
        console.info('SigmaAdapter: @sigma/edge-curve detected and will be registered for curved edges');
      } else {
        console.info('SigmaAdapter: @sigma/edge-curve NOT detected; curved edges will fall back to the default edge program');
      }
    } catch (e) {}
  } catch (err) {
    console.warn('SigmaAdapter: graphology or sigma not available', err);
    return { impl: 'sigma', noop: true };
  }

  const graph = new GraphConstructor();
  // Visual tuning: multiply raw edge 'size' by this for display. Lower = thinner.
  const EDGE_VISUAL_SCALE = 0.30;
  // We require the @sigma/edge-curve program to be present. If it's not
  // available we'll abort init and return a noop adapter so the app can
  // handle the missing capability explicitly. This enforces a pure WebGL
  // renderer path for curved edges.
  const needsManualCurves = false;
  const cleanupFns = [];
  const _dragMeta = new Map();
  let _draggedNodeId = null;
  let _isDraggingNode = false;
  const DRAGGING_ATTR = '__sigmaAdapterDragging';
  let adapterRef = null;

  const releaseDraggedNode = () => {
    if (!_draggedNodeId) {
      _isDraggingNode = false;
      try { if (adapterRef) { adapterRef._draggedNode = null; adapterRef._isDragging = false; } } catch (e) {}
      return;
    }
    try { graph.removeNodeAttribute(_draggedNodeId, DRAGGING_ATTR); } catch (e) {}
    try {
      const meta = _dragMeta.get(_draggedNodeId);
      if (meta) {
        if (meta.hadHighlight) {
          try { graph.setNodeAttribute(_draggedNodeId, 'highlighted', meta.value); } catch (e) {}
        } else {
          try { graph.removeNodeAttribute(_draggedNodeId, 'highlighted'); } catch (e) {}
        }
      } else {
        try { graph.removeNodeAttribute(_draggedNodeId, 'highlighted'); } catch (e) {}
      }
    } catch (e) {}
    _dragMeta.delete(_draggedNodeId);
    _draggedNodeId = null;
    _isDraggingNode = false;
    try { if (adapterRef) { adapterRef._draggedNode = null; adapterRef._isDragging = false; } } catch (e) {}
  };

  // Debug selector: allow forcing straight edges (no curved program) by
  // passing options.noCurves=true or adding `data-sigma-no-curves="true"`
  // or the class `sigma-no-curves` on the container element. Useful for
  // debugging picking/hover issues when curved rendering may affect events.
  const DEBUG_NO_CURVES = Boolean(
    (options && options.noCurves) ||
      (container && container.dataset && String(container.dataset.sigmaNoCurves) === 'true') ||
      (container && container.classList && container.classList.contains('sigma-no-curves'))
  );

  // deterministic color helper (same approach as TopogramDetail)
  function _stringToColorHex(str) {
    try {
      if (!str) str = '';
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
      const hue = h % 360;
      const sat = 62; const light = 52;
      const hNorm = hue / 360; const s = sat / 100; const l = light / 100;
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      let r, g, b;
      if (s === 0) { r = g = b = l; } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
        r = hue2rgb(p, q, hNorm + 1/3); g = hue2rgb(p, q, hNorm); b = hue2rgb(p, q, hNorm - 1/3);
      }
      const toHex = (x) => { const v = Math.round(x * 255); return (v < 16 ? '0' : '') + v.toString(16); };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch (e) { return '#1f2937'; }
  }

  // helper to build a safe noop adapter when we can't create a real one
  const makeNoopAdapter = (reason) => ({
    impl: 'sigma', noop: true, reason: reason || 'noop',
    on() {}, off() {}, getInstance() { return null; },
    nodes() { return { length: 0, forEach() {}, map() { return []; }, filter() { return []; } }; },
    edges() { return { length: 0, forEach() {}, map() { return []; }, filter() { return []; } }; },
    elements() { return { nodes: this.nodes(), edges: this.edges() }; },
    add() {}, remove() {}, select() {}, unselect() {}, filter() { return []; },
    layout() { return { run() {}, on() {} }; }, destroy() {}
  });

  // Ensure the curved-edge program is present; make it mandatory for this
  // SigmaAdapter implementation. Try a last-ditch require if we haven't
  // already resolved it at module-load time. If we still can't find a
  // callable program constructor, fail fast with a noop adapter so callers
  // aren't surprised by missing rendering/picking behaviour.
  try {
    if (!SigmaAdapter__EdgeCurveProgram) {
      try { SigmaAdapter__EdgeCurveModule = SigmaAdapter__EdgeCurveModule || require('@sigma/edge-curve'); } catch (e) { SigmaAdapter__EdgeCurveModule = null; }
      let candidate = null;
      if (SigmaAdapter__EdgeCurveModule) candidate = (SigmaAdapter__EdgeCurveModule.default || SigmaAdapter__EdgeCurveModule.EdgeCurveProgram || SigmaAdapter__EdgeCurveModule);
      if (candidate && typeof candidate === 'function') SigmaAdapter__EdgeCurveProgram = candidate;
    }
  } catch (e) {}
  if (!SigmaAdapter__EdgeCurveProgram) {
    try { console.error('SigmaAdapter: @sigma/edge-curve is required but not available. Aborting SigmaAdapter init.'); } catch (e) {}
    return makeNoopAdapter('edge-curve-missing');
  }

  // populate graph from cy-like elements if provided
  try {
    if (typeof cyElementsToGraphology !== 'function') throw new Error('cyElementsToGraphology is not a function');
    const { nodes = [], edges = [] } = cyElementsToGraphology(elements || []);
    // compute numeric weight range (like TopogramDetail) so we can map weight -> diameter
    const numericWeights = (nodes || []).map(n => Number((n.attrs && (n.attrs.weight != null ? n.attrs.weight : 1)) || 1));
    const minW = numericWeights.length ? Math.min(...numericWeights) : 1;
    const maxW = numericWeights.length ? Math.max(...numericWeights) : (minW + 1);
    function mapData(value, dmin, dmax, rmin, rmax) {
      const v = (typeof value === 'number' && isFinite(value)) ? value : Number(value || 0);
      const a = Number(dmin || 0); const b = Number(dmax || (a + 1));
      const mn = Number(rmin || 0); const mx = Number(rmax || mn + 1);
      if (b === a) return (mn + mx) / 2;
      const t = (v - a) / (b - a);
      return mn + t * (mx - mn);
    }

    // add nodes, coerce x/y if provided as strings
    nodes.forEach(n => {
  const attrs = { ...(n.attrs || {}) };
      if (attrs.x !== undefined && attrs.x !== null && typeof attrs.x !== 'number') {
        const px = parseFloat(attrs.x);
        if (!Number.isNaN(px)) attrs.x = px; else delete attrs.x;
      }
      if (attrs.y !== undefined && attrs.y !== null && typeof attrs.y !== 'number') {
        const py = parseFloat(attrs.y);
        if (!Number.isNaN(py)) attrs.y = py; else delete attrs.y;
      }
      // Determine diameter via mapData(weight,minW,maxW,12,60) unless explicit size provided.
      try {
        if (typeof attrs.size !== 'undefined' && attrs.size !== null && !Number.isNaN(Number(attrs.size))) {
          // treat attrs.size as a diameter (pixels) for parity with Cytoscape; Sigma expects radius
          const dia = Number(attrs.size);
          const radius = Math.max(6, Math.min(30, dia / 2));
          attrs.size = radius;
        } else {
          const w = (attrs.weight != null && !Number.isNaN(Number(attrs.weight))) ? Number(attrs.weight) : 1;
          const dia = mapData(w, minW, maxW, 12, 60);
          attrs.size = Math.max(6, Math.min(30, dia / 2)); // Sigma size = radius
        }
      } catch (e) { attrs.size = attrs.size || 10 }
      if (!graph.hasNode(n.id)) graph.addNode(n.id, attrs);
    });
    // ensure node colors exist
    graph.forEachNode((id, attr) => {
      try {
        const a = attr || {};
        if (!a.color) {
          const key = String(id || a.id || '');
          graph.setNodeAttribute(id, 'color', _stringToColorHex(key));
        }
      } catch (e) {}
    });
    // Ensure node 'label' attribute is set from computed _vizLabel or label/name
    try {
      nodes.forEach(n => {
        try {
          const attr = n.attrs || {};
          const nodeId = n.id;
          const viz = (attr._vizLabel || attr.label || attr.name || '');
          if (typeof viz !== 'undefined' && viz !== null) {
            try { graph.setNodeAttribute(nodeId, 'label', String(viz)); } catch (e) {}
          }
        } catch (e) {}
      });
    } catch (e) {}
    edges.forEach(e => { try { if (!graph.hasEdge(e.id)) graph.addEdgeWithKey(e.id || `${e.source}-${e.target}`, e.source, e.target, e.attrs || {}); } catch (e) {} });
    edges.forEach(e => { try { const attrs = Object.assign({}, e.attrs || {}); if (typeof attrs.size === 'undefined' || attrs.size === null) { attrs.size = (typeof attrs.width === 'number' ? attrs.width : (attrs.weight != null ? Number(attrs.weight) : 1)); } if (!graph.hasEdge(e.id || `${e.source}-${e.target}`)) graph.addEdgeWithKey(e.id || `${e.source}-${e.target}`, e.source, e.target, attrs); } catch (err) {} });
    try { console.debug('SigmaAdapter: populated graph', { nodeCount: graph.order, edgeCount: graph.size }); } catch (e) { console.debug('SigmaAdapter: populated graph (counts unavailable)'); }

    // Determine edge weight range and map weights -> visual width (pixels)
    const edgeWeights = (edges || []).map(e => Number((e.attrs && (e.attrs.weight != null ? e.attrs.weight : (e.attrs && e.attrs.width != null ? e.attrs.width : 1))) || 1));
    const minEW = edgeWeights.length ? Math.min(...edgeWeights) : 1;
    const maxEW = edgeWeights.length ? Math.max(...edgeWeights) : (minEW + 1);
    function mapDataLocal(value, dmin, dmax, rmin, rmax) {
      const v = (typeof value === 'number' && isFinite(value)) ? value : Number(value || 0);
      const a = Number(dmin || 0); const b = Number(dmax || (a + 1));
      const mn = Number(rmin || 0); const mx = Number(rmax || mn + 1);
      if (b === a) return (mn + mx) / 2;
      const t = (v - a) / (b - a);
      return mn + t * (mx - mn);
    }

    // Ensure every edge has a sensible 'size' attribute so edges are visible
    // and pickable in Sigma. Prefer explicit attrs.size, then attrs.width,
    // then attrs.weight, otherwise fallback to 1. If weight is present we map
    // it to a display width in pixels using mapDataLocal(minEW..maxEW -> 1..6).
    try {
      // Force a numeric 'size' on every edge so Sigma's programs can pick and
      // hit edge hover/click detection reliably. Coerce any existing size or
      // fall back to width/weight or 1.
      graph.forEachEdge((id, attr) => {
        try {
          const a = attr || {};
          // prefer explicit numeric size
          let sizeVal = null;
          if (typeof a.size === 'number' && !Number.isNaN(a.size)) {
            sizeVal = Math.max(1, a.size);
          } else if (typeof a.size === 'string') {
            const parsed = parseFloat(a.size);
            if (!Number.isNaN(parsed)) sizeVal = Math.max(1, parsed);
          }
          if (sizeVal === null) {
            const w = (typeof a.width === 'number') ? a.width : (a.weight != null ? Number(a.weight) : null);
            if (w != null && !Number.isNaN(w)) {
              // map data domain [minEW, maxEW] to visual width [1,6] pixels
              const visualW = mapDataLocal(w, minEW, maxEW, 1, 6);
              sizeVal = Math.max(1, visualW);
            } else {
              sizeVal = 1;
            }
          }
          try { graph.setEdgeAttribute(id, 'size', sizeVal); } catch (e) {}
            // ensure edge color exists
            try {
              if (!a.color) {
                const key = String(id || a.id || (a.source ? `${a.source}|${a.target}` : ''));
                graph.setEdgeAttribute(id, 'color', _stringToColorHex(key));
              }
            } catch (e) {}
          // If an edge carries a label, emoji, name or title, ensure it's
          // exposed to Sigma as the 'label' attribute and request forceLabel
          // so the label shows regardless of zoom if possible.
          try {
            let labelCandidate = null;
            let override = false;
            if (a && Object.prototype.hasOwnProperty.call(a, '_relVizLabel')) {
              override = true;
              const val = a._relVizLabel;
              if (val !== undefined && val !== null && String(val).trim().length) {
                labelCandidate = String(val);
              }
            }
            if (!override) {
              const maybeLabel = (a.label || a.relationship || a.emoji || a.title || a.name);
              if (typeof maybeLabel !== 'undefined' && maybeLabel !== null && String(maybeLabel).trim().length) {
                labelCandidate = String(maybeLabel);
              }
            }
            if (labelCandidate != null) {
              try { graph.setEdgeAttribute(id, 'label', labelCandidate); } catch (e) {}
              try { graph.setEdgeAttribute(id, 'forceLabel', true); } catch (e) {}
              console.debug && console.debug('SigmaAdapter: edge label set', { id, label: labelCandidate });
            } else {
              try { graph.removeEdgeAttribute(id, 'label'); } catch (e) {}
              try { graph.removeEdgeAttribute(id, 'forceLabel'); } catch (e) {}
            }
          } catch (e) {}
          // If edge carries an 'enlightement' === 'arrow' or arrow flag, set
          // attributes to request an arrowhead from the renderer when supported.
          try {
            const hasArrow = (a && (String(a.enlightement).toLowerCase() === 'arrow' || a.arrow));
            if (hasArrow) {
              // Prefer to select the curved+arrow program when available.
              try { graph.setEdgeAttribute(id, 'arrow', true); } catch (e) {}
              try { if (a.color) graph.setEdgeAttribute(id, 'targetArrowColor', a.color); } catch (e) {}
              try { graph.setEdgeAttribute(id, 'enlightement', 'arrow'); } catch (e) {}
              try {
                // If we registered a curvedArrow program, set the edge.type to match it
                const mod = SigmaAdapter__EdgeCurveModule || (typeof require === 'function' ? require('@sigma/edge-curve') : null);
                const Arrow = mod && (mod.EdgeCurvedArrowProgram || (mod.default && mod.default.EdgeCurvedArrowProgram));
                if (Arrow && typeof Arrow === 'function') {
                  try { graph.setEdgeAttribute(id, 'type', 'curvedArrow'); } catch (e) {}
                }
              } catch (e) {}
            }
          } catch (e) {}
        } catch (e) {}
      });
    } catch (e) {}

    // If the optional curved edge program isn't available, neutralize any
    // incoming edge.type === 'curved' so Sigma doesn't reject them at init.
    try {
      if (!SigmaAdapter__EdgeCurveProgram) {
        let seenCurved = false;
        graph.forEachEdge((id, attr) => {
          try {
            if (attr && String(attr.type) === 'curved') {
              seenCurved = true;
              try { graph.setEdgeAttribute(id, 'type', 'edge'); } catch (e) {}
            }
          } catch (e) {}
        });
        if (seenCurved) console.warn('SigmaAdapter: @sigma/edge-curve not available; downgraded curved edges to default edge program');
      }
    } catch (e) {}

      // Use Sigma's native curve edge rendering: mark multi-edge groups and
      // self-loops with type 'curve' so Sigma can draw them as curved edges.
      try {
        const edgeGroups = new Map();
        graph.forEachEdge((id, attr, source, target) => {
          try {
            const a = String(source);
            const b = String(target);
            const key = a < b ? `${a}<>${b}` : `${b}<>${a}`;
            if (!edgeGroups.has(key)) edgeGroups.set(key, []);
            edgeGroups.get(key).push({ id, source, target, attr });
          } catch (err) {}
        });
        edgeGroups.forEach((list) => {
          try {
            if (!list || !list.length) return;
            if (list.length > 1) {
              // multiple edges between same unordered pair -> mark as curved when supported
              // Set attributes expected by @sigma/edge-curve's indexing helper
              const mid = (list.length - 1) / 2;
              const rawOffsets = list.map((_, idx) => idx - mid);
              const baseIndices = rawOffsets.map((offset) => {
                if (offset > 0) return Math.ceil(offset);
                if (offset < 0) return Math.floor(offset);
                return 0;
              });
              const directedIndices = baseIndices.map((val, idx) => {
                const entry = list[idx];
                const src = String(entry.source);
                const tgt = String(entry.target);
                const forward = src <= tgt;
                const dirSign = forward ? 1 : -1;
                return val * dirSign;
              });
              const minIndex = directedIndices.reduce((acc, val) => Math.min(acc, val), directedIndices[0] || 0);
              const maxIndex = directedIndices.reduce((acc, val) => Math.max(acc, val), directedIndices[0] || 0);
              const curveCount = list.length;
              const baseCurvature = curveCount === 2 ? 0.7 : 0.45;
              list.forEach((item, idx) => {
                try {
                  if (!DEBUG_NO_CURVES && SigmaAdapter__EdgeCurveProgram) graph.setEdgeAttribute(item.id, 'type', 'curved');
                  else graph.setEdgeAttribute(item.id, 'type', 'edge');
                } catch (e) {}
                try {
                  const parallelIndex = directedIndices[idx];
                  const src = String(item.source);
                  const tgt = String(item.target);
                  const forward = src <= tgt;
                  const dirSign = forward ? 1 : -1;
                  let curvature = parallelIndex === 0 ? (curveCount > 1 ? dirSign * baseCurvature * 0.65 : 0) : parallelIndex * baseCurvature;
                  if (DEBUG_NO_CURVES) curvature = 0;
                  graph.setEdgeAttribute(item.id, 'parallelIndex', parallelIndex);
                  graph.setEdgeAttribute(item.id, 'parallelMinIndex', minIndex);
                  graph.setEdgeAttribute(item.id, 'parallelMaxIndex', maxIndex);
                  // keep older names for compatibility
                  graph.setEdgeAttribute(item.id, 'curveIndex', idx);
                  graph.setEdgeAttribute(item.id, 'curveCount', curveCount);
                  // provide a numeric curvature hint: centered around 0
                  graph.setEdgeAttribute(item.id, 'curvature', curvature);
                  // marked for curved rendering by the WebGL program (unless debug disabled)
                } catch (e) {}
              });
            } else {
              // single edge: set default parallel attributes. For self-loops
              // request the curved program when available so they render as arcs.
              const itm = list[0];
              // For single edges, only request the curved program for self-loops.
              try {
                if (String(itm.source) === String(itm.target)) {
                  if (!DEBUG_NO_CURVES && SigmaAdapter__EdgeCurveProgram) graph.setEdgeAttribute(itm.id, 'type', 'curved');
                  else graph.setEdgeAttribute(itm.id, 'type', 'edge');
                }
              } catch (e) {}
                try {
                  // default attributes for a single (non-parallel) edge
                graph.setEdgeAttribute(itm.id, 'parallelIndex', 0);
                graph.setEdgeAttribute(itm.id, 'parallelMinIndex', 0);
                graph.setEdgeAttribute(itm.id, 'parallelMaxIndex', 0);
                graph.setEdgeAttribute(itm.id, 'curveIndex', 0);
                graph.setEdgeAttribute(itm.id, 'curveCount', 1);
                // for plain single edges keep curvature at 0; for self-loops keep larger curvature
                if (String(itm.source) === String(itm.target)) {
                  // self-loop: give a large curvature so the arc is visible (unless debug disables curves)
                  graph.setEdgeAttribute(itm.id, 'curvature', DEBUG_NO_CURVES ? 0 : 2.5);
                  graph.setEdgeAttribute(itm.id, 'selfLoop', true);
                } else {
                  graph.setEdgeAttribute(itm.id, 'curvature', 0);
                }
              } catch (e) {}
            }
          } catch (err) {}
        });
      } catch (e) {}
      // Dev-time assertion: warn if an edge is marked 'curved' but missing
      // attributes that the curved-edge program expects (e.g. curvature,
      // parallelIndex). This helps catch malformed input during development.
      try {
        if (typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV !== 'production') {
          graph.forEachEdge((id, attr) => {
            try {
              if (attr && String(attr.type) === 'curved') {
                const hasCurv = typeof attr.curvature !== 'undefined' && attr.curvature !== null;
                const hasIdx = typeof attr.parallelIndex !== 'undefined' && attr.parallelIndex !== null;
                if (!hasCurv || !hasIdx) {
                  try { console.warn('SigmaAdapter: malformed curved edge', id, { missing: (!hasIdx ? 'parallelIndex' : '') + ((!hasIdx && !hasCurv) ? ' and ' : '') + (!hasCurv ? 'curvature' : ''), attr }); } catch (e) {}
                }
              }
            } catch (e) {}
          });
        }
      } catch (e) {}
  } catch (e) {
    console.warn('SigmaAdapter: failed to populate graph', e);
    return makeNoopAdapter('populate_failed');
  }

  // Ensure Graphology nodes have numeric x/y coordinates; Sigma validates them at construction
  try {
    const coerced = [];
    graph.forEachNode((id, attr) => {
      let x = attr && attr.x;
      let y = attr && attr.y;
      const ok = (n) => typeof n === 'number' && isFinite(n);
      if (!ok(x) || !ok(y)) {
        x = (Math.random() * 1000) - 500;
        y = (Math.random() * 1000) - 500;
        try { graph.setNodeAttribute(id, 'x', x); graph.setNodeAttribute(id, 'y', y); } catch (e) {}
        coerced.push(id);
      }
    });
    if (coerced.length) console.debug('SigmaAdapter: coerced numeric positions for nodes', { coercedCount: coerced.length, sample: coerced.slice(0,5) });
  } catch (e) { console.warn('SigmaAdapter: error coercing node positions', e); }

  // Ensure node sizes reflect data.size / data.weight or, if absent, compute
  // a fallback from node degree so picking and label placement are consistent.
  try {
    const degreeMap = {};
    graph.forEachEdge((id, attr, source, target) => {
      try {
        degreeMap[source] = (degreeMap[source] || 0) + 1;
        degreeMap[target] = (degreeMap[target] || 0) + 1;
      } catch (e) {}
    });
    graph.forEachNode((id, attr) => {
      try {
        const a = attr || {};
        if (typeof a.size === 'undefined' || a.size === null) {
          const w = (typeof a.weight !== 'undefined' && a.weight !== null) ? Number(a.weight) : null;
          if (w != null && !Number.isNaN(w)) {
            graph.setNodeAttribute(id, 'size', Math.max(6, Math.min(48, Math.floor(w))));
          } else {
            const deg = degreeMap[id] || 0;
            graph.setNodeAttribute(id, 'size', Math.max(6, Math.min(48, 8 + deg * 3)));
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  let renderer = null;
  // If a pre-created renderer is provided (for example by a React wrapper like
  // react-sigma), use it instead of creating a new Sigma instance here. This
  // also supports passing a custom Sigma constructor via options.SigmaCtor.
  try {
    if (options && options.renderer) {
      // caller is responsible for ensuring the provided renderer is bound to
      // the same graph or will accept our graph. We accept it as-is.
      renderer = options.renderer;
    }
    if (options && options.SigmaCtor) {
      // allow overriding the Sigma constructor (e.g., a React-friendly one)
      SigmaCtor = options.SigmaCtor;
    }
  } catch (e) {}
  try {
    // Provide GPU-friendly renderer options where supported by sigma v3
    // assemble edge program classes; only register the curved program when
    // available. Do not set bogus defaults (e.g. 'edge': 'edge') which are
    // not valid program constructors.
    const edgeProgramClasses = {};
    try {
      if (typeof SigmaAdapter__EdgeCurveProgram !== 'undefined' && SigmaAdapter__EdgeCurveProgram) {
        // register base curved program
        edgeProgramClasses.curved = SigmaAdapter__EdgeCurveProgram;
        // try to register arrow-capable variants if exported by the module
        try {
          const mod = SigmaAdapter__EdgeCurveModule || require('@sigma/edge-curve');
          const Arrow = mod && (mod.EdgeCurvedArrowProgram || mod.EdgeCurvedArrowProgram || (mod.default && mod.default.EdgeCurvedArrowProgram));
          const DoubleArrow = mod && (mod.EdgeCurvedDoubleArrowProgram || (mod.default && mod.default.EdgeCurvedDoubleArrowProgram));
          if (Arrow && typeof Arrow === 'function') edgeProgramClasses.curvedArrow = Arrow;
          if (DoubleArrow && typeof DoubleArrow === 'function') edgeProgramClasses.curvedDoubleArrow = DoubleArrow;
        } catch (e) {}
      }
    } catch (e) {}

  // Debug: list registered edge program keys to help diagnose missing program errors
  try { console.debug('SigmaAdapter: edgeProgramClasses keys', Object.keys(edgeProgramClasses)); } catch (e) {}

  let sigmaOpts = null;

  sigmaOpts = {
      // WebGL context hints: prefer low power if available, but let browser decide
      // (sigma exposes renderer-related options in various builds; pass what we can)
      render: { background: '#ffffff00' },
      // expose program classes at top-level so Sigma can pick them up (e.g. { curved: EdgeCurveProgram })
  edgeProgramClasses: edgeProgramClasses,
      settings: {
        // prefer WebGL GPU accelerated rendering when available
  labelRenderedSizeThreshold: 0,
        renderLabels: true,
        renderEdgeLabels: true,
        edgeLabelRenderedSizeThreshold: 0,
  defaultDrawNodeLabels: true,
        defaultNodeType: 'circle',
        // v3 uses a single flag to enable edge-related events
    // enable edge events per sigma docs so payloads include an `edge` id
  enableEdgeHovering: true,
  enableEdgeHoverEvents: true,
    enableEdgeEvents: true,
    enableEdgeClickEvents: true,
    enableEdgeWheelEvents: true,
        defaultDrawEdgeLabels: true,
        // explicit edge label settings to ensure labels (and emoji) render
        edgeLabelSize: 14,
        edgeLabelFont: 'Arial, sans-serif',
        edgeLabelWeight: '600',
        edgeLabelColor: { color: '#000' },
        // make hover detection more permissive; edges need a size to be clickable
        edgeHoverSizeRatio: 8
      }
    };
  // Remember original edgeProgramClasses so we can remove them when
  // rendering without curved edges (that ensures Sigma falls back to the
  // default straight-edge program rather than the curved custom program).
  const _savedEdgeProgramClasses = sigmaOpts && sigmaOpts.edgeProgramClasses ? sigmaOpts.edgeProgramClasses : null;

  // Helper to (re)create the Sigma renderer so we can force a full
    // reinitialization when runtime flags change (for example toggling
    // curved-edge rendering). Encapsulating creation logic here keeps
    // initialization and recreation consistent.
    // WebGL context event handlers (populated when a renderer/container exists)
    let _handleWebGLLost = null;
    let _handleWebGLRestored = null;

    // Diagnostic helper: inspect renderer.edgePrograms entries and log constructor names
    const _inspectEdgePrograms = (r) => {
      try {
        if (!r || !r.edgePrograms) { console.debug && console.debug('SigmaAdapter._inspectEdgePrograms: no renderer or edgePrograms'); return; }
        const keys = Object.keys(r.edgePrograms || {});
        const details = {};
        keys.forEach(k => {
          try {
            const entry = r.edgePrograms[k];
            if (!entry) { details[k] = null; return; }
            const ctorName = (entry && entry.constructor && entry.constructor.name) || (entry && entry.programClass && (entry.programClass.name || entry.programClass.toString && entry.programClass.toString().slice(0,80))) || null;
            const hasKill = !!(entry && typeof entry.kill === 'function');
            details[k] = { ctorName, hasKill };
          } catch (e) { details[k] = { error: String(e) }; }
        });
        try { console.debug && console.debug('SigmaAdapter._inspectEdgePrograms', details); } catch (e) {}
      } catch (e) {}
    };

    const createRenderer = () => {
      try {
        // If an existing renderer is present, attempt a clean shutdown first
        if (renderer && typeof renderer.kill === 'function') {
          try { renderer.kill(); } catch (e) {}
        }
      } catch (e) {}
      // construct a new renderer instance bound to the same graph/container
      let r = null;
      try {
        if (options && options.renderer) {
          // if a renderer was injected by caller, respect it (do not recreate)
          r = options.renderer;
        } else {
          try { r = new SigmaCtor(graph, container, sigmaOpts); } catch (e) { r = new SigmaCtor(graph, container); }
        }
      } catch (err) {
        // If construction fails and we have an injected renderer, proceed; else rethrow
        if (!r) throw err;
      }
      try { console.debug && console.debug('SigmaAdapter: renderer (re)created', { renderer: !!r, graphOrder: graph.order, graphSize: graph.size }); } catch (e) {}
      renderer = r;
      // Attach WebGL context lost/restored handlers on the renderer container
      try {
        const cont = (renderer && typeof renderer.getContainer === 'function') ? renderer.getContainer() : container;
        if (cont && cont.addEventListener) {
          // remove previous handlers if present
          try { if (_handleWebGLLost && typeof _handleWebGLLost === 'function') cont.removeEventListener('webglcontextlost', _handleWebGLLost); } catch (e) {}
          try { if (_handleWebGLRestored && typeof _handleWebGLRestored === 'function') cont.removeEventListener('webglcontextrestored', _handleWebGLRestored); } catch (e) {}
          _handleWebGLLost = function(ev) {
            try { console.warn && console.warn('SigmaAdapter: WebGL context lost on container', ev); } catch (e) {}
            try { adapter._webglLost = true; } catch (e) {}
            // avoid default to permit restore events in some browsers
            try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (e) {}
          };
          _handleWebGLRestored = function(ev) {
            try { console.info && console.info('SigmaAdapter: WebGL context restored', ev); } catch (e) {}
            try { adapter._webglLost = false; } catch (e) {}
            // Recreate renderer to ensure a clean GL state and program registration
            try { if (typeof createRenderer === 'function') { createRenderer(); } } catch (e) { console.warn && console.warn('SigmaAdapter: recreate after webgl restore failed', e); }
          };
          try { cont.addEventListener('webglcontextlost', _handleWebGLLost, false); } catch (e) {}
          try { cont.addEventListener('webglcontextrestored', _handleWebGLRestored, false); } catch (e) {}
          // cleanup on destroy: remove listeners
          try { cleanupFns.push(() => { try { cont.removeEventListener('webglcontextlost', _handleWebGLLost); } catch (e) {} try { cont.removeEventListener('webglcontextrestored', _handleWebGLRestored); } catch (e) {} }); } catch (e) {}
        }
      } catch (e) {}
      // re-apply reducers and event wiring for the new renderer
      try {
        if (renderer && typeof renderer.setSetting === 'function') {
          renderer.setSetting('nodeReducer', (node, data) => {
            try {
              const hidden = !!graph.getNodeAttribute(node, 'hidden');
              const selected = !!graph.getNodeAttribute(node, 'selected');
              const label = graph.getNodeAttribute(node, 'label');
              const forceLabel = graph.getNodeAttribute(node, 'forceLabel');
              const out = Object.assign({}, data);
              if (hidden) out.hidden = true;
              if (typeof label === 'string') out.label = label;
              if (forceLabel) out.forceLabel = true;
              if (selected) {
                out.color = '#FFD54F';
                out.highlighted = true;
              }
              return out;
            } catch (e) { return data; }
          });
          renderer.setSetting('edgeReducer', (edge, data) => {
            try {
              const hidden = !!graph.getEdgeAttribute(edge, 'hidden');
              const out = Object.assign({}, data);
              if (hidden) out.hidden = true;
              const baseSize = Number(graph.getEdgeAttribute(edge, 'size'));
              if (!Number.isNaN(baseSize)) out.size = Math.max(1, baseSize * EDGE_VISUAL_SCALE);
              const label = graph.getEdgeAttribute(edge, 'label');
              if (typeof label === 'string' && label.trim().length) out.label = label;
              else if (out.label) delete out.label;
              if (graph.getEdgeAttribute(edge, 'forceLabel')) out.forceLabel = true;
              const selected = !!graph.getEdgeAttribute(edge, 'selected');
              if (selected) {
                out.color = '#FFD54F';
                out.size = Math.max(out.size || 1, baseSize ? baseSize * EDGE_VISUAL_SCALE * 1.6 : 1.6);
              } else {
                out.color = graph.getEdgeAttribute(edge, 'color') || out.color;
                out.size = Math.max(1, baseSize ? baseSize * EDGE_VISUAL_SCALE : 1);
              }
              return out;
            } catch (e) { return data; }
          });
        }
      } catch (e) {}

      // wire events onto the new renderer instance (clickNode/clickEdge/clickStage etc.)
      try {
        if (renderer && typeof renderer.on === 'function') {
          const localRenderer = renderer;
          const handleDragEnd = () => {
            try { releaseDraggedNode(); } catch (e) {}
            try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
          };
          const handleDownNode = (evt) => {
            try {
              const nodeId = evt && (evt.node || (evt.data && evt.data.node));
              if (!nodeId) return;
              _isDraggingNode = true;
              _draggedNodeId = nodeId;
              try { if (adapterRef) { adapterRef._draggedNode = nodeId; adapterRef._isDragging = true; } } catch (e) {}
              try {
                const prevVal = graph.getNodeAttribute(nodeId, 'highlighted');
                const hadHighlight = typeof prevVal !== 'undefined';
                _dragMeta.set(nodeId, { hadHighlight, value: prevVal });
                graph.setNodeAttribute(nodeId, 'highlighted', true);
              } catch (e) {}
              try { graph.setNodeAttribute(nodeId, DRAGGING_ATTR, true); } catch (e) {}
            } catch (e) {}
          };
          const handleMoveBody = (evt) => {
            try {
              if (!_isDraggingNode || !_draggedNodeId) return;
              const pointer = evt && evt.event ? evt.event : evt;
              if (!pointer) return;
              let coords = null;
              try {
                if (renderer && typeof renderer.viewportToGraph === 'function') {
                  const vx = (typeof pointer.x === 'number') ? pointer.x : (typeof pointer.clientX === 'number' ? pointer.clientX : pointer.pageX);
                  const vy = (typeof pointer.y === 'number') ? pointer.y : (typeof pointer.clientY === 'number' ? pointer.clientY : pointer.pageY);
                  if (typeof vx === 'number' && typeof vy === 'number') coords = renderer.viewportToGraph({ x: vx, y: vy });
                  else coords = renderer.viewportToGraph(pointer);
                }
              } catch (err) { coords = null; }
              if (!coords || Number.isNaN(coords.x) || Number.isNaN(coords.y)) return;
              try { graph.setNodeAttribute(_draggedNodeId, 'x', coords.x); } catch (e) {}
              try { graph.setNodeAttribute(_draggedNodeId, 'y', coords.y); } catch (e) {}
              const sigmaEvent = pointer && typeof pointer.preventSigmaDefault === 'function' ? pointer : null;
              if (sigmaEvent) {
                try { sigmaEvent.preventSigmaDefault(); } catch (e) {}
              }
              const original = pointer && (pointer.original || pointer);
              if (original) {
                try { if (typeof original.preventDefault === 'function') original.preventDefault(); } catch (e) {}
                try { if (typeof original.stopPropagation === 'function') original.stopPropagation(); } catch (e) {}
              }
            } catch (e) {}
          };
          try { renderer.on('downNode', handleDownNode); } catch (e) {}
          try { renderer.on('moveBody', handleMoveBody); } catch (e) {}
          try { renderer.on('upNode', handleDragEnd); } catch (e) {}
          try { renderer.on('upStage', handleDragEnd); } catch (e) {}
          try { renderer.on('leaveStage', handleDragEnd); } catch (e) {}
          cleanupFns.push(() => {
            try { handleDragEnd(); } catch (e) {}
            try { localRenderer.off && localRenderer.off('downNode', handleDownNode); } catch (e) {}
            try { localRenderer.off && localRenderer.off('moveBody', handleMoveBody); } catch (e) {}
            try { localRenderer.off && localRenderer.off('upNode', handleDragEnd); } catch (e) {}
            try { localRenderer.off && localRenderer.off('upStage', handleDragEnd); } catch (e) {}
            try { localRenderer.off && localRenderer.off('leaveStage', handleDragEnd); } catch (e) {}
          });

          // click on a node: toggle selection and inform SelectionManager
          renderer.on('clickNode', (evt) => {
            try {
              try { console.debug && console.debug('SigmaAdapter: clickNode evt:', evt); } catch (e) {}
              const nodeId = evt && (evt.node || evt.data && evt.data.node) ? (evt.node || (evt.data && evt.data.node)) : null;
              if (!nodeId) return;
              const currently = !!graph.getNodeAttribute(nodeId, 'selected');
              const json = { data: { id: String(nodeId) } };
              const key = SelectionManager ? SelectionManager.canonicalKey(json) : `node:${String(nodeId)}`;
              _localSelKeys.add(key);
              if (currently) {
                try { graph.removeNodeAttribute(nodeId, 'selected'); } catch (e) {}
                try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.unselect for node', json); SelectionManager.unselect(json); } } catch (e) {}
              } else {
                try { graph.setNodeAttribute(nodeId, 'selected', true); } catch (e) {}
                try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.select for node', json); SelectionManager.select(json); } } catch (e) {}
              }
            } catch (e) {}
          });

      // give Sigma a short moment to initialize GL resources then trigger a refresh
      try { setTimeout(() => { try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {} }, 120); } catch (e) {}
      try { requestAnimationFrame(() => { requestAnimationFrame(() => { try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {} }); }); } catch (e) {}
      return renderer;
          const toggleEdgeSelection = (edgeId, evtObj) => {
            try {
              if (!edgeId) return;
              const currently = !!graph.getEdgeAttribute(edgeId, 'selected');
              const src = (typeof graph.source === 'function') ? graph.source(edgeId) : null;
              const tgt = (typeof graph.target === 'function') ? graph.target(edgeId) : null;
              const json = { data: { id: String(edgeId), source: src, target: tgt } };
              const key = SelectionManager ? SelectionManager.canonicalKey(json) : `edge:${String(edgeId)}`;
              _localSelKeys.add(key);
              if (currently) {
                try { if (typeof graph.removeEdgeAttribute === 'function') graph.removeEdgeAttribute(edgeId, 'selected'); else graph.setEdgeAttribute(edgeId, 'selected', false); } catch (e) {}
                try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.unselect for edge', json, evtObj); SelectionManager.unselect(json); } } catch (e) {}
              } else {
                try { graph.setEdgeAttribute(edgeId, 'selected', true); } catch (e) {}
                try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.select for edge', json, evtObj); SelectionManager.select(json); } } catch (e) {}
              }
            } catch (e) {}
          };

          renderer.on('clickEdge', (evt) => {
            try {
              try { console.debug && console.debug('SigmaAdapter: clickEdge evt:', evt); } catch (e) {}
              const edgeId = evt && (evt.edge || (evt.data && evt.data.edge)) ? (evt.edge || (evt.data && evt.data.edge)) : null;
              toggleEdgeSelection(edgeId, evt);
            } catch (e) {}
          });
          renderer.on('clickEdges', (evt) => {
            try {
              try { console.debug && console.debug('SigmaAdapter: clickEdges evt:', evt); } catch (e) {}
              const edges = (evt && (evt.edges || (evt.data && evt.data.edges))) || [];
              const list = Array.isArray(edges) ? edges : [edges];
              const seen = new Set();
              list.forEach(edgeEntry => {
                try {
                  let edgeId = null;
                  if (typeof edgeEntry === 'string') edgeId = edgeEntry;
                  else if (edgeEntry && typeof edgeEntry === 'object') {
                    if (edgeEntry.id) edgeId = edgeEntry.id;
                    else if (edgeEntry.edge) edgeId = edgeEntry.edge;
                    else if (edgeEntry.key) edgeId = edgeEntry.key;
                    else if (edgeEntry.data && edgeEntry.data.edge) edgeId = edgeEntry.data.edge;
                  }
                  if (!edgeId || seen.has(edgeId)) return;
                  seen.add(edgeId);
                  toggleEdgeSelection(edgeId, evt);
                } catch (inner) {}
              });
            } catch (e) {}
          });

          // clickStage: clear selection unless physical LeftCtrl is down
          renderer.on('clickStage', (evt) => {
            try {
              const left = LeftCtrl && typeof LeftCtrl.isLeftCtrlDown === 'function' ? LeftCtrl.isLeftCtrlDown() : false;
              if (left) return;
            } catch (e) {}
            try {
              if (_localSelKeys && typeof _localSelKeys.clear === 'function') _localSelKeys.clear();
              graph.forEachNode((id) => { try { if (graph.getNodeAttribute(id, 'selected')) graph.removeNodeAttribute(id, 'selected'); } catch (e) {} });
              graph.forEachEdge((id) => { try { if (graph.getEdgeAttribute(id, 'selected')) graph.removeEdgeAttribute(id, 'selected'); } catch (e) {} });
              if (renderer && typeof renderer.refresh === 'function') renderer.refresh();
              try { if (SelectionManager && typeof SelectionManager.clear === 'function') SelectionManager.clear(); } catch (e) {}
            } catch (e) {}
          });
        }
      } catch (e) {}
      return renderer;
    };

    // attempt to pass options if SigmaCtor accepts them. Create the renderer via helper
    try {
      createRenderer();
    } catch (e) {
      console.error('SigmaAdapter: failed to create Sigma renderer', e);
      return makeNoopAdapter('renderer_failed');
    }
  } catch (err) {
    console.error('SigmaAdapter: failed to create Sigma renderer', err);
    return makeNoopAdapter('renderer_failed');
  }
  try { console.debug('SigmaAdapter: renderer created', { renderer: !!renderer, graphOrder: graph.order, graphSize: graph.size }); } catch (e) { console.debug('SigmaAdapter: renderer created'); }

  // local origin keys to avoid event loops when adapters and SelectionManager mirror
  let _localSelKeys = new Set();
  const selectionManagerUnsubs = [];
  // Curved-edge rendering is performed by the registered WebGL program
  // (@sigma/edge-curve). The adapter sets attributes expected by that
  // program so the renderer can draw and pick curved edges correctly.

  function ensureContainerPositioning() {
    try {
      if (!container) return;
      const style = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(container) : null;
      if (style && style.position === 'static') {
        container.style.position = 'relative';
      }
    } catch (e) {}
  }

  // Curved-edge rendering is performed by the registered WebGL program
  // and input events are delegated to Sigma; the adapter relies on the
  // renderer's built-in picking events.


  try {
    if (renderer && typeof renderer.setSetting === 'function') {
      renderer.setSetting('nodeReducer', (node, data) => {
        try {
          const hidden = !!graph.getNodeAttribute(node, 'hidden');
          const selected = !!graph.getNodeAttribute(node, 'selected');
          const label = graph.getNodeAttribute(node, 'label');
          const forceLabel = graph.getNodeAttribute(node, 'forceLabel');
          const out = Object.assign({}, data);
          if (hidden) out.hidden = true;
          if (typeof label === 'string') out.label = label;
          if (forceLabel) out.forceLabel = true;
          if (selected) {
            out.color = '#FFD54F';
            out.highlighted = true;
          }
          return out;
        } catch (e) { return data; }
      });
      renderer.setSetting('edgeReducer', (edge, data) => {
        try {
          const hidden = !!graph.getEdgeAttribute(edge, 'hidden');
          const out = Object.assign({}, data);
          if (hidden) out.hidden = true;
          const baseSize = Number(graph.getEdgeAttribute(edge, 'size'));
          if (!Number.isNaN(baseSize)) out.size = Math.max(1, baseSize * EDGE_VISUAL_SCALE);
          const label = graph.getEdgeAttribute(edge, 'label');
          if (typeof label === 'string' && label.trim().length) out.label = label;
          else if (out.label) delete out.label;
          if (graph.getEdgeAttribute(edge, 'forceLabel')) out.forceLabel = true;
          const selected = !!graph.getEdgeAttribute(edge, 'selected');
          if (selected) {
            out.color = '#FFD54F';
            out.size = Math.max(out.size || 1, baseSize ? baseSize * EDGE_VISUAL_SCALE * 1.6 : 1.6);
          } else {
            out.color = graph.getEdgeAttribute(edge, 'color') || out.color;
            out.size = Math.max(1, baseSize ? baseSize * EDGE_VISUAL_SCALE : 1);
          }
          return out;
        } catch (e) { return data; }
      });
    }
  } catch (e) {}

  // No DOM overlay setup is required when the curved-edge program is registered.

  // wire input events from the renderer to update graph selection state
  try {
    if (renderer && typeof renderer.on === 'function') {
      try {
        // click on a node: toggle selection and inform SelectionManager
        renderer.on('clickNode', (evt) => {
          try {
            try { console.debug && console.debug('SigmaAdapter: clickNode evt:', evt); } catch (e) {}
            const nodeId = evt && (evt.node || evt.data && evt.data.node) ? (evt.node || (evt.data && evt.data.node)) : null;
            if (!nodeId) return;
            const currently = !!graph.getNodeAttribute(nodeId, 'selected');
            const json = { data: { id: String(nodeId) } };
            const key = SelectionManager ? SelectionManager.canonicalKey(json) : `node:${String(nodeId)}`;
            // mark local origin to avoid SelectionManager echo loop
            _localSelKeys.add(key);
            if (currently) {
              try { graph.removeNodeAttribute(nodeId, 'selected'); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.unselect for node', json); SelectionManager.unselect(json); } } catch (e) {}
            } else {
              try { graph.setNodeAttribute(nodeId, 'selected', true); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.select for node', json); SelectionManager.select(json); } } catch (e) {}
            }
          } catch (e) {}
        });
        const toggleEdgeSelection = (edgeId, evtObj) => {
          try {
            if (!edgeId) return;
            const currently = !!graph.getEdgeAttribute(edgeId, 'selected');
            const src = (typeof graph.source === 'function') ? graph.source(edgeId) : null;
            const tgt = (typeof graph.target === 'function') ? graph.target(edgeId) : null;
            const json = { data: { id: String(edgeId), source: src, target: tgt } };
            const key = SelectionManager ? SelectionManager.canonicalKey(json) : `edge:${String(edgeId)}`;
            _localSelKeys.add(key);
            if (currently) {
              try { if (typeof graph.removeEdgeAttribute === 'function') graph.removeEdgeAttribute(edgeId, 'selected'); else graph.setEdgeAttribute(edgeId, 'selected', false); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.unselect for edge', json, evtObj); SelectionManager.unselect(json); } } catch (e) {}
            } else {
              try { graph.setEdgeAttribute(edgeId, 'selected', true); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.select for edge', json, evtObj); SelectionManager.select(json); } } catch (e) {}
            }
          } catch (e) {}
        };

  // Rely on the WebGL program's built-in picking and the renderer's
  // 'clickEdge'/'clickEdges' events.

        // click on an edge: toggle selection and inform SelectionManager
        renderer.on('clickEdge', (evt) => {
          try {
            try { console.debug && console.debug('SigmaAdapter: clickEdge evt:', evt); } catch (e) {}
            const edgeId = evt && (evt.edge || (evt.data && evt.data.edge)) ? (evt.edge || (evt.data && evt.data.edge)) : null;
            toggleEdgeSelection(edgeId, evt);
          } catch (e) {}
        });
        renderer.on('clickEdges', (evt) => {
          try {
            try { console.debug && console.debug('SigmaAdapter: clickEdges evt:', evt); } catch (e) {}
            const edges = (evt && (evt.edges || (evt.data && evt.data.edges))) || [];
            const list = Array.isArray(edges) ? edges : [edges];
            const seen = new Set();
            list.forEach(edgeEntry => {
              try {
                let edgeId = null;
                if (typeof edgeEntry === 'string') edgeId = edgeEntry;
                else if (edgeEntry && typeof edgeEntry === 'object') {
                  if (edgeEntry.id) edgeId = edgeEntry.id;
                  else if (edgeEntry.edge) edgeId = edgeEntry.edge;
                  else if (edgeEntry.key) edgeId = edgeEntry.key;
                  else if (edgeEntry.data && edgeEntry.data.edge) edgeId = edgeEntry.data.edge;
                }
                if (!edgeId || seen.has(edgeId)) return;
                seen.add(edgeId);
                toggleEdgeSelection(edgeId, evt);
              } catch (inner) {}
            });
          } catch (e) {}
        });
        // Additional edge events per sigma docs: log them and expose the edge id
        try {
          ['enterEdge', 'leaveEdge', 'downEdge', 'rightClickEdge', 'doubleClickEdge', 'wheelEdge'].forEach((evName) => {
            try {
              renderer.on(evName, (evt) => {
                try {
                  const edgeId = evt && (evt.edge || (evt.data && evt.data.edge)) ? (evt.edge || (evt.data && evt.data.edge)) : null;
                  try { console.debug && console.debug(`SigmaAdapter: ${evName}`, { edge: edgeId, evt }); } catch (e) {}
                } catch (e) {}
              });
            } catch (e) {}
          });
        } catch (e) {}
        // rely on canonical edge events only
        // v3: rely on the canonical 'clickEdge' (and 'clickNode') events. Do not
        // register additional debug-only edge handlers here to keep the adapter
        // minimal and predictable.
        // click on background/stage: clear selection unless the physical
        // Left Control key is held. This implements the app-level behaviour
        // at Sigma level so users can hold LeftCtrl to preserve selections
        // while clicking empty canvas to perform additive selection flows.
        try {
          renderer.on('clickStage', (evt) => {
            try {
              const left = LeftCtrl && typeof LeftCtrl.isLeftCtrlDown === 'function' ? LeftCtrl.isLeftCtrlDown() : false;
              // If left-Control is held, do not clear selection on empty-canvas clicks
              if (left) return;
            } catch (e) {}
            try {
              if (_localSelKeys && typeof _localSelKeys.clear === 'function') _localSelKeys.clear();
              graph.forEachNode((id) => { try { if (graph.getNodeAttribute(id, 'selected')) graph.removeNodeAttribute(id, 'selected'); } catch (e) {} });
              graph.forEachEdge((id) => { try { if (graph.getEdgeAttribute(id, 'selected')) graph.removeEdgeAttribute(id, 'selected'); } catch (e) {} });
              if (renderer && typeof renderer.refresh === 'function') renderer.refresh();
              try { if (SelectionManager && typeof SelectionManager.clear === 'function') SelectionManager.clear(); } catch (e) {}
            } catch (e) {}
          });
        } catch (e) {}
      } catch (e) {
        // some builds expose events under different names; try renderer.getMouseHandlers or container
      }
    }
  } catch (e) {}

  // Rely on Sigma edge events and the clickEdge handler above. If a build
  // does not deliver clickEdge we can implement a fallback using Sigma's
  // picking API instead of nearest-edge heuristics.

  const makeNodeWrapper = (id) => ({
    id: () => id,
    data: (k) => {
      const obj = { ...graph.getNodeAttributes(id) };
      if (typeof k === 'undefined') return obj;
      return obj ? obj[k] : undefined;
    },
    json: () => {
      const attr = graph.getNodeAttributes(id) || {};
      return { data: { ...attr }, position: { x: attr.x, y: attr.y } };
    },
    isNode: () => true,
    hasClass: (cls) => {
      if (cls === 'hidden') return !!graph.getNodeAttribute(id, 'hidden');
      if (cls === 'selected') return !!graph.getNodeAttribute(id, 'selected');
      return false;
    },
    addClass: (cls) => { if (cls === 'hidden') graph.setNodeAttribute(id, 'hidden', true); if (cls === 'selected') graph.setNodeAttribute(id, 'selected', true); },
    removeClass: (cls) => { if (cls === 'hidden') graph.removeNodeAttribute(id, 'hidden'); if (cls === 'selected') graph.removeNodeAttribute(id, 'selected'); },
    select: () => { graph.setNodeAttribute(id, 'selected', true); },
    unselect: () => { graph.removeNodeAttribute(id, 'selected'); }
  });

  const makeEdgeWrapper = (id) => ({
    id: () => id,
    data: (k) => {
      const obj = { ...graph.getEdgeAttributes(id) };
      if (typeof k === 'undefined') return obj;
      return obj ? obj[k] : undefined;
    },
    json: () => ({ data: { ...graph.getEdgeAttributes(id) } }),
    isNode: () => false,
    hasClass: (cls) => {
      if (cls === 'hidden') return !!graph.getEdgeAttribute(id, 'hidden');
      if (cls === 'selected') return !!graph.getEdgeAttribute(id, 'selected');
      return false;
    },
    addClass: (cls) => {
      if (cls === 'hidden') graph.setEdgeAttribute(id, 'hidden', true);
      if (cls === 'selected') graph.setEdgeAttribute(id, 'selected', true);
    },
    removeClass: (cls) => {
      if (cls === 'hidden') graph.removeEdgeAttribute(id, 'hidden');
      if (cls === 'selected') graph.removeEdgeAttribute(id, 'selected');
    },
    source: () => ({ id: () => graph.source(id) }),
    target: () => ({ id: () => graph.target(id) }),
    select: () => { graph.setEdgeAttribute(id, 'selected', true); },
    unselect: () => { graph.removeEdgeAttribute(id, 'selected'); }
  });

  const adapter = {
    impl: 'sigma',
    graph,
    renderer,
    _cleanupFns: cleanupFns,
    _draggedNode: null,
    _isDragging: false,
    getInstance() { return renderer; },
    // simple event registry to emulate Cytoscape's on(selector) semantics for 'select'/'unselect'
    _events: {},
  on(event, selectorOrHandler, handlerMaybe) {
      // allow (event, handler) or (event, selector, handler)
      const handler = typeof selectorOrHandler === 'function' ? selectorOrHandler : handlerMaybe;
      const selector = typeof selectorOrHandler === 'string' ? selectorOrHandler : null;
      if (!handler) return;
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push({ selector, handler });
      // wire graph attribute listener for selected changes
      if ((event === 'select' || event === 'unselect') && graph && typeof graph.on === 'function') {
        try {
          // lazy install a single attribute change listener if not present
          if (!this._attrListener) {
            // Accept a variety of Graphology event signatures. Some versions
            // call listeners as (node, attrName, newVal, oldVal), others as
            // (node, attributesObject). We normalize and handle selected changes.
            this._attrListener = function() {
              try {
                const args = Array.prototype.slice.call(arguments);
                const node = args[0];
                let attrName = null; let newVal = undefined; let oldVal = undefined;
                if (args.length >= 4 && typeof args[1] === 'string') {
                  // (node, attrName, newVal, oldVal)
                  attrName = args[1]; newVal = args[2]; oldVal = args[3];
                } else if (args.length >= 2 && typeof args[1] === 'object' && args[1] !== null) {
                  // (node, attributesObject)
                  const attrs = args[1];
                  if (Object.prototype.hasOwnProperty.call(attrs, 'selected')) {
                    attrName = 'selected'; newVal = attrs.selected; oldVal = undefined;
                  }
                }
                if (attrName !== 'selected') return;
                try {
                  // visual highlight: change node color and size when selected
                  if (newVal) {
                    try {
                      const curColor = graph.getNodeAttribute(node, 'color');
                      if (typeof curColor !== 'undefined') graph.setNodeAttribute(node, '__prev_color', curColor);
                      graph.setNodeAttribute(node, 'color', '#FFD54F');
                    } catch (e) {}
                    try {
                      const curSize = graph.getNodeAttribute(node, 'size');
                      if (typeof curSize !== 'undefined') graph.setNodeAttribute(node, '__prev_size', curSize);
                      const newSize = (typeof curSize === 'number' ? Math.max(6, curSize * 1.25) : 12);
                      graph.setNodeAttribute(node, 'size', newSize);
                    } catch (e) {}
                  } else {
                    try {
                      const prevColor = graph.getNodeAttribute(node, '__prev_color');
                      if (typeof prevColor !== 'undefined') { graph.setNodeAttribute(node, 'color', prevColor); graph.removeNodeAttribute(node, '__prev_color'); }
                    } catch (e) {}
                    try {
                      const prevSize = graph.getNodeAttribute(node, '__prev_size');
                      if (typeof prevSize !== 'undefined') { graph.setNodeAttribute(node, 'size', prevSize); graph.removeNodeAttribute(node, '__prev_size'); }
                    } catch (e) {}
                  }
                } catch (e) {}
                // ensure renderer updates
                try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                // call select handlers when newVal truthy, unselect when falsy
                const evName = newVal ? 'select' : 'unselect';
                const handlers = adapter._events[evName] || [];
                handlers.forEach(h => { try { h.handler({ type: evName, target: { id: node } }); } catch (e) {} });
                // Reflect selection into SelectionManager (unless we originated it locally)
                try {
                  if (SelectionManager) {
                    const j = { data: { id: node } };
                    const k = SelectionManager.canonicalKey(j);
                    if (_localSelKeys && _localSelKeys.has(k)) {
                      // this change originated from this adapter; remove local marker
                      try { _localSelKeys.delete(k); } catch (e) {}
                    } else {
                      if (newVal) SelectionManager.select(j); else SelectionManager.unselect(j);
                    }
                  }
                } catch (e) {}
              } catch (e) {}
            };
            // Graphology emits different event names depending on version/build;
            // attach to multiple likely names for robustness.
            try { graph.on('nodeAttributesUpdated', this._attrListener); } catch (e) {}
            try { graph.on('nodeAttributesChanged', this._attrListener); } catch (e) {}
            try { graph.on('attributesUpdated', this._attrListener); } catch (e) {}
            try { graph.on('attributesChanged', this._attrListener); } catch (e) {}
            // edge attribute listener to mirror edge 'selected' changes
            try {
              this._edgeAttrListener = function() {
                try {
                  const args = Array.prototype.slice.call(arguments);
                  const edge = args[0];
                  let attrName = null; let newVal = undefined; let oldVal = undefined;
                  if (args.length >= 4 && typeof args[1] === 'string') {
                    attrName = args[1]; newVal = args[2]; oldVal = args[3];
                  } else if (args.length >= 2 && typeof args[1] === 'object' && args[1] !== null) {
                    const attrs = args[1]; if (Object.prototype.hasOwnProperty.call(attrs, 'selected')) { attrName = 'selected'; newVal = attrs.selected; }
                  }
                  if (attrName !== 'selected') return;
                  try {
                    // call select/unselect handlers for edges
                    const evName = newVal ? 'select' : 'unselect';
                    const handlers = adapter._events[evName] || [];
                    handlers.forEach(h => { try { h.handler({ type: evName, target: { id: edge } }); } catch (e) {} });
                    // visual highlight adjustments mirroring node behaviour
                    try {
                      if (newVal) {
                        try {
                          const curColor = graph.getEdgeAttribute(edge, 'color');
                          if (typeof curColor !== 'undefined') graph.setEdgeAttribute(edge, '__prev_color', curColor);
                          graph.setEdgeAttribute(edge, 'color', '#FFD54F');
                        } catch (e) {}
                        try {
                          const curSize = graph.getEdgeAttribute(edge, 'size');
                          if (typeof curSize !== 'undefined') graph.setEdgeAttribute(edge, '__prev_size', curSize);
                          const newSize = (typeof curSize === 'number' ? Math.max(1, curSize * 1.5) : 2);
                          graph.setEdgeAttribute(edge, 'size', newSize);
                        } catch (e) {}
                      } else {
                        try {
                          const prevColor = graph.getEdgeAttribute(edge, '__prev_color');
                          if (typeof prevColor !== 'undefined') {
                            graph.setEdgeAttribute(edge, 'color', prevColor);
                            graph.removeEdgeAttribute(edge, '__prev_color');
                          }
                        } catch (e) {}
                        try {
                          const prevSize = graph.getEdgeAttribute(edge, '__prev_size');
                          if (typeof prevSize !== 'undefined') {
                            graph.setEdgeAttribute(edge, 'size', prevSize);
                            graph.removeEdgeAttribute(edge, '__prev_size');
                          }
                        } catch (e) {}
                      }
                    } catch (e) {}
                    try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                    // reflect into SelectionManager unless locally originated
                    try {
                      if (SelectionManager) {
                        const src = (typeof graph.source === 'function') ? graph.source(edge) : null;
                        const tgt = (typeof graph.target === 'function') ? graph.target(edge) : null;
                        const j = { data: { id: edge, source: src, target: tgt } };
                        const k = SelectionManager.canonicalKey(j);
                        if (_localSelKeys && _localSelKeys.has(k)) {
                          try { _localSelKeys.delete(k); } catch (e) {}
                        } else {
                          if (newVal) SelectionManager.select(j); else SelectionManager.unselect(j);
                        }
                      }
                    } catch (e) {}
                  } catch (e) {}
                } catch (e) {}
              };
              try { graph.on('edgeAttributesUpdated', this._edgeAttrListener); } catch (e) {}
              try { graph.on('edgeAttributesChanged', this._edgeAttrListener); } catch (e) {}
            } catch (e) {}
          }
        } catch (e) { console.warn('SigmaAdapter: failed to attach graph attr listener', e); }
      }
    },
    off(event, handler) {
      try {
        if (!this._events[event]) return;
        this._events[event] = this._events[event].filter(h => h.handler !== handler);
      } catch (e) {}
    },
    once(event, selectorOrHandler, handlerMaybe) {
      try {
        // support (event, handler) or (event, selector, handler)
        if (typeof selectorOrHandler === 'function') {
          const handler = selectorOrHandler;
          const wrapper = function() {
            try { handler.apply(this, arguments); } catch (e) {}
            try { adapter.off(event, wrapper); } catch (e) {}
          };
          this.on(event, wrapper);
          return;
        }
        // selector form
        const selector = selectorOrHandler;
        const handler = handlerMaybe;
        if (typeof handler !== 'function') return;
        const wrapper2 = function() {
          try { handler.apply(this, arguments); } catch (e) {}
          try { adapter.off(event, wrapper2); } catch (e) {}
        };
        this.on(event, selector, wrapper2);
      } catch (e) {}
    },
    // mapping for forwarding adapter event names to renderer event names
    _rendererEventMap: {},
    mapRendererEvents(map) {
      try { this._rendererEventMap = Object.assign({}, this._rendererEventMap, map || {}); } catch (e) {}
    },
    emit(event /*, ...args */) {
      try {
        const args = Array.prototype.slice.call(arguments, 1);
        console.debug && console.debug('SigmaAdapter: emit', { event, args });
        // Call adapter-registered handlers with selector-aware dispatch
        const handlers = this._events && this._events[event] ? this._events[event].slice(0) : [];
        handlers.forEach(h => {
          try {
            const sel = h.selector;
            // If no selector, call unconditionally
            if (!sel) {
              console.debug && console.debug('SigmaAdapter: calling handler (no selector) for', event);
              h.handler.apply(null, args);
              return;
            }
            // determine a representative payload object from args
            const payload = args.find(a => a && typeof a === 'object') || null;
            if (!payload) return;
            // normalize to data object which may contain id/source/target
            let dataObj = null;
            if (payload.data && typeof payload.data === 'object') dataObj = payload.data;
            else if (payload.target && typeof payload.target === 'object') dataObj = payload.target;
            else dataObj = payload;

            // determine group: edge if has source/target, else node
            const isEdge = (dataObj && (Object.prototype.hasOwnProperty.call(dataObj, 'source') || Object.prototype.hasOwnProperty.call(dataObj, 'target')));
            const isNode = !isEdge;

            let matched = false;
            if (sel === 'node' && isNode) matched = true;
            else if (sel === 'edge' && isEdge) matched = true;
            else if (sel === ':selected') {
              // check selected attribute on the graph entity if possible
              const id = (dataObj && (dataObj.id || dataObj.name)) ? (dataObj.id || dataObj.name) : null;
              if (id) {
                try {
                  if (graph.hasNode && graph.hasNode(id)) matched = !!graph.getNodeAttribute(id, 'selected');
                  else if (graph.hasEdge && graph.hasEdge(id)) matched = !!graph.getEdgeAttribute(id, 'selected');
                } catch (e) { matched = false }
              }
            }

            if (matched) {
              console.debug && console.debug('SigmaAdapter: calling handler (selector match) for', event, sel, dataObj && dataObj.id);
              h.handler.apply(null, args);
            }
          } catch (e) {}
        });

        // Forward to renderer only via renderer.emit (if available), using mapping
        try {
          if (renderer && typeof renderer.emit === 'function') {
            const mapped = (this._rendererEventMap && this._rendererEventMap[event]) ? this._rendererEventMap[event] : event;
            try { renderer.emit.apply(renderer, [mapped].concat(args)); } catch (e) { console.debug && console.debug('SigmaAdapter: renderer.emit failed', e); }
          }
        } catch (e) {}
      } catch (e) { console.debug && console.debug('SigmaAdapter: emit failed', e); }
    },
    fit() { try {
        if (renderer && renderer.getCamera) {
          // try to compute a bounding box from graph nodes; fallback to reset
          try {
            const nodes = graph.nodes();
            if (nodes.length === 0) { renderer.getCamera().goTo({ x: 0, y: 0, ratio: 1 }); return }
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(id => {
              const a = graph.getNodeAttributes(id) || {};
              const x = typeof a.x === 'number' ? a.x : 0;
              const y = typeof a.y === 'number' ? a.y : 0;
              if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
            });
            if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) { renderer.getCamera().goTo({ x: 0, y: 0, ratio: 1 }); return }
            const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2; const dx = Math.max(1, maxX - minX); const dy = Math.max(1, maxY - minY);
            // estimate ratio so that bounding box fits roughly into view; sigma's ratio is zoom factor relative to unit world
            const container = renderer.getContainer && renderer.getContainer();
            const w = container ? container.clientWidth || 800 : 800; const h = container ? container.clientHeight || 600 : 600;
            const pad = 40;
            const ratio = Math.min((w - pad*2) / dx, (h - pad*2) / dy);
            renderer.getCamera().goTo({ x: cx, y: cy, ratio: Math.max(0.0001, ratio) });
            return;
          } catch (e) { try { renderer.getCamera().goTo({ x: 0, y: 0, ratio: 1 }); } catch (e) {} }
        }
      } catch (e) {} },
    resize() { try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {} },
    zoom(level) { try {
        if (!renderer || !renderer.getCamera) return undefined;
        const cam = renderer.getCamera();
        // read current ratio when no arg provided
        if (typeof level === 'undefined' || level === null) {
          try {
            if (cam.getState) return cam.getState().ratio;
            if (cam.state) return cam.state.ratio;
            return undefined;
          } catch (e) { return undefined }
        }
        // set explicit ratio
        try { cam.set ? cam.set({ ratio: level }) : cam.goTo && cam.goTo({ ratio: level }); } catch (e) { try { cam.goTo({ ratio: level }); } catch (e) {} }
      } catch (e) {} },
    center() { try { if (renderer && renderer.getCamera) {
        const cam = renderer.getCamera();
        try { if (cam.set) cam.set({ x: 0, y: 0 }); else if (cam.goTo) cam.goTo({ x: 0, y: 0 }); } catch (e) {}
      } } catch (e) {} },
    animate({ zoom: targetZoom, center: centerObj, duration } = {}) {
      try {
        if (!renderer || !renderer.getCamera) return;
        const cam = renderer.getCamera();
        const startState = (cam.getState && cam.getState()) || (cam.state ? cam.state : { x: 0, y: 0, ratio: 1 });
        const startZoom = startState.ratio || 1;
        const startX = startState.x || 0; const startY = startState.y || 0;
        const endZoom = (typeof targetZoom === 'number') ? targetZoom : startZoom;
        let endX = startX, endY = startY;
        if (centerObj && centerObj.eles) {
          // center on all nodes
          try {
            const nodes = graph.nodes(); if (!nodes.length) { endX = 0; endY = 0; } else {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              nodes.forEach(id => { const a = graph.getNodeAttributes(id) || {}; const x = typeof a.x === 'number' ? a.x : 0; const y = typeof a.y === 'number' ? a.y : 0; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; });
              if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) { endX = (minX + maxX) / 2; endY = (minY + maxY) / 2; }
            }
          } catch (e) {}
        }
        const dur = typeof duration === 'number' ? duration : 240;
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / dur);
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          const rz = startZoom + (endZoom - startZoom) * ease;
          const rx = startX + (endX - startX) * ease;
          const ry = startY + (endY - startY) * ease;
          try { if (cam.set) cam.set({ ratio: rz, x: rx, y: ry }); else if (cam.goTo) cam.goTo({ ratio: rz, x: rx, y: ry }); } catch (e) {}
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      } catch (e) {}
    },
    nodes() {
      const ids = graph.nodes();
      const collection = {
        length: ids.length,
        forEach: (fn) => { ids.forEach(i => fn(makeNodeWrapper(i))); },
        map: (fn) => ids.map(i => fn(makeNodeWrapper(i))),
        filter: (predicate) => {
          if (typeof predicate === 'function') return ids.filter(i => predicate(makeNodeWrapper(i))).map(i => makeNodeWrapper(i));
          if (typeof predicate === 'string' && predicate.startsWith('.')) {
            const cls = predicate.slice(1);
            return ids.filter(i => { if (cls === 'hidden') return !!graph.getNodeAttribute(i, 'hidden'); return false; }).map(i => makeNodeWrapper(i));
          }
          return [];
        }
      };
      return collection;
    },
    edges() {
      const ids = graph.edges();
      const collection = {
        length: ids.length,
        forEach: (fn) => { ids.forEach(i => fn(makeEdgeWrapper(i))); },
        map: (fn) => ids.map(i => fn(makeEdgeWrapper(i))),
        filter: (predicate) => {
          if (typeof predicate === 'function') return ids.filter(i => predicate(makeEdgeWrapper(i))).map(i => makeEdgeWrapper(i));
          if (typeof predicate === 'string' && predicate.startsWith('.')) {
            const cls = predicate.slice(1);
            return ids.filter(i => { if (cls === 'hidden') return !!graph.getEdgeAttribute(i, 'hidden'); return false; }).map(i => makeEdgeWrapper(i));
          }
          return [];
        }
      };
      return collection;
    },
    elements() {
      const nodeArr = [];
      const edgeArr = [];
      graph.forEachNode(id => nodeArr.push(makeNodeWrapper(id)));
      graph.forEachEdge(id => edgeArr.push(makeEdgeWrapper(id)));
      const all = nodeArr.concat(edgeArr);
      return {
        length: all.length,
        toArray: () => all,
        forEach: (fn) => all.forEach(fn),
        map: (fn) => all.map(fn),
        filter: (pred) => all.filter(pred),
        select: () => { all.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
        unselect: () => { all.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
        data: (k, v) => {
          if (typeof k === 'undefined') return all.map(w => (w.json && w.json().data) || w.data && (typeof w.data === 'function' ? w.data() : w.data));
          if (k === 'selected') { if (v) return this.select(); return this.unselect(); }
          // generic setter for all elements
          all.forEach(w => {
            try {
              const j = (w.json && w.json()) || { data: (w.data && typeof w.data === 'function' ? w.data() : {}) };
              if (j && j.data) {
                const id = j.data && j.data.id;
                if (typeof id !== 'undefined') {
                  // try node first
                  if (graph.hasNode(id)) {
                    try { graph.setNodeAttribute(id, k, v); } catch (e) {}
                  } else if (graph.hasEdge && graph.hasEdge(id)) {
                    try { graph.setEdgeAttribute(id, k, v); } catch (e) {}
                  }
                }
              }
            } catch (e) {}
          });
          try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
        }
      };
    },
    select(id) {
      try {
        if (graph.hasNode(id)) graph.setNodeAttribute(id, 'selected', true);
        else if (graph.hasEdge && graph.hasEdge(id)) graph.setEdgeAttribute(id, 'selected', true);
      } catch (e) {}
    },
    unselect(id) {
      try {
        if (graph.hasNode(id)) graph.setNodeAttribute(id, 'selected', false);
        else if (graph.hasEdge && graph.hasEdge(id)) graph.removeEdgeAttribute(id, 'selected');
      } catch (e) {}
    },
    add(elementsToAdd) {
      const { nodes: n, edges: e } = cyElementsToGraphology(elementsToAdd || []);
      n.forEach(n1 => { if (!graph.hasNode(n1.id)) graph.addNode(n1.id, n1.attrs || {}); });
      e.forEach(e1 => {
        try {
          const edgeId = e1.id || `${e1.source}-${e1.target}`;
          if (!graph.hasEdge(edgeId)) {
            graph.addEdgeWithKey(edgeId, e1.source, e1.target, e1.attrs || {});
          }
        } catch (err) {}
      });
      try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (err) {}
    },
    remove(elementsToRemove) {
      (elementsToRemove || []).forEach(el => {
        try {
          if (!el || !el.data) return;
          const data = el.data;
          if (data.id != null && graph.hasNode(data.id)) {
            // dropping a node will also drop incident edges; clear related caches
            const incident = [];
            graph.forEachEdge((edgeId, attr, source, target) => {
              if (String(source) === String(data.id) || String(target) === String(data.id)) incident.push(edgeId);
            });
            graph.dropNode(data.id);
            return;
          }
          const edgeId = data.id != null ? String(data.id) : (data.source != null && data.target != null ? `${data.source}-${data.target}` : null);
          if (edgeId && graph.hasEdge(edgeId)) {
            graph.dropEdge(edgeId);
          }
        } catch (err) {}
      });
      try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (err) {}
    },
    filter(fn) { try { return graph.filterNodes(fn); } catch (e) { return []; } },
    // cytoscape-like $ and filter(selector) handling for simple selectors used in TopogramDetail
    $: function(selector) {
      // return a collection-like object with toArray(), forEach(), map()
      const nodes = [];
      const edges = [];
      if (!selector) return { toArray: () => [], forEach() {}, map() { return []; }, filter() { return []; }, length: 0 };
      // support plain 'node' or 'edge' selectors returning all wrappers
      if (selector === 'node') {
        graph.forEachNode(id => nodes.push(makeNodeWrapper(id)));
        const arrN = nodes;
        return {
          length: arrN.length,
          toArray: () => arrN,
          forEach: (fn) => arrN.forEach(fn),
          map: (fn) => arrN.map(fn),
          filter: (pred) => arrN.filter(pred),
          select: () => { arrN.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
          unselect: () => { arrN.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
          data: (k, v) => { if (k === 'selected') { if (v) return this.select(); return this.unselect(); } }
        };
      }
      if (selector === 'edge') {
        graph.forEachEdge(id => edges.push(makeEdgeWrapper(id)));
        const arrE = edges;
        return {
          length: arrE.length,
          toArray: () => arrE,
          forEach: (fn) => arrE.forEach(fn),
          map: (fn) => arrE.map(fn),
          filter: (pred) => arrE.filter(pred),
          select: () => { arrE.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
          unselect: () => { arrE.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
          data: (k, v) => { if (k === 'selected') { if (v) return this.select(); return this.unselect(); } }
        };
      }
      if (selector === ':selected') {
        graph.forEachNode(id => { if (graph.getNodeAttribute(id, 'selected')) nodes.push(makeNodeWrapper(id)); });
        graph.forEachEdge(id => { if (graph.getEdgeAttribute(id, 'selected')) edges.push(makeEdgeWrapper(id)); });
      } else if (selector.startsWith('node')) {
        const m = selector.match(/id\s*=\s*['"]?([^'"]+)['"]?/);
        if (m) { const id = m[1]; if (graph.hasNode(id)) nodes.push(makeNodeWrapper(id)); }
      } else if (selector.startsWith('edge')) {
        const m = selector.match(/id\s*=\s*['"]?([^'"]+)['"]?/);
        if (m) { const id = m[1]; if (graph.hasEdge(id)) edges.push(makeEdgeWrapper(id)); }
        else {
          const ms = selector.match(/source\s*=\s*['"]?([^'"\]]+)['"]?[\s\S]*target\s*=\s*['"]?([^'"\]]+)['"]?/);
          if (ms) {
            const s = ms[1], t = ms[2]; graph.forEachEdge(id => { const src = graph.source(id), tgt = graph.target(id); if (src === s && tgt === t) edges.push(makeEdgeWrapper(id)); });
          }
        }
      }
      const arr = nodes.concat(edges);
      return {
        length: arr.length,
        toArray: () => arr,
        forEach: (fn) => { arr.forEach(fn); },
        map: (fn) => arr.map(fn),
        filter: (pred) => arr.filter(pred)
      };
    },
    // extend filter to accept a selector string as cy.filter does in the app
    filter: function(predicate) {
      try {
        if (typeof predicate === 'string') {
          const res = this.$(predicate)
          // normalize into a collection-like object that supports select/unselect/data
          const arr = (res && typeof res.toArray === 'function') ? res.toArray() : (Array.isArray(res) ? res : [])
          const coll = {
            length: arr.length,
            toArray: () => arr,
            forEach: (fn) => arr.forEach(fn),
            map: (fn) => arr.map(fn),
            filter: (pred) => arr.filter(pred),
            select: () => { arr.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
            unselect: () => { arr.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
            data: (k, v) => {
              if (typeof k === 'undefined') return arr.map(w => (w.json && w.json().data) || (w.data && (typeof w.data === 'function' ? w.data() : w.data)));
              if (k === 'selected') { if (v) return coll.select(); return coll.unselect(); }
              arr.forEach(w => {
                try {
                  const j = (w.json && w.json()) || { data: (w.data && typeof w.data === 'function' ? w.data() : {}) };
                  if (j && j.data) {
                    const id = j.data && j.data.id;
                    if (typeof id !== 'undefined') {
                      if (graph.hasNode(id)) { try { graph.setNodeAttribute(id, k, v); } catch (e) {} }
                      else if (graph.hasEdge && graph.hasEdge(id)) { try { graph.setEdgeAttribute(id, k, v); } catch (e) {} }
                    }
                  }
                } catch (e) {}
              });
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
            }
          }
          return coll
        }
        // predicate function -> graph.filterNodes returns array of node ids; map to wrappers
        if (typeof predicate === 'function') {
          try {
            const ids = graph.filterNodes(predicate) || []
            const out = []
            if (Array.isArray(ids)) {
              ids.forEach(i => { try { out.push(makeNodeWrapper(i)); } catch (e) {} });
            }
            // return a collection-like object for compatibility
            const coll2 = {
              length: out.length,
              toArray: () => out,
              forEach: (fn) => out.forEach(fn),
              map: (fn) => out.map(fn),
              filter: (pred) => out.filter(pred),
              select: () => { out.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
              unselect: () => { out.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
              data: (k, v) => { if (k === 'selected') { if (v) return coll2.select(); return coll2.unselect(); } }
            }
            return coll2
          } catch (e) { return [] }
        }
        return []
      } catch (e) { return []; }
    },
    removeListener: function(event, handler) { try { this.off(event, handler); } catch (e) {} },
    isDragging() { return _isDraggingNode; },
    draggedNode() { return _draggedNodeId; },
    setNoCurves(value) {
      const disableCurves = Boolean(value);
      adapter._noCurves = disableCurves;

      const g = graph;
      if (!g || typeof g.forEachEdge !== 'function') return;

      const prevTypeKey = '__topogramPrevEdgeType';
      const prevCurvKey = '__topogramPrevEdgeCurvature';
      const canUseCurves = !disableCurves && !DEBUG_NO_CURVES && !!SigmaAdapter__EdgeCurveProgram;

      const shouldEdgeBeCurved = (edgeId, attr) => {
        if (!canUseCurves) return false;
        try {
          const src = typeof g.source === 'function' ? g.source(edgeId) : null;
          const tgt = typeof g.target === 'function' ? g.target(edgeId) : null;
          if (src != null && tgt != null && String(src) === String(tgt)) return true;
        } catch (err) {}

        const curveCount = attr && (attr.curveCount || attr.curve_count || attr._parallelCount);
        if (curveCount && Number(curveCount) > 1) return true;

        if (attr && (attr.parallelIndex != null || attr._parallelIndex != null || attr.curveIndex != null)) return true;

        const minIdx = attr ? attr.parallelMinIndex : undefined;
        const maxIdx = attr ? attr.parallelMaxIndex : undefined;
        if (typeof minIdx !== 'undefined' && typeof maxIdx !== 'undefined' && Number(maxIdx) > Number(minIdx)) return true;
        return false;
      };

      const computeCurvature = (edgeId, attr) => {
        try {
          if (attr && typeof attr[prevCurvKey] === 'number') return attr[prevCurvKey];
          const src = typeof g.source === 'function' ? g.source(edgeId) : null;
          const tgt = typeof g.target === 'function' ? g.target(edgeId) : null;
          if (src != null && tgt != null && String(src) === String(tgt)) {
            if (attr && typeof attr.curvature === 'number') return attr.curvature;
            return 0.5;
          }
          const rawIndex = attr && (attr.parallelIndex != null ? attr.parallelIndex : (attr._parallelIndex != null ? attr._parallelIndex : (attr.curveIndex != null ? attr.curveIndex : 0)));
          const index = Number(rawIndex) || 0;
          const rawCount = attr && (attr.curveCount || attr.curve_count || attr._parallelCount);
          const count = Number(rawCount) || 1;
          if (count <= 1 && !index) {
            if (attr && typeof attr.curvature === 'number') return attr.curvature;
            return 0;
          }
          const base = count === 2 ? 0.7 : 0.45;
          let direction = 1;
          if (src != null && tgt != null) direction = String(src) <= String(tgt) ? 1 : -1;
          if (!index) return direction * base * 0.65;
          return index * base;
        } catch (err) {
          if (attr && typeof attr.curvature === 'number') return attr.curvature;
          return 0;
        }
      };

      try {
        g.forEachEdge((edgeId) => {
          try {
            const attr = g.getEdgeAttributes ? g.getEdgeAttributes(edgeId) || {} : {};
            if (disableCurves || !canUseCurves) {
              if (attr && !Object.prototype.hasOwnProperty.call(attr, prevTypeKey) && attr.type && attr.type !== 'edge') {
                try { g.setEdgeAttribute(edgeId, prevTypeKey, attr.type); } catch (err) {}
              }
              if (attr && !Object.prototype.hasOwnProperty.call(attr, prevCurvKey) && typeof attr.curvature !== 'undefined') {
                try { g.setEdgeAttribute(edgeId, prevCurvKey, attr.curvature); } catch (err) {}
              }
              try { g.setEdgeAttribute(edgeId, 'type', 'edge'); } catch (err) {}
              try { g.setEdgeAttribute(edgeId, 'curvature', 0); } catch (err) {}
              return;
            }

            const storedType = attr ? attr[prevTypeKey] : undefined;
            const storedCurv = attr ? attr[prevCurvKey] : undefined;

            if (storedType) {
              try { g.setEdgeAttribute(edgeId, 'type', storedType); } catch (err) {}
            } else if (shouldEdgeBeCurved(edgeId, attr || {})) {
              try { g.setEdgeAttribute(edgeId, 'type', 'curved'); } catch (err) {}
            } else {
              try { g.setEdgeAttribute(edgeId, 'type', 'edge'); } catch (err) {}
            }

            if (typeof storedCurv === 'number') {
              try { g.setEdgeAttribute(edgeId, 'curvature', storedCurv); } catch (err) {}
            } else if (shouldEdgeBeCurved(edgeId, attr || {})) {
              try { g.setEdgeAttribute(edgeId, 'curvature', computeCurvature(edgeId, attr || {})); } catch (err) {}
            } else {
              try { g.setEdgeAttribute(edgeId, 'curvature', 0); } catch (err) {}
            }

            if (attr && Object.prototype.hasOwnProperty.call(attr, prevTypeKey)) {
              try { g.removeEdgeAttribute(edgeId, prevTypeKey); } catch (err) {}
            }
            if (attr && Object.prototype.hasOwnProperty.call(attr, prevCurvKey)) {
              try { g.removeEdgeAttribute(edgeId, prevCurvKey); } catch (err) {}
            }
          } catch (err) {
            // keep iterating even if one edge fails
          }
        });
      } catch (err) {}

      if (typeof sigmaOpts !== 'undefined' && sigmaOpts) {
        try {
          sigmaOpts.edgeProgramClasses = canUseCurves ? _savedEdgeProgramClasses : null;
        } catch (err) {}
      }

      const applyProgramsInPlace = () => {
        if (!renderer) return { touched: false, edgeProgramOk: false };
        const saved = _savedEdgeProgramClasses && typeof _savedEdgeProgramClasses === 'object' ? _savedEdgeProgramClasses : {};
        const keys = Object.keys(saved || {});
        let touched = false;
        let edgeProgramOk = false;

        if (disableCurves || !canUseCurves) {
          if (typeof renderer.unregisterEdgeProgram === 'function') {
            keys.forEach((key) => {
              try { renderer.unregisterEdgeProgram(key); touched = true; } catch (err) {}
            });
          }
          if (renderer.edgePrograms && typeof renderer.edgePrograms === 'object') {
            keys.forEach((key) => {
              const entry = renderer.edgePrograms[key];
              if (!entry) return;
              try { if (entry && typeof entry.kill === 'function') entry.kill(); } catch (err) {}
              try { delete renderer.edgePrograms[key]; } catch (err) {}
              touched = true;
            });
          }
        } else if (keys.length && typeof renderer.registerEdgeProgram === 'function') {
          keys.forEach((key) => {
            const program = saved[key];
            if (!program) return;
            try { renderer.registerEdgeProgram(key, program); touched = true; } catch (err) {}
          });
        }

        const ensureEdgeProgram = () => {
          if (!renderer.edgePrograms || typeof renderer.edgePrograms !== 'object') return false;
          if (renderer.edgePrograms.edge) { edgeProgramOk = true; return true; }
          const aliases = ['line', 'straight', 'arrow', 'default', 'fast', 'curved'];
          for (let i = 0; i < aliases.length; i += 1) {
            const key = aliases[i];
            const entry = renderer.edgePrograms[key];
            if (entry) {
              try { renderer.edgePrograms.edge = entry; edgeProgramOk = true; } catch (err) {}
              touched = true;
              return true;
            }
          }
          return false;
        };

        const firstPass = ensureEdgeProgram();
        if (!disableCurves && !firstPass) ensureEdgeProgram();
        if (!edgeProgramOk) {
          try {
            if (renderer.edgePrograms && typeof renderer.edgePrograms === 'object') {
              const fallback = renderer.edgePrograms.edge;
              edgeProgramOk = !!fallback;
            }
          } catch (err) {}
        }

        if (typeof _inspectEdgePrograms === 'function') {
          try { _inspectEdgePrograms(renderer); } catch (err) {}
        }

        return { touched, edgeProgramOk };
      };

      let programResult = { touched: false, edgeProgramOk: false };
      try { programResult = applyProgramsInPlace(); } catch (err) { programResult = { touched: false, edgeProgramOk: false }; }

      if ((!programResult.edgeProgramOk || !programResult.touched) && typeof createRenderer === 'function') {
        try {
          createRenderer();
          programResult = { touched: true, edgeProgramOk: true };
        } catch (err) {
          try { console.warn('SigmaAdapter.setNoCurves: renderer recreation failed', err); } catch (logErr) {}
        }
      }

      adapter.renderer = renderer;

      const cont = renderer && typeof renderer.getContainer === 'function' ? renderer.getContainer() : container;
      if (cont) {
        try { cont.dataset.sigmaNoCurves = disableCurves ? 'true' : 'false'; } catch (err) {}
        try {
          if (cont.classList && typeof cont.classList.toggle === 'function') {
            cont.classList.toggle('sigma-no-curves', disableCurves);
          }
        } catch (err) {}
      }

      if (renderer && typeof renderer.refresh === 'function') {
        try { renderer.refresh(); } catch (err) {}
        try {
          setTimeout(() => {
            try { renderer.refresh(); } catch (errInner) {}
          }, 160);
        } catch (err) {}
      }
    },
    destroy() {
      try { releaseDraggedNode(); } catch (e) {}
      try { adapterRef = null; } catch (e) {}
      try {
        selectionManagerUnsubs.forEach(fn => { try { if (typeof fn === 'function') fn(); } catch (e) {} });
        selectionManagerUnsubs.length = 0;
      } catch (e) {}
      try { cleanupFns.forEach(fn => { try { fn(); } catch (err) {} }); cleanupFns.length = 0; } catch (e) {}
      try { if (renderer && typeof renderer.kill === 'function') renderer.kill(); } catch (e) {}
    }
  };

  try { adapterRef = adapter; } catch (e) {}

  try {
    if (SelectionManager && typeof SelectionManager.on === 'function') {
      const handleSelect = ({ element } = {}) => {
        try {
          if (!element || !element.data) return;
          const key = SelectionManager.canonicalKey(element);
          if (key && _localSelKeys && _localSelKeys.has(key)) { try { _localSelKeys.delete(key); } catch (e) {} return; }
          const data = element.data;
          if (data.id != null && graph.hasNode(String(data.id))) {
            graph.setNodeAttribute(String(data.id), 'selected', true);
          } else if (data.source != null && data.target != null) {
            const eid = data.id != null ? String(data.id) : `${data.source}-${data.target}`;
            if (graph.hasEdge(eid)) {
              graph.setEdgeAttribute(eid, 'selected', true);
            } else {
              graph.forEachEdge((edgeId, attr, source, target) => {
                if (String(source) === String(data.source) && String(target) === String(data.target)) {
                  graph.setEdgeAttribute(edgeId, 'selected', true);
                }
              });
            }
          }
          if (renderer && typeof renderer.refresh === 'function') renderer.refresh();
        } catch (e) {}
      };

      const handleUnselect = ({ element } = {}) => {
        try {
          if (!element || !element.data) return;
          const key = SelectionManager.canonicalKey(element);
          if (key && _localSelKeys && _localSelKeys.has(key)) { try { _localSelKeys.delete(key); } catch (e) {} return; }
          const data = element.data;
          if (data.id != null && graph.hasNode(String(data.id))) {
            if (graph.getNodeAttribute(String(data.id), 'selected')) graph.removeNodeAttribute(String(data.id), 'selected');
          } else if (data.source != null && data.target != null) {
            const eid = data.id != null ? String(data.id) : `${data.source}-${data.target}`;
            if (graph.hasEdge(eid)) {
              if (graph.getEdgeAttribute(eid, 'selected')) graph.removeEdgeAttribute(eid, 'selected');
            } else {
              graph.forEachEdge((edgeId, attr, source, target) => {
                if (String(source) === String(data.source) && String(target) === String(data.target)) {
                  if (graph.getEdgeAttribute(edgeId, 'selected')) graph.removeEdgeAttribute(edgeId, 'selected');
                }
              });
            }
          }
          if (renderer && typeof renderer.refresh === 'function') renderer.refresh();
        } catch (e) {}
      };

      const handleClear = () => {
        try {
          if (_localSelKeys && typeof _localSelKeys.clear === 'function') _localSelKeys.clear();
          graph.forEachNode((id) => {
            if (graph.getNodeAttribute(id, 'selected')) graph.removeNodeAttribute(id, 'selected');
          });
          graph.forEachEdge((id) => {
            if (graph.getEdgeAttribute(id, 'selected')) graph.removeEdgeAttribute(id, 'selected');
          });
          if (renderer && typeof renderer.refresh === 'function') renderer.refresh();
        } catch (e) {}
      };

      selectionManagerUnsubs.push(SelectionManager.on('select', handleSelect));
      selectionManagerUnsubs.push(SelectionManager.on('unselect', handleUnselect));
      selectionManagerUnsubs.push(SelectionManager.on('clear', handleClear));
    }
  } catch (e) {}

  // layout runner matching cytoscape-like API: adapter.layout(layoutObj).run()
  adapter.layout = (layoutObj) => {
    let callbacks = [];
    return {
      run: () => {
        if (!layoutObj || layoutObj.name === 'preset') {
          // immediate callback to simulate synchronous completion
          setTimeout(() => { callbacks.forEach(cb => cb()); }, 0);
          return;
        }

        const nodes = graph.nodes().map(id => ({ id, x: graph.getNodeAttribute(id, 'x') || null, y: graph.getNodeAttribute(id, 'y') || null }));
        const edgesList = graph.edges().map(id => ({ id, source: graph.source(id), target: graph.target(id) }));
        const iterations = (layoutObj && layoutObj.maxSimulationTime) ? Math.max(100, Math.floor(layoutObj.maxSimulationTime / 5)) : 200;

        const workerCode = `self.onmessage = function(e) { const {nodes, edges, iterations} = e.data; const N = nodes.length; const pos = {}; for (let i=0;i<N;i++) pos[nodes[i].id] = { x: nodes[i].x != null ? nodes[i].x : (Math.random()*1000-500), y: nodes[i].y != null ? nodes[i].y : (Math.random()*1000-500) }; const k = Math.sqrt(1000*1000/Math.max(1,N)); for (let iter=0; iter<iterations; iter++) { const disp = {}; for (let i=0;i<N;i++) disp[nodes[i].id]={x:0,y:0}; for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) { const a=nodes[i].id,b=nodes[j].id; const dx=pos[a].x-pos[b].x, dy=pos[a].y-pos[b].y; let dist=Math.sqrt(dx*dx+dy*dy)+0.01; const force=(k*k)/dist; const ux=dx/dist, uy=dy/dist; disp[a].x+=ux*force; disp[a].y+=uy*force; disp[b].x-=ux*force; disp[b].y-=uy*force; } for (let ei=0; ei<edges.length; ei++){ const e=edges[ei]; const s=e.source,t=e.target; const dx=pos[s].x-pos[t].x, dy=pos[s].y-pos[t].y; let dist=Math.sqrt(dx*dx+dy*dy)+0.01; const force=(dist*dist)/k; const ux=dx/dist, uy=dy/dist; disp[s].x-=ux*force; disp[s].y-=uy*force; disp[t].x+=ux*force; disp[t].y+=uy*force; } const temp=10*(1-iter/iterations); for (let i=0;i<N;i++){ const id=nodes[i].id; const dx=disp[id].x, dy=disp[id].y; const len=Math.sqrt(dx*dx+dy*dy)||1; pos[id].x+=(dx/len)*Math.min(len,temp); pos[id].y+=(dy/len)*Math.min(len,temp); } } self.postMessage({positions:pos}); }`;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const w = new Worker(url);
        w.onmessage = function(ev) {
          const positions = ev.data.positions;
          Object.keys(positions).forEach(id => {
            try { if (graph.hasNode(id)) { graph.setNodeAttribute(id, 'x', positions[id].x); graph.setNodeAttribute(id, 'y', positions[id].y); } } catch (e) {}
          });
          try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
          callbacks.forEach(cb => { try { cb(); } catch (e) {} });
          w.terminate(); URL.revokeObjectURL(url);
        };
        w.postMessage({ nodes, edges: edgesList, iterations });
      },
      on: (evt, cb) => { if (evt === 'layoutstop' && typeof cb === 'function') callbacks.push(cb); }
    };
  };

  return adapter;
}

export default SigmaAdapter;

// Provide a convenience async mount API used by GraphWrapper
SigmaAdapter.mount = async ({ container, elements = [], layout = null, stylesheet = null, renderer = null, SigmaCtor = null } = {}) => {
  // layout/stylesheet currently unused by SigmaAdapter but accepted for API parity.
  // Accept `renderer` or `SigmaCtor` so React wrappers can inject their own
  // renderer/constructor (for example when using a react-sigma integration).
  return SigmaAdapter(container, elements, { layout, stylesheet, renderer, SigmaCtor });
}

// Add a convenience instance method on the adapter returned by SigmaAdapter
// via its factory so callers can toggle curved-edge rendering at runtime
// without reaching into adapter.graph directly.

