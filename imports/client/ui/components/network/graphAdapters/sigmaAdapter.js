// Sigma + Graphology adapter
// Implements a minimal adapter surface used by the app.

import cyToGraph from './cyElementsToGraphology'

function safeRequire(name) {
  try {
    // eslint-disable-next-line global-require
    return require(name)
  } catch (err) {
    console.error(`Missing dependency ${name}. Please npm install ${name}`)
    return null
  }
}

export default {
  mount({ container, props }) {
    const Graph = safeRequire('graphology')
    const Sigma = safeRequire('sigma')
    if (!Graph || !Sigma) {
      console.warn('SigmaAdapter: graphology or sigma not available. Adapter will be a no-op.')
      return { impl: 'sigma', noop: true }
    }

  const graph = new Graph()
    const { nodes, edges } = cyToGraph(props.elements || {})

    nodes.forEach(n => {
      graph.addNode(n.id, Object.assign({}, n))
    })

    edges.forEach(e => {
      // graphology requires unique key for undirected graphs; use id
      try {
        graph.addEdgeWithKey(e.id, e.source, e.target, Object.assign({}, e))
      } catch (err) {
        // fallback: if edge already exists, ignore
      }
    })

    // layout offloading: compute positions in a simple Web Worker
    function computeLayoutWorker(nodes, edges, iterations = 300) {
      return new Promise((resolve) => {
        // create worker code as a blob
        const workerCode = `
        self.onmessage = function(e) {
          const { nodes, edges, iterations } = e.data
          // naive force-directed layout
          const N = nodes.length
          const pos = {}
          for (let i=0;i<N;i++) { pos[nodes[i].id] = { x: nodes[i].x || Math.random()*1000 - 500, y: nodes[i].y || Math.random()*1000 - 500 } }
          const k = Math.sqrt(1000*1000 / Math.max(1,N))
          for (let iter=0; iter<iterations; iter++) {
            const disp = {}
            for (let i=0;i<N;i++) { disp[nodes[i].id] = { x:0, y:0 } }
            // repulsion
            for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) {
              const a = nodes[i].id; const b = nodes[j].id
              const dx = pos[a].x - pos[b].x; const dy = pos[a].y - pos[b].y
              let dist = Math.sqrt(dx*dx + dy*dy) + 0.01
              const force = (k*k) / dist
              const ux = dx / dist; const uy = dy / dist
              disp[a].x += ux * force; disp[a].y += uy * force
              disp[b].x -= ux * force; disp[b].y -= uy * force
            }
            // attraction (edges)
            for (let ei=0; ei<edges.length; ei++) {
              const e = edges[ei]
              const s = e.source; const t = e.target
              const dx = pos[s].x - pos[t].x; const dy = pos[s].y - pos[t].y
              let dist = Math.sqrt(dx*dx + dy*dy) + 0.01
              const force = (dist*dist) / k
              const ux = dx / dist; const uy = dy / dist
              disp[s].x -= ux * force; disp[s].y -= uy * force
              disp[t].x += ux * force; disp[t].y += uy * force
            }
            // apply displacements with simple cooling
            const temp = 10 * (1 - iter / iterations)
            for (let i=0;i<N;i++) {
              const id = nodes[i].id
              let dx = disp[id].x; let dy = disp[id].y
              const len = Math.sqrt(dx*dx + dy*dy) || 1
              pos[id].x += (dx/len) * Math.min(len, temp)
              pos[id].y += (dy/len) * Math.min(len, temp)
            }
          }
          self.postMessage({ positions: pos })
        }
        `
        const blob = new Blob([workerCode], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        const w = new Worker(url)
        w.onmessage = function(ev) { resolve(ev.data.positions); w.terminate(); URL.revokeObjectURL(url) }
        w.postMessage({ nodes, edges, iterations })
      })
    }

    // compute positions then create sigma renderer
    const preLayout = nodes.filter(n => n.x == null || n.y == null)
    let renderer = null
    let positionsPromise = Promise.resolve(null)
    if (preLayout.length) {
      positionsPromise = computeLayoutWorker(nodes, edges, 200)
    }
    // apply positions when ready
    const applyPositions = (positions) => {
      if (positions) {
        Object.keys(positions).forEach(id => {
          if (graph.hasNode(id)) {
            graph.setNodeAttribute(id, 'x', positions[id].x)
            graph.setNodeAttribute(id, 'y', positions[id].y)
          }
        })
      }
    }

    // create renderer after positions applied (synchronous create handled via promise)
    const createRenderer = () => {
      renderer = new Sigma(graph, container)
      return renderer
    }

    // wait for layout then create renderer
    // positionsPromise resolves synchronously if no layout to do
    // eslint-disable-next-line promise/always-return
    positionsPromise.then((positions) => { applyPositions(positions) })
    // create renderer now; positions (if any) were applied above before this returns in most cases
    renderer = new Sigma(graph, container)

    const adapter = {
      impl: 'sigma',
      graph,
      renderer,
      container,
      props,
      noop: false,
      getInstance() { return adapter },
      on(event, selectorOrHandler, handlerMaybe) {
        // sigma uses events like 'clickNode' with handler(node, event)
        if (typeof selectorOrHandler === 'function') {
          renderer.on(event, selectorOrHandler)
        } else if (typeof handlerMaybe === 'function') {
          // selector not supported - we ignore selector and register handler
          renderer.on(event, handlerMaybe)
        }
      },
      off(event, handler) {
        renderer.off(event, handler)
      },
      fit() {
        try {
          // Sigma doesn't have fit API; compute center & zoom to fit all nodes
          // simple heuristic: center at mean coords and set zoom to 1
          renderer.getCamera().goTo({ x: 0, y: 0, ratio: 1 })
        } catch (err) { /* ignore */ }
      },
      resize() {
        try { renderer.refresh() } catch (err) {}
      },
      zoom(level) {
        try { renderer.getCamera().set({ ratio: level }) } catch (err) {}
      },
      center() {
        try { renderer.getCamera().set({ x: 0, y: 0 }) } catch (err) {}
      },
      nodes() {
        return graph.nodes().map(id => ({ id, ...graph.getNodeAttributes(id) }))
      },
      edges() {
        return graph.edges().map(id => ({ id, ...graph.getEdgeAttributes(id) }))
      },
      elements() {
        return { nodes: adapter.nodes(), edges: adapter.edges() }
      },
      add(elements) {
        const { nodes = [], edges = [] } = elements
        nodes.forEach(n => { if (!graph.hasNode(n.id)) graph.addNode(n.id, n) })
        edges.forEach(e => { if (!graph.hasEdge(e.id)) graph.addEdgeWithKey(e.id, e.source, e.target, e) })
        try { renderer.refresh() } catch (err) {}
      },
      remove(elements) {
        const { nodes = [], edges = [] } = elements
        nodes.forEach(n => { if (graph.hasNode(n.id)) graph.dropNode(n.id) })
        edges.forEach(e => { if (graph.hasEdge(e.id)) graph.dropEdge(e.id) })
        try { renderer.refresh() } catch (err) {}
      },
      select(id) {
        if (!graph.hasNode(id)) return
        graph.setNodeAttribute(id, 'selected', true)
        try { renderer.refresh() } catch (err) {}
      },
      unselect(id) {
        if (!graph.hasNode(id)) return
        graph.setNodeAttribute(id, 'selected', false)
        try { renderer.refresh() } catch (err) {}
      },
      filter(predicate) {
        // best-effort: predicate can be a function or a simple attribute match string
        if (typeof predicate === 'function') {
          return adapter.nodes().filter(n => predicate(n))
        }
        return adapter.nodes().filter(n => n.id === predicate)
      }
    }

    return adapter
  },
  unmount(adapter) {
    if (!adapter || adapter.noop) return
    try {
      adapter.renderer.kill()
    } catch (err) {}
    try { adapter.graph.clear() } catch (err) {}
  }
}
