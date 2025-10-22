/*
  Reagraph adapter for exported mapappbuilder apps
  - Provides mount(opts) -> adapter with Cytoscape-like imperative API used by the exported presentation
  - Renders a lightweight SVG graph inside the provided container
  - If global `window.reagraph` and `window.graphology` exist, it will build an internal graphology graph
    and prefer it for queries; otherwise it uses an internal model.
  Usage: Map app can call MapAppAdapters.reagraph.mount({container, elements, layout, stylesheet})
*/
(function(global){
  if (!global.MapAppAdapters) global.MapAppAdapters = {};

  function defaultConverter(elements){
    // convert simple cytoscape-style elements into {nodes:[], edges:[]}
    const nodes = [];
    const edges = [];
    (elements || []).forEach(el => {
      try {
        if (el.data && (el.data.source != null || el.data.target != null)) {
          edges.push({ id: el.data && el.data.id ? String(el.data.id) : `${String(el.data.source)}-${String(el.data.target)}`, source: String(el.data.source), target: String(el.data.target), attrs: Object.assign({}, el.data) });
        } else {
          const id = el.data && el.data.id ? String(el.data.id) : (el._id ? String(el._id) : null);
          nodes.push({ id, attrs: Object.assign({}, el.data || {}) });
        }
      } catch (e) {}
    });
    return { nodes, edges };
  }

  function makeReagraphAdapter() {
    return {
      async mount(opts){
        const container = opts && opts.container ? opts.container : null;
        const elements = opts && opts.elements ? opts.elements : [];
        if (!container) return { impl: 'reagraph', noop: true };

        // internal maps
        const nodeMap = new Map();
        const edgeMap = new Map();

        // attempt to use global graphology if present (bundled UMD or page-provided)
        const graphology = (global && global.graphology) ? global.graphology : null;
        let graph = null;
        if (graphology && typeof graphology.Graph !== 'undefined') {
          try {
            graph = new graphology.Graph();
          } catch (e) { graph = null }
        }

        // detect reagraph presence for logging
        if (global && global.reagraph) {
          try { console.info('reagraph adapter: detected global reagraph', global.reagraphVersion || 'unknown'); } catch(e){}
        } else {
          try { console.info('reagraph adapter: no global reagraph present, using internal renderer'); } catch(e){}
        }

        // convert elements
        const conv = (global && global.MapAppConverter && typeof global.MapAppConverter.cyElementsToGraphology === 'function') ? global.MapAppConverter.cyElementsToGraphology : defaultConverter;
        const { nodes = [], edges = [] } = conv(elements || []);

        nodes.forEach(n => { try { nodeMap.set(String(n.id), { id: String(n.id), attrs: Object.assign({}, n.attrs || {}) }); if (graph) try { graph.addNode(String(n.id), Object.assign({}, n.attrs || {})); } catch(e){} } catch(e){} });
        edges.forEach(e => { try { const id = e.id || `${e.source}-${e.target}`; edgeMap.set(String(id), { id: String(id), source: String(e.source), target: String(e.target), attrs: Object.assign({}, e.attrs || {}) }); if (graph) try { graph.addEdgeWithKey(String(id), String(e.source), String(e.target), Object.assign({}, e.attrs || {})); } catch(e){} } catch(e){} });

        // create svg viewport
        const svgNS = 'http://www.w3.org/2000/svg';
        container.innerHTML = '';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width','100%'); svg.setAttribute('height','100%'); svg.style.display='block';
        const viewport = document.createElementNS(svgNS, 'g'); svg.appendChild(viewport);
        container.appendChild(svg);

        // render function (simple)
        function measure(){ const r = container.getBoundingClientRect(); return { w: Math.max(50, Math.floor(r.width||600)), h: Math.max(50, Math.floor(r.height||400)) }; }
        function render(){
          const { w, h } = measure();
          while (viewport.firstChild) viewport.removeChild(viewport.firstChild);
          // simple layout: if nodes have x,y attrs use them else distribute
          const pos = {};
          let i=0; nodeMap.forEach((n,id)=>{ const a=n.attrs||{}; if (typeof a.x==='number' && typeof a.y==='number') pos[id]={x:a.x,y:a.y}; else { pos[id]={x:20+ (i%10)*(Math.max(20, Math.floor(w/10))), y:20+Math.floor(i/10)*Math.max(20, Math.floor(h/10))}; i++; } });
          // draw edges
          edgeMap.forEach((e,id)=>{
            try{
              const s = pos[String(e.source)] || {x:0,y:0}; const t = pos[String(e.target)] || {x:0,y:0};
              const line = document.createElementNS(svgNS,'line'); line.setAttribute('x1',s.x); line.setAttribute('y1',s.y); line.setAttribute('x2',t.x); line.setAttribute('y2',t.y); line.setAttribute('stroke','#bbb'); line.setAttribute('stroke-width','1.2'); viewport.appendChild(line);
            }catch(e){}
          });
          // draw nodes
          nodeMap.forEach((n,id)=>{
            try{
              const p = pos[id] || {x:0,y:0}; const r0 = Math.max(6, Math.min(36, (n.attrs && n.attrs.size) ? n.attrs.size : 12));
              const c = document.createElementNS(svgNS,'circle'); c.setAttribute('cx',p.x); c.setAttribute('cy',p.y); c.setAttribute('r',r0); c.setAttribute('fill', (n.attrs && n.attrs.color) ? n.attrs.color : '#1976D2'); c.setAttribute('stroke','#fff'); c.setAttribute('stroke-width','1'); c.dataset.id = id; viewport.appendChild(c);
              // label
              const t = document.createElementNS(svgNS,'text'); t.setAttribute('x',p.x); t.setAttribute('y',p.y+Math.round(r0/2)+10); t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','10'); t.setAttribute('fill','#222'); t.textContent = (n.attrs && (n.attrs._vizLabel || n.attrs.label)) || id; viewport.appendChild(t);
            }catch(e){}
          });
        }

        // selection / events
        function selectId(id){ try { if (nodeMap.has(String(id))) { const n=nodeMap.get(String(id)); n.attrs.selected=true; render(); } else if (edgeMap.has(String(id))) { const e=edgeMap.get(String(id)); e.attrs.selected=true; render(); } } catch(e){} }
        function unselectId(id){ try { if (nodeMap.has(String(id))) { const n=nodeMap.get(String(id)); delete n.attrs.selected; render(); } else if (edgeMap.has(String(id))) { const e=edgeMap.get(String(id)); delete e.attrs.selected; render(); } } catch(e){} }

        // build adapter
        const adapter = {
          impl: 'reagraph',
          container,
          _graph: graph,
          getInstance(){ return svg; },
          nodes(){ const ids = Array.from(nodeMap.keys()); return {
            length: ids.length,
            forEach: fn => ids.forEach(id => fn(makeNodeWrapper(id))),
            map: fn => ids.map(id => fn(makeNodeWrapper(id))),
            filter: pred => { if (typeof pred==='function') return ids.filter(id=>pred(makeNodeWrapper(id))).map(id=>makeNodeWrapper(id)); if (typeof pred==='string' && pred.startsWith('.')){ const cls=pred.slice(1); return ids.filter(id=>{const n=nodeMap.get(id); if(!n) return false; if(cls==='selected') return !!n.attrs && !!n.attrs.selected; return false}).map(id=>makeNodeWrapper(id)); } return []; }
          }},
          edges(){ const ids = Array.from(edgeMap.keys()); return {
            length: ids.length,
            forEach: fn => ids.forEach(id => fn(makeEdgeWrapper(id))),
            map: fn => ids.map(id => fn(makeEdgeWrapper(id))),
            filter: pred => { if (typeof pred==='function') return ids.filter(id=>pred(makeEdgeWrapper(id))).map(id=>makeEdgeWrapper(id)); return []; }
          }},
          elements(){ const arr=[]; nodeMap.forEach((n,id)=>arr.push(makeNodeWrapper(id))); edgeMap.forEach((e,id)=>arr.push(makeEdgeWrapper(id))); return { length: arr.length, toArray: ()=>arr, forEach: fn=>arr.forEach(fn), map: fn=>arr.map(fn), filter: pred=>arr.filter(pred), select: ()=>arr.forEach(w=>{try{ if(w && typeof w.select==='function') w.select(); }catch(e){} }), unselect: ()=>arr.forEach(w=>{try{ if(w && typeof w.unselect==='function') w.unselect(); }catch(e){} }), data(k,v){ if(typeof k==='undefined') return arr.map(w=> (w.json && w.json().data) || (w.data && (typeof w.data==='function'?w.data():w.data))); if(k==='selected'){ if(v) return this.select(); return this.unselect(); } arr.forEach(w=>{ try{ const j=(w.json&&w.json()) || (w.data&& (typeof w.data==='function'?w.data():w.data)); if(j && j.data && typeof j.data.id!=='undefined'){ const id=j.data.id; if(nodeMap.has(id)){ const n=nodeMap.get(id); n.attrs = n.attrs || {}; n.attrs[k]=v; } else if(edgeMap.has(id)){ const e=edgeMap.get(id); e.attrs = e.attrs || {}; e.attrs[k]=v; } } }catch(e){} }); render(); } };
          },
          filter(selector){ try { if(!selector) return { toArray:()=>[], forEach(){}, map(){return[]}, filter(){return[]}, length:0}; if(typeof selector==='string'){ // id selector node[id='X']
              const m = selector.match(/(?:node|edge)?\s*\[\s*id\s*=\s*['"]([^'"]+)['"]\s*\]/);
              if(m){ const id=m[1]; const arr=[]; if(nodeMap.has(id)) arr.push(makeNodeWrapper(id)); if(edgeMap.has(id)) arr.push(makeEdgeWrapper(id)); return { length: arr.length, toArray: ()=>arr, forEach: fn=>arr.forEach(fn), map: fn=>arr.map(fn), filter: pred=>arr.filter(pred), select: ()=>arr.forEach(w=>{try{ if(w && w.select) w.select(); }catch(e){} }), unselect: ()=>arr.forEach(w=>{try{ if(w && w.unselect) w.unselect(); }catch(e){} }), data(k,v){ if(typeof k==='undefined') return arr.map(w=> (w.json&&w.json().data) || (w.data && (typeof w.data==='function'?w.data():w.data))); if(k==='selected'){ if(v) return this.select(); return this.unselect(); } arr.forEach(w=>{ try{ const j = w.json && w.json(); if(j && j.data && typeof j.data.id!=='undefined'){ const iid = j.data.id; if(nodeMap.has(iid)){ nodeMap.get(iid).attrs = nodeMap.get(iid).attrs || {}; nodeMap.get(iid).attrs[k]=v; } else if(edgeMap.has(iid)){ edgeMap.get(iid).attrs = edgeMap.get(iid).attrs || {}; edgeMap.get(iid).attrs[k]=v; } } }catch(e){} }); render(); } };
              }
            }
            // function predicate fallback
            if(typeof selector==='function'){ const out=[]; nodeMap.forEach((n,id)=>{ try{ const w = makeNodeWrapper(id); if(selector(w)) out.push(w);}catch(e){} }); edgeMap.forEach((e,id)=>{ try{ const w=makeEdgeWrapper(id); if(selector(w)) out.push(w);}catch(e){} }); return { length: out.length, toArray:()=>out, forEach:fn=>out.forEach(fn), map:fn=>out.map(fn), filter:pred=>out.filter(pred) } }
            return { toArray:()=>[], forEach(){}, map(){return[]}, filter(){return[]}, length:0 };
          } catch(e) { return { toArray:()=>[], forEach(){}, map(){return[]}, filter(){return[]}, length:0 }; }
          },
          add(els){ try{ const conv2 = conv(els||[]); (conv2.nodes||[]).forEach(n=>{ nodeMap.set(String(n.id), { id:String(n.id), attrs:Object.assign({}, n.attrs||{}) }); if(graph) try{ graph.addNode(String(n.id), Object.assign({}, n.attrs||{})); }catch(e){} }); (conv2.edges||[]).forEach(e=>{ const id=e.id||`${e.source}-${e.target}`; edgeMap.set(String(id), { id:String(id), source:String(e.source), target:String(e.target), attrs:Object.assign({}, e.attrs||{}) }); if(graph) try{ graph.addEdgeWithKey(String(id), String(e.source), String(e.target), Object.assign({}, e.attrs||{})); }catch(e){} }); render(); }catch(e){} },
          remove(els){ try{ (els||[]).forEach(el=>{ try{ const id = el && el.data && el.data.id; if(id && nodeMap.has(String(id))) nodeMap.delete(String(id)); if(id && edgeMap.has(String(id))) edgeMap.delete(String(id)); if(graph){ try{ if(graph.hasNode && graph.hasNode(String(id))){ graph.dropNode && graph.dropNode(String(id)); } if(graph.hasEdge && graph.hasEdge(String(id))){ graph.dropEdge && graph.dropEdge(String(id)); } }catch(e){} } }catch(e){} }); render(); }catch(e){} },
          select(id){ selectId(id); },
          unselect(id){ unselectId(id); },
          unselectAll(){ try{ nodeMap.forEach(n=>{ if(n.attrs && n.attrs.selected) delete n.attrs.selected }); edgeMap.forEach(e=>{ if(e.attrs && e.attrs.selected) delete e.attrs.selected }); render(); }catch(e){} },
          fit(){ try{ render(); }catch(e){} },
          resize(){ try{ render(); }catch(e){} },
          zoom(v){ /* no-op for simple renderer */ },
          center(){ /* no-op */ },
          destroy(){ try{ container.removeChild(svg); }catch(e){} }
        };

        function makeNodeWrapper(id){ return {
          id: ()=>id,
          data: (k)=>{ const obj = Object.assign({}, nodeMap.get(id) && nodeMap.get(id).attrs); if(typeof k==='undefined') return obj; return obj ? obj[k] : undefined },
          json: ()=>({ data: Object.assign({}, nodeMap.get(id) && nodeMap.get(id).attrs) }),
          isNode: ()=>true,
          select: ()=> selectId(id),
          unselect: ()=> unselectId(id),
          addClass: (cls)=>{ try{ if(cls==='selected'){ selectId(id) } }catch(e){} },
          removeClass: (cls)=>{ try{ if(cls==='selected'){ unselectId(id) } }catch(e){} }
        } }

        function makeEdgeWrapper(id){ return {
          id: ()=>id,
          data: (k)=>{ const obj = Object.assign({}, edgeMap.get(id) && edgeMap.get(id).attrs); if(typeof k==='undefined') return obj; return obj ? obj[k] : undefined },
          json: ()=>({ data: Object.assign({}, edgeMap.get(id) && edgeMap.get(id).attrs) }),
          isNode: ()=>false,
          select: ()=> selectId(id),
          unselect: ()=> unselectId(id),
          addClass: (cls)=>{ try{ if(cls==='selected'){ selectId(id) } }catch(e){} },
          removeClass: (cls)=>{ try{ if(cls==='selected'){ unselectId(id) } }catch(e){} }
        } }

        // initial render
        setTimeout(()=>render(),0);
        return adapter;
      }
    };
  }

  global.MapAppAdapters.reagraph = makeReagraphAdapter();
  // also expose under simple name for templates
  global.ReagraphAdapter = global.MapAppAdapters.reagraph;
})(typeof window !== 'undefined' ? window : this);
