/* ReagraphAdapter
 * Lightweight, dependency-free adapter that renders a simple SVG graph in the
 * provided container and exposes a small Cytoscape-like API so TopogramDetail
 * can use `?graph=reagraph` without pulling the full Reagraph dependency.
 */

// Translate cy-style elements to simple node/edge arrays
let cyElementsToGraphology = null;
try {
  const mod = require('../utils/cyElementsToGraphology');
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
      if (attrs.x !== undefined && attrs.x !== null && typeof attrs.x !== 'number') {
        const px = parseFloat(attrs.x);
        if (!Number.isNaN(px)) attrs.x = px; else delete attrs.x;
      }
      if (attrs.y !== undefined && attrs.y !== null && typeof attrs.y !== 'number') {
        const py = parseFloat(attrs.y);
        if (!Number.isNaN(py)) attrs.y = py; else delete attrs.y;
      }
      nodeMap.set(n.id, { id: n.id, attrs });
    });
    const edgeMap = new Map();
    edges.forEach(e => { edgeMap.set(e.id || `${e.source}-${e.target}`, { id: e.id || `${e.source}-${e.target}`, source: e.source, target: e.target, attrs: e.attrs || {} }); });

    // SelectionManager integration (optional)
    let SelectionManager = null;
    try {
      const sm = require('/imports/client/selection/SelectionManager');
      SelectionManager = sm && (sm.default || sm);
    } catch (e) { SelectionManager = null }

    // create SVG container and size it to the container element
    container.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    container.appendChild(svg);
    // viewport group that will be transformed for pan/zoom
    const viewport = document.createElementNS(svgNS, 'g');
    svg.appendChild(viewport);

    // transform state
    let _scale = 1;
    let _tx = 0;
    let _ty = 0;
    function applyTransform() {
      try {
        viewport.setAttribute('transform', `translate(${_tx},${_ty}) scale(${_scale})`);
      } catch (e) {}
    }

    // determine container pixel size
    function measure() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(50, Math.floor(rect.width || container.clientWidth || 600));
      const h = Math.max(50, Math.floor(rect.height || container.clientHeight || 400));
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      // default viewBox maps to pixel coordinates
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      return { w, h };
    }

    // helper to render nodes/edges. It computes a render transform so nodes with
    // arbitrary coords (or none) are mapped to the visible SVG viewport.
    function render() {
      const { w, h } = measure();
  // clear only viewport children (keep svg and viewport elements intact)
  // previously we removed the entire svg contents which also removed the
  // viewport <g>. That left `viewport` detached and appended children
  // were invisible. Clear only the viewport so svg and viewport remain.
  while (viewport.firstChild) viewport.removeChild(viewport.firstChild);

      // collect numeric positions
      const posList = [];
      nodeMap.forEach(n => {
        const x = n.attrs && typeof n.attrs.x === 'number' ? n.attrs.x : null;
        const y = n.attrs && typeof n.attrs.y === 'number' ? n.attrs.y : null;
        if (x !== null && y !== null) posList.push({ id: n.id, x, y });
      });

      // If no numeric positions, assign temporary random positions inside viewport
      if (posList.length === 0) {
        nodeMap.forEach(n => {
          n.__renderX = Math.random() * (w * 0.8) + (w * 0.1);
          n.__renderY = Math.random() * (h * 0.8) + (h * 0.1);
        });
      } else {
        // compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        posList.forEach(p => { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; });
        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
          nodeMap.forEach(n => { n.__renderX = Math.random() * (w * 0.8) + (w * 0.1); n.__renderY = Math.random() * (h * 0.8) + (h * 0.1); });
        } else {
          const dx = maxX - minX || 1;
          const dy = maxY - minY || 1;
          const pad = 20; // pixels
          const scale = Math.min((w - pad*2) / dx, (h - pad*2) / dy);
          nodeMap.forEach(n => {
            const nx = (typeof n.attrs.x === 'number') ? (n.attrs.x - minX) * scale + pad : Math.random() * (w - pad*2) + pad;
            const ny = (typeof n.attrs.y === 'number') ? (n.attrs.y - minY) * scale + pad : Math.random() * (h - pad*2) + pad;
            n.__renderX = nx;
            n.__renderY = ny;
          });
        }
      }

      // edges
      edgeMap.forEach(edge => {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) return;
        const line = document.createElementNS(svgNS, 'line');
        const sx = s.__renderX || 0; const sy = s.__renderY || 0;
        const tx = t.__renderX || 0; const ty = t.__renderY || 0;
        line.setAttribute('x1', sx); line.setAttribute('y1', sy); line.setAttribute('x2', tx); line.setAttribute('y2', ty);
        line.setAttribute('stroke', (edge.attrs && edge.attrs.color) || 'rgba(31,41,55,0.6)');
        line.setAttribute('stroke-width', (edge.attrs && edge.attrs.width) || 1);
        line.dataset.id = edge.id;
        line.style.cursor = 'pointer';
        // edge click toggles selection; stop propagation to avoid background click clearing
        line.addEventListener('click', (ev) => {
          try {
            ev.stopPropagation();
            // toggle selection state locally
            try {
              const cur = edge.attrs && edge.attrs.selected;
              if (cur) { if (edge.attrs) delete edge.attrs.selected; } else { if (!edge.attrs) edge.attrs = {}; edge.attrs.selected = true; }
              // mark local origin and notify SelectionManager
              const j = { data: { id: edge.id, source: edge.source, target: edge.target } };
              const k = SelectionManager ? SelectionManager.canonicalKey(j) : `edge:${edge.id}`;
              try { _localSelKeys.add(k); } catch (e) {}
              try { if (SelectionManager) { if (cur) SelectionManager.unselect(j); else SelectionManager.select(j); } } catch (e) {}
            } catch (e) {}
            try { render(); } catch (e) {}
          } catch (e) {}
        });
        viewport.appendChild(line);
      });
      // nodes
      nodeMap.forEach(node => {
        const cx = node.__renderX || 0; const cy = node.__renderY || 0;
          // larger default radius and stronger scaling from weight/size
          const r = (node.attrs && (node.attrs.size || node.attrs.weight)) ? Math.max(4, (node.attrs.size || node.attrs.weight) / 2) : 10;
        const circ = document.createElementNS(svgNS, 'circle');
        circ.setAttribute('cx', cx); circ.setAttribute('cy', cy); circ.setAttribute('r', r);
        // dark node fill by default on light background
        circ.setAttribute('fill', (node.attrs && node.attrs.color) || '#1f2937');
        // stroke: red when selected, otherwise subtle dark outline
        circ.setAttribute('stroke', node.attrs && node.attrs.selected ? '#ef4444' : 'rgba(31,41,55,0.15)');
        circ.setAttribute('stroke-width', node.attrs && node.attrs.selected ? 2 : 0.5);
        circ.setAttribute('data-id', node.id);
        circ.style.cursor = 'pointer';
        circ.addEventListener('click', (ev) => {
          try {
            ev.stopPropagation();
            // toggle selection locally
            try {
              const cur = node.attrs && node.attrs.selected;
              if (cur) { if (node.attrs) delete node.attrs.selected; } else { if (!node.attrs) node.attrs = {}; node.attrs.selected = true; }
              const j = { data: { id: node.id } };
              const k = SelectionManager ? SelectionManager.canonicalKey(j) : `node:${node.id}`;
              try { _localSelKeys.add(k); } catch (e) {}
              try { if (SelectionManager) { if (cur) SelectionManager.unselect(j); else SelectionManager.select(j); } } catch (e) {}
            } catch (e) {}
            try { render(); } catch (e) {}
          } catch (e) {}
        });
        viewport.appendChild(circ);
        // render label if present (use _vizLabel or label fields)
        try {
          const label = (node.attrs && (node.attrs._vizLabel || node.attrs.label || node.attrs.name)) || null;
          if (label) {
            const txt = document.createElementNS(svgNS, 'text');
            txt.setAttribute('x', cx);
            // place label slightly below the node's center
            txt.setAttribute('y', cy + r + 12);
            txt.setAttribute('fill', '#0f172a');
            txt.setAttribute('font-size', '12');
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('pointer-events', 'none');
            txt.textContent = String(label);
            viewport.appendChild(txt);
          }
        } catch (e) {}
      });
      // re-apply transform after rendering
      applyTransform();
    }

    // local-origin selection keys to avoid echo loops when mirroring to SelectionManager
    const _localSelKeys = new Set();

    // background click clears selection (notify SelectionManager so other views update)
    svg.addEventListener('click', (ev) => {
      try {
        // mark currently selected elements as local before clearing to prevent echo
        try {
          nodeMap.forEach((n, id) => { if (n && n.attrs && n.attrs.selected) { const j = { data: { id } }; const k = SelectionManager ? SelectionManager.canonicalKey(j) : `node:${id}`; _localSelKeys.add(k); } });
          edgeMap.forEach((e, id) => { if (e && e.attrs && e.attrs.selected) { const j = { data: { id: e.id, source: e.source, target: e.target } }; const k = SelectionManager ? SelectionManager.canonicalKey(j) : `edge:${id}`; _localSelKeys.add(k); } });
        } catch (e) {}
        try { if (SelectionManager) SelectionManager.clear(); } catch (e) {}
        try { adapter.unselectAll(); } catch (e) {}
      } catch (e) {}
    });

    // basic event registry and adapter object
    const adapter = {
      impl: 'reagraph',
      noop: false,
      _events: {},
      _nodeMap: nodeMap,
      _edgeMap: edgeMap,
      getInstance() { return svg; },
      on(event, selectorOrHandler, handlerMaybe) {
        const handler = typeof selectorOrHandler === 'function' ? selectorOrHandler : handlerMaybe;
        if (!handler) return;
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push({ selector: typeof selectorOrHandler === 'string' ? selectorOrHandler : null, handler });
      },
      off(event, handler) { if (!this._events[event]) return; this._events[event] = this._events[event].filter(h => h.handler !== handler); },
      fit() {
        try {
          const { w, h } = measure();
          // compute bounding box of nodes
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let has = false;
          nodeMap.forEach(n => {
            const x = n.__renderX || (n.attrs && typeof n.attrs.x === 'number' ? n.attrs.x : null);
            const y = n.__renderY || (n.attrs && typeof n.attrs.y === 'number' ? n.attrs.y : null);
            if (x != null && y != null) {
              has = true;
              if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
            }
          });
          if (!has) { return; }
          const pad = 20;
          const dx = Math.max(1, maxX - minX);
          const dy = Math.max(1, maxY - minY);
          const scale = Math.min((w - pad*2) / dx, (h - pad*2) / dy);
          _scale = scale;
          // center
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          _tx = w / 2 - cx * _scale;
          _ty = h / 2 - cy * _scale;
          applyTransform();
        } catch (e) {}
      },
      resize() { try { measure(); render(); applyTransform(); } catch (e) {} },
      zoom(val) { try { if (val === undefined) return _scale; _scale = Number(val) || 1; applyTransform(); } catch (e) {} },
      animate({ zoom: targetZoom, center: centerObj, duration } = {}) {
        try {
          const startZoom = _scale;
          const startTx = _tx; const startTy = _ty;
          let endZoom = typeof targetZoom === 'number' ? targetZoom : _scale;
          let endTx = startTx; let endTy = startTy;
          if (centerObj && centerObj.eles) {
            // center on all nodes
            const { w, h } = measure();
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; let has = false;
            nodeMap.forEach(n => { const x = n.__renderX || (n.attrs && typeof n.attrs.x === 'number' ? n.attrs.x : null); const y = n.__renderY || (n.attrs && typeof n.attrs.y === 'number' ? n.attrs.y : null); if (x != null && y != null) { has = true; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; } });
            if (has) {
              const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
              endTx = w / 2 - cx * endZoom; endTy = h / 2 - cy * endZoom;
            }
          }
          const dur = typeof duration === 'number' ? duration : 240;
          const start = performance.now();
          function step(now) {
            const t = Math.min(1, (now - start) / dur);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // simple ease
            _scale = startZoom + (endZoom - startZoom) * ease;
            _tx = startTx + (endTx - startTx) * ease;
            _ty = startTy + (endTy - startTy) * ease;
            applyTransform();
            if (t < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        } catch (e) {}
      },
      center() {
        try {
          const { w, h } = measure();
          // center on all nodes
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; let has = false;
          nodeMap.forEach(n => { const x = n.__renderX || (n.attrs && typeof n.attrs.x === 'number' ? n.attrs.x : null); const y = n.__renderY || (n.attrs && typeof n.attrs.y === 'number' ? n.attrs.y : null); if (x != null && y != null) { has = true; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; } });
          if (!has) return;
          const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
          _tx = w / 2 - cx * _scale; _ty = h / 2 - cy * _scale; applyTransform();
        } catch (e) {}
      },
      nodes() {
        const ids = Array.from(nodeMap.keys());
        return {
          length: ids.length,
          forEach: fn => ids.forEach(id => fn(makeNodeWrapper(id))),
          map: fn => ids.map(id => fn(makeNodeWrapper(id))),
          filter: predicate => {
            if (typeof predicate === 'function') return ids.filter(i => predicate(makeNodeWrapper(i))).map(i => makeNodeWrapper(i));
            if (typeof predicate === 'string' && predicate.startsWith('.')) {
              const cls = predicate.slice(1);
              return ids.filter(i => { const n = nodeMap.get(i); if (!n) return false; if (cls === 'selected') return !!n.attrs.selected; return false; }).map(i => makeNodeWrapper(i));
            }
            return [];
          }
        };
      },
      edges() {
        const ids = Array.from(edgeMap.keys());
        return {
          length: ids.length,
          forEach: fn => ids.forEach(id => fn(makeEdgeWrapper(id))),
          map: fn => ids.map(id => fn(makeEdgeWrapper(id))),
          filter: predicate => {
            if (typeof predicate === 'function') return ids.filter(i => predicate(makeEdgeWrapper(i))).map(i => makeEdgeWrapper(i));
            return [];
          }
        };
      },
      elements() { return { nodes: this.nodes(), edges: this.edges() }; },
      // selector helper similar to Cytoscape's $ - supports ':selected', node[id='..'], edge[id='..'] and source/target
      $: function(selector) {
        const nodes = [];
        const edges = [];
        if (!selector) return { toArray: () => [], forEach() {}, map() { return []; }, filter() { return []; }, length: 0 };
        if (selector === ':selected') {
          nodeMap.forEach((n, id) => { if (n.attrs && n.attrs.selected) nodes.push(makeNodeWrapper(id)); });
          edgeMap.forEach((e, id) => { if (e.attrs && e.attrs.selected) edges.push(makeEdgeWrapper(id)); });
        } else if (selector.startsWith('node')) {
          const m = selector.match(/id\s*=\s*['"]?([^'\"]+)['"]?/);
          if (m) { const id = m[1]; if (nodeMap.has(id)) nodes.push(makeNodeWrapper(id)); }
        } else if (selector.startsWith('edge')) {
          const m = selector.match(/id\s*=\s*['"]?([^'\"]+)['"]?/);
          if (m) { const id = m[1]; if (edgeMap.has(id)) edges.push(makeEdgeWrapper(id)); }
          else {
            const ms = selector.match(/source\s*=\s*['"]?([^'"\]]+)['"]?[\s\S]*target\s*=\s*['"]?([^'"\]]+)['"]?/);
            if (ms) {
              const s = ms[1], t = ms[2]; edgeMap.forEach((e, id) => { if (String(e.source) === String(s) && String(e.target) === String(t)) edges.push(makeEdgeWrapper(id)); });
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
  select(id) { try { const n = nodeMap.get(id); if (n) { n.attrs.selected = true; render(); const handlers = adapter._events.select || []; handlers.forEach(h => h.handler({ type: 'select', target: { id } })); return; } const e = edgeMap.get(id); if (e) { e.attrs.selected = true; render(); const handlers = adapter._events.select || []; handlers.forEach(h => h.handler({ type: 'select', target: { id } })); } } catch (e) {} },
  unselect(id) { try { const n = nodeMap.get(id); if (n) { if (n.attrs) delete n.attrs.selected; render(); const handlers = adapter._events.unselect || []; handlers.forEach(h => h.handler({ type: 'unselect', target: { id } })); return; } const ed = edgeMap.get(id); if (ed) { if (ed.attrs) delete ed.attrs.selected; render(); const handlers = adapter._events.unselect || []; handlers.forEach(h => h.handler({ type: 'unselect', target: { id } })); } } catch (e) {} },
  unselectAll() { try { const ids = Array.from(nodeMap.keys()); ids.forEach(id => { const n = nodeMap.get(id); if (n && n.attrs && n.attrs.selected) { delete n.attrs.selected; const handlers = adapter._events.unselect || []; handlers.forEach(h => { try { h.handler({ type: 'unselect', target: { id } }); } catch (e) {} }); } }); const eids = Array.from(edgeMap.keys()); eids.forEach(id => { const ed = edgeMap.get(id); if (ed && ed.attrs && ed.attrs.selected) { delete ed.attrs.selected; const handlers = adapter._events.unselect || []; handlers.forEach(h => { try { h.handler({ type: 'unselect', target: { id } }); } catch (e) {} }); } }); render(); } catch (e) {} },
      add(elementsToAdd) {
        const { nodes: n, edges: e } = cyElementsToGraphology(elementsToAdd || []);
        n.forEach(n1 => { const attrs = n1.attrs || {}; nodeMap.set(n1.id, { id: n1.id, attrs }); });
        e.forEach(e1 => { edgeMap.set(e1.id || `${e1.source}-${e1.target}`, { id: e1.id || `${e1.source}-${e1.target}`, source: e1.source, target: e1.target, attrs: e1.attrs || {} }); });
        render();
      },
      remove(elementsToRemove) {
        (elementsToRemove || []).forEach(el => { try { const id = el && el.data && el.data.id; if (id && nodeMap.has(id)) nodeMap.delete(id); } catch (e) {} });
        render();
      },
      filter(fn) { try { return Array.from(nodeMap.values()).filter(n => fn({ json: () => ({ data: n.attrs }) })); } catch (e) { return []; } },
      destroy() { try { container.removeChild(svg); } catch (e) {} }
    };

    function makeNodeWrapper(id) {
      return {
        id: () => id,
        data: () => ({ ... (nodeMap.get(id) && nodeMap.get(id).attrs) }),
        json: () => ({ data: { ... (nodeMap.get(id) && nodeMap.get(id).attrs) } }),
        isNode: () => true,
        hasClass: (cls) => { if (cls === 'selected') return !!(nodeMap.get(id) && nodeMap.get(id).attrs.selected); return false; },
        addClass: (cls) => { if (cls === 'selected') { const n = nodeMap.get(id); if (n) { n.attrs.selected = true; render(); } } },
        removeClass: (cls) => { if (cls === 'selected') { const n = nodeMap.get(id); if (n) { delete n.attrs.selected; render(); } } },
        select: () => adapter.select(id),
        unselect: () => adapter.unselect(id)
      };
    }

    function makeEdgeWrapper(id) {
      return {
        id: () => id,
        data: () => ({ ...(edgeMap.get(id) && edgeMap.get(id).attrs) }),
        json: () => ({ data: { ...(edgeMap.get(id) && edgeMap.get(id).attrs) } }),
        isNode: () => false,
        source: () => ({ id: () => (edgeMap.get(id) && edgeMap.get(id).source) }),
        target: () => ({ id: () => (edgeMap.get(id) && edgeMap.get(id).target) }),
        hasClass: () => false,
        addClass: () => {}, removeClass: () => {}
      };
    }

    // simple layout runner using same worker code pattern as SigmaAdapter
    adapter.layout = (layoutObj) => {
      let callbacks = [];
      return {
        run: () => {
          if (!layoutObj || layoutObj.name === 'preset') { setTimeout(() => callbacks.forEach(cb => cb()), 0); return; }
          const nodeList = Array.from(nodeMap.keys()).map(id => ({ id, x: nodeMap.get(id).attrs.x || null, y: nodeMap.get(id).attrs.y || null }));
          const edgeList = Array.from(edgeMap.keys()).map(id => ({ id, source: edgeMap.get(id).source, target: edgeMap.get(id).target }));
          const iterations = (layoutObj && layoutObj.maxSimulationTime) ? Math.max(100, Math.floor(layoutObj.maxSimulationTime / 5)) : 200;
          const workerCode = `self.onmessage = function(e) { const {nodes, edges, iterations} = e.data; const N = nodes.length; const pos = {}; for (let i=0;i<N;i++) pos[nodes[i].id] = { x: nodes[i].x != null ? nodes[i].x : (Math.random()*1000-500), y: nodes[i].y != null ? nodes[i].y : (Math.random()*1000-500) }; const k = Math.sqrt(1000*1000/Math.max(1,N)); for (let iter=0; iter<iterations; iter++) { const disp = {}; for (let i=0;i<N;i++) disp[nodes[i].id]={x:0,y:0}; for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) { const a=nodes[i].id,b=nodes[j].id; const dx=pos[a].x-pos[b].x, dy=pos[a].y-pos[b].y; let dist=Math.sqrt(dx*dx+dy*dy)+0.01; const force=(k*k)/dist; const ux=dx/dist, uy=dy/dist; disp[a].x+=ux*force; disp[a].y+=uy*force; disp[b].x-=ux*force; disp[b].y-=uy*force; } for (let ei=0; ei<edges.length; ei++){ const e=edges[ei]; const s=e.source,t=e.target; const dx=pos[s].x-pos[t].x, dy=pos[s].y-pos[t].y; let dist=Math.sqrt(dx*dx+dy*dy)+0.01; const force=(dist*dist)/k; const ux=dx/dist, uy=dy/dist; disp[s].x-=ux*force; disp[s].y-=uy*force; disp[t].x+=ux*force; disp[t].y+=uy*force; } const temp=10*(1-iter/iterations); for (let i=0;i<N;i++){ const id=nodes[i].id; const dx=disp[id].x, dy=disp[id].y; const len=Math.sqrt(dx*dx+dy*dy)||1; pos[id].x+=(dx/len)*Math.min(len,temp); pos[id].y+=(dy/len)*Math.min(len,temp); } } self.postMessage({positions:pos}); }`;
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          const w = new Worker(url);
          w.onmessage = function(ev) {
            const positions = ev.data.positions;
            Object.keys(positions).forEach(id => { try { if (nodeMap.has(id)) { nodeMap.get(id).attrs.x = positions[id].x; nodeMap.get(id).attrs.y = positions[id].y; } } catch (e) {} });
            try { render(); } catch (e) {}
            callbacks.forEach(cb => { try { cb(); } catch (e) {} });
            w.terminate(); URL.revokeObjectURL(url);
          };
          w.postMessage({ nodes: nodeList, edges: edgeList, iterations });
        },
        on: (evt, cb) => { if (evt === 'layoutstop' && typeof cb === 'function') callbacks.push(cb); }
      };
    };

    // wire SelectionManager subscriptions so selection changes elsewhere update this view
    try {
      if (SelectionManager && typeof SelectionManager.on === 'function') {
        // when an element is selected elsewhere, apply visual selection here
        SelectionManager.on('select', ({ element } = {}) => {
          try {
            if (!element || !element.data) return;
            const data = element.data;
            const key = SelectionManager.canonicalKey(element);
            if (_localSelKeys && _localSelKeys.has(key)) { try { _localSelKeys.delete(key); } catch (e) {} return; }
            // node selection
            if (data.id != null && nodeMap.has(String(data.id))) {
              const n = nodeMap.get(String(data.id)); if (n) { if (!n.attrs) n.attrs = {}; n.attrs.selected = true; }
            } else if (data.source != null && data.target != null) {
              // edge selection — find by compound id or matching source/target
              const eid = String(data.id || `${data.source}-${data.target}`);
              if (edgeMap.has(eid)) { const e = edgeMap.get(eid); if (e) { if (!e.attrs) e.attrs = {}; e.attrs.selected = true; } }
              else {
                edgeMap.forEach((e, id) => { if (String(e.source) === String(data.source) && String(e.target) === String(data.target)) { if (!e.attrs) e.attrs = {}; e.attrs.selected = true; } });
              }
            }
            try { render(); } catch (e) {}
          } catch (e) {}
        });
        SelectionManager.on('unselect', ({ element } = {}) => {
          try {
            if (!element || !element.data) return;
            const data = element.data;
            const key = SelectionManager.canonicalKey(element);
            if (_localSelKeys && _localSelKeys.has(key)) { try { _localSelKeys.delete(key); } catch (e) {} return; }
            if (data.id != null && nodeMap.has(String(data.id))) {
              const n = nodeMap.get(String(data.id)); if (n && n.attrs) { delete n.attrs.selected; }
            } else if (data.source != null && data.target != null) {
              const eid = String(data.id || `${data.source}-${data.target}`);
              if (edgeMap.has(eid)) { const e = edgeMap.get(eid); if (e && e.attrs) delete e.attrs.selected; }
              else { edgeMap.forEach((e, id) => { if (String(e.source) === String(data.source) && String(e.target) === String(data.target)) { if (e && e.attrs) delete e.attrs.selected; } }); }
            }
            try { render(); } catch (e) {}
          } catch (e) {}
        });
        SelectionManager.on('clear', () => {
          try {
            // if local-origin keys exist, clear them (they were used to avoid echoes)
            try { _localSelKeys.clear(); } catch (e) {}
            nodeMap.forEach(n => { if (n && n.attrs && n.attrs.selected) delete n.attrs.selected; });
            edgeMap.forEach(e => { if (e && e.attrs && e.attrs.selected) delete e.attrs.selected; });
            try { render(); } catch (e) {}
          } catch (e) {}
        });
      }
    } catch (e) {}

    // initial render and return adapter
    setTimeout(() => render(), 0);
    return adapter;
  }
};

export default ReagraphAdapter;
