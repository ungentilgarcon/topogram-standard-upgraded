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

// SelectionManager integration (optional)
let SelectionManager = null;
try {
  const sm = require('/imports/client/selection/SelectionManager');
  SelectionManager = sm && (sm.default || sm);
} catch (e) { SelectionManager = null }

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
      // ensure a size attribute so Sigma renders nodes at a reasonable default
      try {
        if (typeof attrs.size === 'undefined' || attrs.size === null) {
          const w = attrs.weight != null ? Number(attrs.weight) : null;
          if (w != null && !Number.isNaN(w)) attrs.size = Math.max(6, Math.min(48, Math.floor(w / 2)));
          else attrs.size = 10;
        }
      } catch (e) { attrs.size = attrs.size || 10 }
      if (!graph.hasNode(n.id)) graph.addNode(n.id, attrs);
    });
    edges.forEach(e => { try { if (!graph.hasEdge(e.id)) graph.addEdgeWithKey(e.id || `${e.source}-${e.target}`, e.source, e.target, e.attrs || {}); } catch (e) {} });
    edges.forEach(e => { try { const attrs = Object.assign({}, e.attrs || {}); if (typeof attrs.size === 'undefined' || attrs.size === null) { attrs.size = (typeof attrs.width === 'number' ? attrs.width : (attrs.weight != null ? Number(attrs.weight) : 1)); } if (!graph.hasEdge(e.id || `${e.source}-${e.target}`)) graph.addEdgeWithKey(e.id || `${e.source}-${e.target}`, e.source, e.target, attrs); } catch (err) {} });
    try { console.debug('SigmaAdapter: populated graph', { nodeCount: graph.order, edgeCount: graph.size }); } catch (e) { console.debug('SigmaAdapter: populated graph (counts unavailable)'); }

    // Ensure every edge has a sensible 'size' attribute so edges are visible
    // and pickable in Sigma. Prefer explicit attrs.size, then attrs.width,
    // then attrs.weight, otherwise fallback to 1.
    try {
      graph.forEachEdge((id, attr) => {
        try {
          const a = attr || {};
          if (typeof a.size === 'undefined' || a.size === null) {
            const w = (typeof a.width === 'number') ? a.width : (a.weight != null ? Number(a.weight) : null);
            const sizeVal = (w != null && !Number.isNaN(w)) ? Math.max(1, w) : 1;
            try { graph.setEdgeAttribute(id, 'size', sizeVal); } catch (e) {}
          }
          // If an edge carries a label, emoji, name or title, ensure it's
          // exposed to Sigma as the 'label' attribute and request forceLabel
          // so the label shows regardless of zoom if possible.
          try {
            const maybeLabel = (a.label || a.relationship || a.emoji || a.title || a.name);
            if (typeof maybeLabel !== 'undefined' && maybeLabel !== null) {
              const lbl = (typeof maybeLabel === 'string') ? maybeLabel : String(maybeLabel);
              try { graph.setEdgeAttribute(id, 'label', lbl); } catch (e) {}
              try { graph.setEdgeAttribute(id, 'forceLabel', true); } catch (e) {}
              console.debug && console.debug('SigmaAdapter: edge label set', { id, label: lbl });
            }
          } catch (e) {}
          // If edge carries an 'enlightement' === 'arrow' or arrow flag, set
          // attributes to request an arrowhead from the renderer when supported.
          try {
            const hasArrow = (a && (String(a.enlightement).toLowerCase() === 'arrow' || a.arrow));
            if (hasArrow) {
              try { graph.setEdgeAttribute(id, 'type', 'arrow'); } catch (e) {}
              try { if (a.color) graph.setEdgeAttribute(id, 'targetArrowColor', a.color); } catch (e) {}
              try { graph.setEdgeAttribute(id, 'enlightement', 'arrow'); } catch (e) {}
            }
          } catch (e) {}
        } catch (e) {}
      });
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
  try {
    // Provide GPU-friendly renderer options where supported by sigma v3
    const sigmaOpts = {
      // WebGL context hints: prefer low power if available, but let browser decide
      // (sigma exposes renderer-related options in various builds; pass what we can)
      render: { background: '#ffffff00' },
      settings: {
        // prefer WebGL GPU accelerated rendering when available
        labelRenderedSizeThreshold: 6,
        defaultNodeType: 'circle',
        edgeProgramClasses: { 'edge': 'edge' },
        // v3 uses a single flag to enable edge-related events
        enableEdgeHovering: true,
        enableEdgeEvents: true,
        enableEdgeClickEvents: true,
        defaultDrawEdgeLabels: true,
        // make hover detection more permissive; edges need a size to be clickable
        edgeHoverSizeRatio: 4
      }
    };
    // attempt to pass options if SigmaCtor accepts them
    try { renderer = new SigmaCtor(graph, container, sigmaOpts); } catch (e) { renderer = new SigmaCtor(graph, container); }
  } catch (err) {
    console.error('SigmaAdapter: failed to create Sigma renderer', err);
    return makeNoopAdapter('renderer_failed');
  }
  try { console.debug('SigmaAdapter: renderer created', { renderer: !!renderer, graphOrder: graph.order, graphSize: graph.size }); } catch (e) { console.debug('SigmaAdapter: renderer created'); }

  // local origin keys to avoid event loops when adapters and SelectionManager mirror
  let _localSelKeys = new Set();


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
  // click on an edge: toggle selection and inform SelectionManager
        renderer.on('clickEdge', (evt) => {
          try {
            try { console.debug && console.debug('SigmaAdapter: clickEdge evt:', evt); } catch (e) {}
            const edgeId = evt && (evt.edge || evt.data && evt.data.edge) ? (evt.edge || (evt.data && evt.data.edge)) : null;
            if (!edgeId) return;
            const currently = !!graph.getEdgeAttribute(edgeId, 'selected');
            const src = (typeof graph.source === 'function') ? graph.source(edgeId) : null;
            const tgt = (typeof graph.target === 'function') ? graph.target(edgeId) : null;
            const json = { data: { id: String(edgeId), source: src, target: tgt } };
            const key = SelectionManager ? SelectionManager.canonicalKey(json) : `edge:${String(edgeId)}`;
            // mark local origin to avoid SelectionManager echo loop
            _localSelKeys.add(key);
            if (currently) {
              try { if (typeof graph.removeEdgeAttribute === 'function') graph.removeEdgeAttribute(edgeId, 'selected'); else graph.setEdgeAttribute(edgeId, 'selected', false); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.unselect for edge', json); SelectionManager.unselect(json); } } catch (e) {}
            } else {
              try { if (typeof graph.setEdgeAttribute === 'function') graph.setEdgeAttribute(edgeId, 'selected', true); else graph.setEdgeAttribute(edgeId, 'selected', true); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: Calling SelectionManager.select for edge', json); SelectionManager.select(json); } } catch (e) {}
            }
          } catch (e) {}
        });
        // v3: rely on the canonical 'clickEdge' (and 'clickNode') events. Do not
        // register additional debug-only edge handlers here to keep the adapter
        // minimal and predictable.
      } catch (e) {
        // some builds expose events under different names; try renderer.getMouseHandlers or container
      }
    }
  } catch (e) {}

  // Removed fallback heuristics: rely on Sigma edge events and the clickEdge
  // handler above. If your Sigma build still does not deliver clickEdge, we can
  // implement a fallback that uses the Sigma picking API (preferred) instead of
  // manual nearest-edge math.

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
