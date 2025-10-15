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

function SigmaAdapter(container, elements = [], options = {}) {
  let GraphConstructor = null;
  let SigmaCtor = null;
  try {
    // dynamic require to avoid hard dependency during import-time
    const gmod = require('graphology');
    GraphConstructor = gmod && (gmod.Graph || gmod);
    const smod = require('sigma');
    SigmaCtor = smod && (smod.Sigma || smod.default || smod);
  } catch (err) {
    console.warn('SigmaAdapter: graphology or sigma not available', err);
    return { impl: 'sigma', noop: true };
  }

  const graph = new GraphConstructor();

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

  // populate graph from cy-like elements if provided
  try {
    if (typeof cyElementsToGraphology !== 'function') throw new Error('cyElementsToGraphology is not a function');
    const { nodes = [], edges = [] } = cyElementsToGraphology(elements || []);
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
      if (!graph.hasNode(n.id)) graph.addNode(n.id, attrs);
    });
    edges.forEach(e => { try { if (!graph.hasEdge(e.id)) graph.addEdgeWithKey(e.id || `${e.source}-${e.target}`, e.source, e.target, e.attrs || {}); } catch (e) {} });
    try { console.debug('SigmaAdapter: populated graph', { nodeCount: graph.order, edgeCount: graph.size }); } catch (e) { console.debug('SigmaAdapter: populated graph (counts unavailable)'); }
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

  let renderer = null;
  try {
    // Provide GPU-friendly renderer options where supported by sigma v3
    const sigmaOpts = {
      // WebGL context hints: prefer low power if available, but let browser decide
      // (sigma exposes renderer-related options in various builds; pass what we can)
      // Also provide a renderer that uses container size and disables pixel ratio forcing
      render: { background: '#ffffff00' },
      settings: {
        // prefer WebGL GPU accelerated rendering when available
        labelRenderedSizeThreshold: 6,
        defaultNodeType: 'circle',
        edgeProgramClasses: { 'edge': 'edge' }
      }
    };
    // attempt to pass options if SigmaCtor accepts them
    try { renderer = new SigmaCtor(graph, container, sigmaOpts); } catch (e) { renderer = new SigmaCtor(graph, container); }
  } catch (err) {
    console.error('SigmaAdapter: failed to create Sigma renderer', err);
    return makeNoopAdapter('renderer_failed');
  }
  try { console.debug('SigmaAdapter: renderer created', { renderer: !!renderer, graphOrder: graph.order, graphSize: graph.size }); } catch (e) { console.debug('SigmaAdapter: renderer created'); }

  const makeNodeWrapper = (id) => ({
    id: () => id,
    data: () => ({ ...graph.getNodeAttributes(id) }),
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
    data: () => ({ ...graph.getEdgeAttributes(id) }),
    json: () => ({ data: { ...graph.getEdgeAttributes(id) } }),
    isNode: () => false,
    hasClass: (cls) => { if (cls === 'hidden') return !!graph.getEdgeAttribute(id, 'hidden'); return false; },
    addClass: (cls) => { if (cls === 'hidden') graph.setEdgeAttribute(id, 'hidden', true); },
    removeClass: (cls) => { if (cls === 'hidden') graph.removeEdgeAttribute(id, 'hidden'); },
    source: () => ({ id: () => graph.source(id) }),
    target: () => ({ id: () => graph.target(id) })
  });

  const adapter = {
    impl: 'sigma',
    graph,
    renderer,
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
          // lazy install a single attribute change listener
          if (!this._attrListener) {
            this._attrListener = (node, attrName, newVal, oldVal) => {
              if (attrName !== 'selected') return;
              // call select handlers when newVal truthy, unselect when falsy
              const evName = newVal ? 'select' : 'unselect';
              const handlers = this._events[evName] || [];
              handlers.forEach(h => {
                try { h.handler({ type: evName, target: { id: node } }); } catch (e) {}
              });
            };
            graph.on('nodeAttributesUpdated', this._attrListener);
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
    fit() { try { if (renderer && renderer.getCamera) renderer.getCamera().goTo({ x: 0, y: 0, ratio: 1 }); } catch (e) {} },
    resize() { try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {} },
    zoom(level) { try { if (renderer && renderer.getCamera) renderer.getCamera().set({ ratio: level }); } catch (e) {} },
    center() { try { if (renderer && renderer.getCamera) renderer.getCamera().set({ x: 0, y: 0 }); } catch (e) {} },
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
    elements() { return { nodes: adapter.nodes(), edges: adapter.edges() }; },
    select(id) { try { if (graph.hasNode(id)) graph.setNodeAttribute(id, 'selected', true); } catch (e) {} },
    unselect(id) { try { if (graph.hasNode(id)) graph.setNodeAttribute(id, 'selected', false); } catch (e) {} },
    add(elementsToAdd) {
      const { nodes: n, edges: e } = cyElementsToGraphology(elementsToAdd || []);
      n.forEach(n1 => { if (!graph.hasNode(n1.id)) graph.addNode(n1.id, n1.attrs || {}); });
      e.forEach(e1 => { try { if (!graph.hasEdge(e1.id)) graph.addEdgeWithKey(e1.id || `${e1.source}-${e1.target}`, e1.source, e1.target, e1.attrs || {}); } catch (err) {} });
      try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (err) {}
    },
    remove(elementsToRemove) {
      (elementsToRemove || []).forEach(el => { try { if (el && el.data && graph.hasNode(el.data.id)) graph.dropNode(el.data.id); } catch (err) {} });
      try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (err) {}
    },
    filter(fn) { try { return graph.filterNodes(fn); } catch (e) { return []; } },
    // cytoscape-like $ and filter(selector) handling for simple selectors used in TopogramDetail
    $: function(selector) {
      // return a collection-like object with toArray(), forEach(), map()
      const nodes = [];
      const edges = [];
      if (!selector) return { toArray: () => [], forEach() {}, map() { return []; }, filter() { return []; }, length: 0 };
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
      if (typeof predicate === 'string') {
        return this.$(predicate);
      }
      try { return graph.filterNodes(predicate); } catch (e) { return []; }
    },
    removeListener: function(event, handler) { try { this.off(event, handler); } catch (e) {} },
    destroy() { try { if (renderer && typeof renderer.kill === 'function') renderer.kill(); } catch (e) {} }
  };

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
SigmaAdapter.mount = async ({ container, elements = [], layout = null, stylesheet = null } = {}) => {
  // layout/stylesheet currently unused by SigmaAdapter but accepted for API parity
  return SigmaAdapter(container, elements, { layout, stylesheet });
}
