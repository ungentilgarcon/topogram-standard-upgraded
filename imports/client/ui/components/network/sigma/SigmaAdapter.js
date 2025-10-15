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
          edgeProgramClasses: { 'edge': 'edge' },
          // enable edge hovering so edge events (hover/click) are delivered
          enableEdgeHovering: true,
          // some sigma builds use different flag names for edge events; enable both forms
          // enable low-level edge hover/click/wheel events
          enableEdgeHoverEvents: true,
          enableEdgeClickEvents: true,
          enableEdgeWheelEvents: true,
          // legacy/other builds may use this flag name
          enableEdgeClicking: true,
          // make hover detection more permissive; edges need a size to be clickable
          edgeHoverSizeRatio: 1
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
            try { console.debug && console.debug('SigmaAdapter: container click at pixel', { cx, cy, rect }); } catch (e) {}
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
        // NOTE: some Sigma builds don't emit `clickEdge` for edges but instead
        // emit a generic `clickStage`. To handle those builds we keep a
        // clickStage listener that first tries renderer-provided picking
        // helpers (preferred) and falls back to a corrected projection-based
        // nearest-edge detection. This ensures edge clicks still produce
        // selection events and console logs in mixed Sigma builds.
        const _tryRendererPickEdge = (px, py) => {
          try {
            // Many sigma builds expose helpers -- try common names.
            if (!renderer) return null;
            // Some builds: renderer.getEdgeAt(pixelX, pixelY)
            if (typeof renderer.getEdgeAt === 'function') {
              try { return renderer.getEdgeAt(px, py) || null; } catch (e) {}
            }
            // Some builds: renderer.getEdgeAtPixel
            if (typeof renderer.getEdgeAtPixel === 'function') {
              try { return renderer.getEdgeAtPixel(px, py) || null; } catch (e) {}
            }
            // Some builds expose a 'getClosestEdge' helper
            if (typeof renderer.getClosestEdge === 'function') {
              try { return renderer.getClosestEdge(px, py) || null; } catch (e) {}
            }
            // Newer sigma v3-derived renderers sometimes expose "getEdgeAt" on
            // the internal "renderers" or "picking" namespaces. Try some
            // defensive lookups.
            if (renderer.picking && typeof renderer.picking.getEdgeAt === 'function') {
              try { return renderer.picking.getEdgeAt(px, py) || null; } catch (e) {}
            }
            if (renderer.renderers && renderer.renderers[0] && typeof renderer.renderers[0].getEdgeAt === 'function') {
              try { return renderer.renderers[0].getEdgeAt(px, py) || null; } catch (e) {}
            }
          } catch (e) {}
          return null;
        };

        const _screenToSigmaPixel = (cx, cy, rect) => {
          // The event coords are already in canvas pixel space for many builds
          // but some builds offer DOM client coords. Normalize by subtracting
          // container rect and accounting for devicePixelRatio and camera.
          const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
          // For sigma renderer helpers we should pass pixel coords relative to
          // the canvas (not world coordinates). Using rect-relative coords is
          // usually correct; scale by DPR to match internal WebGL sizing.
          return { px: Math.round(cx * dpr), py: Math.round(cy * dpr) };
        };

        renderer.on('clickStage', (evt) => {
          try {
            console.debug && console.debug('SigmaAdapter: clickStage evt:', evt);

            // Resolve container and rect
            const containerEl = renderer && typeof renderer.getContainer === 'function' ? renderer.getContainer() : container;
            const rect = (containerEl && containerEl.getBoundingClientRect) ? containerEl.getBoundingClientRect() : { left: 0, top: 0, width: (containerEl ? containerEl.clientWidth : 800), height: (containerEl ? containerEl.clientHeight : 600) };

            // Gather a set of plausible container-relative coordinates using
            // multiple conventions: sigma evt coords, sigma evt coords adjusted
            // by container rect, DOM native client coords, etc. Each variant is
            // annotated with whether it represents CSS pixels (container
            // relative) or canvas pixels.
            const variants = [];
            const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
            if (evt && evt.event && typeof evt.event.x === 'number' && typeof evt.event.y === 'number') {
              // Some builds give canvas pixel coords directly
              variants.push({ label: 'evt_raw_canvas', cx: evt.event.x, cy: evt.event.y, type: 'canvas' });
              // Others give client coords; try a rect-relative interpretation
              variants.push({ label: 'evt_rect_css', cx: evt.event.x - rect.left, cy: evt.event.y - rect.top, type: 'css' });
            }
            const native = evt && (evt.originalEvent || evt.nativeEvent || (evt.event && evt.event.original)) ? (evt.originalEvent || evt.nativeEvent || (evt.event && evt.event.original)) : null;
            if (native && typeof native.clientX === 'number' && typeof native.clientY === 'number') {
              variants.push({ label: 'native_client_css', cx: native.clientX - rect.left, cy: native.clientY - rect.top, type: 'css' });
            }
            // If no candidates, bail out (clear selection as before)
            if (!variants.length) {
              try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: clickStage no coords -> clear'); SelectionManager.clear(); } else graph.forEachNode(id => { if (graph.getNodeAttribute(id, 'selected')) graph.removeNodeAttribute(id, 'selected'); }); } catch (e) {}
              try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
              return;
            }

            // Try renderer picking helpers for each plausible coordinate
            let pickedEdge = null; let pickedInfo = null;
            try {
              const avail = {
                getEdgeAt: !!(renderer && typeof renderer.getEdgeAt === 'function'),
                getEdgeAtPixel: !!(renderer && typeof renderer.getEdgeAtPixel === 'function'),
                getClosestEdge: !!(renderer && typeof renderer.getClosestEdge === 'function'),
                picking_getEdgeAt: !!(renderer && renderer.picking && typeof renderer.picking.getEdgeAt === 'function'),
                renderers_getEdgeAt: !!(renderer && renderer.renderers && renderer.renderers[0] && typeof renderer.renderers[0].getEdgeAt === 'function')
              };
              console.debug && console.debug('SigmaAdapter: picker availability', { dpr, avail, rect });
              // For each candidate try unscaled (CSS) and DPR-scaled (canvas) coords
              for (let vI = 0; vI < variants.length && !pickedEdge; vI++) {
                const v = variants[vI];
                // compute both interpretations
                const cx_css = v.type === 'css' ? v.cx : (v.cx / dpr);
                const cy_css = v.type === 'css' ? v.cy : (v.cy / dpr);
                const cx_canvas = v.type === 'canvas' ? v.cx : (v.cx * dpr);
                const cy_canvas = v.type === 'canvas' ? v.cy : (v.cy * dpr);
                const attempts = [ { label: v.label + '.css_unscaled', x: Math.round(cx_css), y: Math.round(cy_css) }, { label: v.label + '.canvas_scaled', x: Math.round(cx_canvas), y: Math.round(cy_canvas) } ];
                for (let aI = 0; aI < attempts.length && !pickedEdge; aI++) {
                  const a = attempts[aI];
                  try {
                    const tryRes = _tryRendererPickEdge(a.x, a.y);
                    if (tryRes) {
                      pickedEdge = tryRes;
                      pickedInfo = { variant: v, attempt: a };
                      console.debug && console.debug('SigmaAdapter: clickStage pickedEdge by renderer helper', { pickedEdge, pickedInfo });
                      break;
                    }
                  } catch (e) {}
                }
              }
            } catch (e) { pickedEdge = null }

            // If renderer helpers didn't yield an edge, fallback to projection-based nearest-edge detection.
            if (!pickedEdge) {
              try {
                let best = null; let bestDist = Infinity; const threshold = 20; // px (canvas pixels)
                // Build a list of target positions in canvas pixels for each variant
                const targetPoints = variants.map(v => {
                  if (v.type === 'canvas') return { label: v.label, sx: v.cx, sy: v.cy, srcType: 'canvas' };
                  return { label: v.label, sx: v.cx * dpr, sy: v.cy * dpr, srcType: 'css' };
                });
                // camera state if available
                let cameraState = null;
                try { cameraState = renderer && renderer.getCamera ? (renderer.getCamera().getState ? renderer.getCamera().getState() : renderer.getCamera().state) : null; } catch (e) { cameraState = null }
                // helper that projects world->canvas pixels using camera state
                const proj = (wx, wy) => {
                  if (cameraState && typeof cameraState.ratio === 'number') {
                    const camX = cameraState.x || 0; const camY = cameraState.y || 0; const ratio = cameraState.ratio || 1;
                    const canvasW = rect.width || 800; const canvasH = rect.height || 600;
                    // world -> canvas CSS pixels center then scale by DPR
                    const cxw = ((wx - camX) * ratio) + (canvasW / 2);
                    const cyw = ((wy - camY) * ratio) + (canvasH / 2);
                    return { x: cxw * dpr, y: cyw * dpr };
                  }
                  return { x: wx * dpr, y: wy * dpr };
                };
                // iterate edges and compute screen-space distance to segment for each target point
                targetPoints.forEach(tp => {
                  try {
                    graph.forEachEdge((id, attr, source, target) => {
                      try {
                        const sxw = graph.getNodeAttribute(source, 'x'); const syw = graph.getNodeAttribute(source, 'y');
                        const txw = graph.getNodeAttribute(target, 'x'); const tyw = graph.getNodeAttribute(target, 'y');
                        if (!isFinite(sxw) || !isFinite(syw) || !isFinite(txw) || !isFinite(tyw)) return;
                        const ssp = proj(sxw, syw); const tsp = proj(txw, tyw);
                        const dx = tsp.x - ssp.x; const dy = tsp.y - ssp.y; const l2 = dx * dx + dy * dy;
                        let t = 0; if (l2 > 0) t = ((tp.sx - ssp.x) * dx + (tp.sy - ssp.y) * dy) / l2; t = Math.max(0, Math.min(1, t));
                        const px = ssp.x + t * dx; const py = ssp.y + t * dy; const dist = Math.hypot(tp.sx - px, tp.sy - py);
                        if (dist < bestDist) { bestDist = dist; best = { id, source, target, variant: tp.label, dist }; }
                      } catch (e) {}
                    });
                  } catch (e) {}
                });
                if (best && bestDist <= threshold) {
                  pickedEdge = best.id;
                  console.debug && console.debug('SigmaAdapter: clickStage -> detected nearest edge (fallback)', { best, bestDist, threshold });
                } else {
                  // Diagnostic: collect top candidates across variants
                  try {
                    const candidates = [];
                    const camState = cameraState;
                    const proj2 = proj;
                    const allTargets = targetPoints;
                    allTargets.forEach(v => {
                      graph.forEachEdge((id, attr, source, target) => {
                        try {
                          const sxw = graph.getNodeAttribute(source, 'x'); const syw = graph.getNodeAttribute(source, 'y');
                          const txw = graph.getNodeAttribute(target, 'x'); const tyw = graph.getNodeAttribute(target, 'y');
                          if (!isFinite(sxw) || !isFinite(syw) || !isFinite(txw) || !isFinite(tyw)) return;
                          const ssp = proj2(sxw, syw); const tsp = proj2(txw, tyw);
                          const dx = tsp.x - ssp.x; const dy = tsp.y - ssp.y; const l2 = dx * dx + dy * dy;
                          let t2 = 0; if (l2 > 0) t2 = ((v.sx - ssp.x) * dx + (v.sy - ssp.y) * dy) / l2; t2 = Math.max(0, Math.min(1, t2));
                          const px2 = ssp.x + t2 * dx; const py2 = ssp.y + t2 * dy; const dist2 = Math.hypot(v.sx - px2, v.sy - py2);
                          candidates.push({ id, source, target, variant: v.label, dist: dist2, px: px2, py: py2, srcType: v.srcType });
                        } catch (e) {}
                      });
                    });
                    candidates.sort((a,b) => a.dist - b.dist);
                    const top = candidates.slice(0,5);
                    console.debug && console.debug('SigmaAdapter: clickStage diagnostic - top candidates (closest first)', { rect, dpr, cameraState: camState, top });
                    // Visual overlay: draw click point and top candidate projections
                    try {
                      const containerEl2 = containerEl || container;
                      if (containerEl2 && containerEl2.ownerDocument) {
                        const doc = containerEl2.ownerDocument;
                        const svgNS = 'http://www.w3.org/2000/svg';
                        const overlay = doc.createElementNS(svgNS, 'svg');
                        overlay.setAttribute('class', 'sigma-diagnostic-overlay');
                        overlay.style.position = 'absolute';
                        overlay.style.left = `${rect.left}px`;
                        overlay.style.top = `${rect.top}px`;
                        overlay.style.width = `${rect.width}px`;
                        overlay.style.height = `${rect.height}px`;
                        overlay.style.pointerEvents = 'none';
                        overlay.style.zIndex = 9999;
                        // draw each variant's click point (red) and top candidates (blue)
                        const dpr3 = dpr;
                        variants.forEach(v => {
                          try {
                            // compute CSS pixel click coords for overlay
                            const clickCssX = v.type === 'css' ? v.cx : (v.cx / dpr3);
                            const clickCssY = v.type === 'css' ? v.cy : (v.cy / dpr3);
                            const circ = doc.createElementNS(svgNS, 'circle');
                            circ.setAttribute('cx', String(clickCssX)); circ.setAttribute('cy', String(clickCssY));
                            circ.setAttribute('r', '5'); circ.setAttribute('fill', 'rgba(255,0,0,0.8)'); circ.setAttribute('stroke', 'white'); overlay.appendChild(circ);
                            const lbl = doc.createElementNS(svgNS, 'text'); lbl.setAttribute('x', String(clickCssX + 8)); lbl.setAttribute('y', String(clickCssY + 4)); lbl.setAttribute('fill', 'rgba(0,0,0,0.6)'); lbl.setAttribute('font-size', '10'); lbl.textContent = v.label; overlay.appendChild(lbl);
                          } catch (e) {}
                        });
                        top.forEach(c => {
                          try {
                            // candidate px/py are canvas pixels; convert to CSS pixels
                            const pxCss = (typeof c.px === 'number') ? (c.px / dpr3) : 0;
                            const pyCss = (typeof c.py === 'number') ? (c.py / dpr3) : 0;
                            const line = doc.createElementNS(svgNS, 'line');
                            // pick a representative click point (first variant) for line start
                            const rep = variants[0];
                            const repCssX = rep.type === 'css' ? rep.cx : (rep.cx / dpr3);
                            const repCssY = rep.type === 'css' ? rep.cy : (rep.cy / dpr3);
                            line.setAttribute('x1', String(repCssX)); line.setAttribute('y1', String(repCssY));
                            line.setAttribute('x2', String(pxCss)); line.setAttribute('y2', String(pyCss));
                            line.setAttribute('stroke', 'rgba(0,0,255,0.7)'); line.setAttribute('stroke-width', '2'); overlay.appendChild(line);
                            const p = doc.createElementNS(svgNS, 'circle'); p.setAttribute('cx', String(pxCss)); p.setAttribute('cy', String(pyCss)); p.setAttribute('r', '4'); p.setAttribute('fill', 'rgba(0,0,255,0.8)'); overlay.appendChild(p);
                            const t = doc.createElementNS(svgNS, 'text'); t.setAttribute('x', String(pxCss + 6)); t.setAttribute('y', String(pyCss + 3)); t.setAttribute('fill', 'rgba(0,0,0,0.6)'); t.setAttribute('font-size', '10'); t.textContent = `${c.id} (${c.variant})`; overlay.appendChild(t);
                          } catch (e) {}
                        });
                        try { containerEl2.parentNode && containerEl2.parentNode.appendChild(overlay); setTimeout(() => { try { overlay.parentNode && overlay.parentNode.removeChild(overlay); } catch (e) {} }, 3500); } catch (e) {}
                      }
                    } catch (e) {}
                  } catch (e) {}
                }
              } catch (e) { pickedEdge = null }
            }

            // If we found an edge either via renderer helpers or fallback, toggle it
            if (pickedEdge) {
              try { console.debug && console.debug('SigmaAdapter: clickStage -> treating as edge click for', pickedEdge); } catch (e) {}
              try {
                const edgeId = pickedEdge;
                const currently = !!graph.getEdgeAttribute(edgeId, 'selected');
                const src = (typeof graph.source === 'function') ? graph.source(edgeId) : null;
                const tgt = (typeof graph.target === 'function') ? graph.target(edgeId) : null;
                const json = { data: { id: String(edgeId), source: src, target: tgt } };
                const key = SelectionManager ? SelectionManager.canonicalKey(json) : `edge:${String(edgeId)}`;
                _localSelKeys.add(key);
                if (currently) {
                  try { if (typeof graph.removeEdgeAttribute === 'function') graph.removeEdgeAttribute(edgeId, 'selected'); else graph.setEdgeAttribute(edgeId, 'selected', false); } catch (e) {}
                  try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: clickStage calling SelectionManager.unselect for edge', json); SelectionManager.unselect(json); } } catch (e) {}
                } else {
                  try { if (typeof graph.setEdgeAttribute === 'function') graph.setEdgeAttribute(edgeId, 'selected', true); else graph.setEdgeAttribute(edgeId, 'selected', true); } catch (e) {}
                  try { if (SelectionManager) { console.debug && console.debug('SigmaAdapter: clickStage calling SelectionManager.select for edge', json); SelectionManager.select(json); } } catch (e) {}
                }
                try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
                return; // handled as edge click
              } catch (e) {}
            }

            // No nearby edge detected: clear selection as before
            try {
              if (SelectionManager) { console.debug && console.debug('SigmaAdapter: clickStage no edge -> clear'); SelectionManager.clear(); }
              else graph.forEachNode(id => { if (graph.getNodeAttribute(id, 'selected')) graph.removeNodeAttribute(id, 'selected'); });
            } catch (e) {}
            try { if (renderer && typeof renderer.refresh === 'function') renderer.refresh(); } catch (e) {}
          } catch (e) {}
        });
        // Prefer native Sigma edge events over clickStage heuristics. Register
        // additional edge-related events to get direct edge callbacks when
        // the Sigma build supports them.
        try {
          try { renderer.on('enterEdge', (evt) => { try { console.debug && console.debug('SigmaAdapter: enterEdge evt:', evt); } catch (e) {} }); } catch (e) {}
          try { renderer.on('leaveEdge', (evt) => { try { console.debug && console.debug('SigmaAdapter: leaveEdge evt:', evt); } catch (e) {} }); } catch (e) {}
          try { renderer.on('downEdge', (evt) => { try { console.debug && console.debug('SigmaAdapter: downEdge evt:', evt); } catch (e) {} }); } catch (e) {}
          try { renderer.on('doubleClickEdge', (evt) => { try { console.debug && console.debug('SigmaAdapter: doubleClickEdge evt:', evt); } catch (e) {} }); } catch (e) {}
          try { renderer.on('rightClickEdge', (evt) => { try { console.debug && console.debug('SigmaAdapter: rightClickEdge evt:', evt); } catch (e) {} }); } catch (e) {}
        } catch (e) {}
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
