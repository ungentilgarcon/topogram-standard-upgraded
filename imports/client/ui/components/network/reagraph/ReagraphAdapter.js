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

    // create SVG container and size it to the container element
    container.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    container.appendChild(svg);

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
      // clear
      while (svg.firstChild) svg.removeChild(svg.firstChild);

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
        svg.appendChild(line);
      });
      // nodes
      nodeMap.forEach(node => {
        const cx = node.__renderX || 0; const cy = node.__renderY || 0;
        const r = (node.attrs && (node.attrs.size || node.attrs.weight)) ? Math.max(3, (node.attrs.size || node.attrs.weight) / 4) : 6;
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
          const handlers = adapter._events && adapter._events.select || [];
          handlers.forEach(h => { try { h.handler({ type: 'select', target: { id: node.id } }); } catch (e) {} });
        });
        svg.appendChild(circ);
      });
    }

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
      fit() {}, resize() {}, zoom() {}, center() {},
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
      select(id) { try { const n = nodeMap.get(id); if (n) { n.attrs.selected = true; render(); const handlers = adapter._events.select || []; handlers.forEach(h => h.handler({ type: 'select', target: { id } })); } } catch (e) {} },
      unselect(id) { try { const n = nodeMap.get(id); if (n) { delete n.attrs.selected; render(); const handlers = adapter._events.unselect || []; handlers.forEach(h => h.handler({ type: 'unselect', target: { id } })); } } catch (e) {} },
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

    // initial render and return adapter
    setTimeout(() => render(), 0);
    return adapter;
  }
};

export default ReagraphAdapter;
