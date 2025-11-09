#!/usr/bin/env node
// remap_graph_uids.js
// Post-process a Topogram-style graph JSON to replace node and edge ids by short uids
// Usage: node scripts/remap_graph_uids.js <graph.json> [--out-suffix .uided]

const fs = require('fs')
const path = require('path')

function printUsage() {
  console.log('Usage: node scripts/remap_graph_uids.js <graph.json> [--out-suffix <suffix>]')
}

function parseArgs(argv) {
  const args = { outSuffix: '.uided' }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
    if (a.startsWith('--')) {
      if (a === '--out-suffix' && i + 1 < argv.length) { args.outSuffix = argv[++i] }
      else if (a.startsWith('--out-suffix=')) { args.outSuffix = a.split('=')[1] }
    } else positional.push(a)
  }
  args.input = positional[0]
  return args
}

function toCsv(graph) {
  const header = [
    'id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','extra'
  ]
  const rows = []
  const outgoing = new Map()
  for (const n of graph.nodes) outgoing.set(n.id, 0)
  for (const e of graph.edges) { if (outgoing.has(e.source)) outgoing.set(e.source, outgoing.get(e.source)+1) }
  for (const n of graph.nodes) {
    const count = outgoing.get(n.id) || 0
    const color = n.type==='module' ? '#1f77b4' : (n.type==='function' ? '#2ca02c' : '#7f7f7f')
    const extra = JSON.stringify(n)
    rows.push({ id:n.id, name:n.label||'', label:n.type==='function'?`${n.label||''}()`:(n.label||''), description:n.type||'', color, fillColor:color, weight:count, rawWeight:count, lat:'', lng:'', start:'', end:'', time:'', date:'', source:'', target:'', edgeLabel:'', edgeColor:'', edgeWeight:'', relationship:'', enlightement:'', emoji:'', extra })
  }
  const relMap = { 'function-call':'calls','function-call-external':'calls','module-import':'imports','package-import':'imports','module-has-function':'contains','module-import-transitive':'imports' }
  for (const e of graph.edges) {
    rows.push({ id:e.id||`${e.source}->${e.target}`, name:'', label:'', description:'', color:'', fillColor:'', weight:'', rawWeight:'', lat:'', lng:'', start:'', end:'', time:'', date:'', source:e.source, target:e.target, edgeLabel:'', edgeColor:'', edgeWeight: Number.isFinite(e.pathLength)? e.pathLength : (Number.isFinite(e.edgeWeight)?e.edgeWeight:''), relationship: relMap[e.type] || e.type || '', enlightement:'', emoji:'', extra: JSON.stringify(e) })
  }
  function cell(v) {
    if (v == null) return ''
    const s = String(v)
    if (s === 'NaN' || s === 'Infinity' || s === '-Infinity' || s === 'undefined') return ''
    return s
  }
  const lines = []
  lines.push(header.join(','))
  for (const r of rows) lines.push(header.map(k=>cell(r[k])).join(','))
  return lines.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.input) { printUsage(); process.exit(2) }
  if (!fs.existsSync(args.input)) { console.error('Input not found:', args.input); process.exit(2) }
  const raw = JSON.parse(fs.readFileSync(args.input, 'utf8'))
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.slice() : []
  const edges = Array.isArray(raw.edges) ? raw.edges.slice() : []

  // Build id map
  const idMap = new Map()
  let nid = 0
  for (const n of nodes) {
    nid += 1
    idMap.set(n.id, `n${nid}`)
  }

  // Remap nodes
  const newNodes = nodes.map(n => ({ ...n, origId: n.id, id: idMap.get(n.id) }))

  // Remap edges
  let eid = 0
  const newEdges = edges.map(e => {
    eid += 1
    return { ...e, origId: e.id || `${e.source}->${e.target}`, id: `e${eid}`, source: idMap.get(e.source) || e.source, target: idMap.get(e.target) || e.target }
  })

  const outBase = path.basename(args.input, path.extname(args.input)) + (args.outSuffix || '.uided')
  const outJson = path.join(path.dirname(args.input), `${outBase}.json`)
  fs.writeFileSync(outJson, JSON.stringify({ nodes: newNodes, edges: newEdges }, null, 2), 'utf8')
  const outCsv = path.join(path.dirname(args.input), `${outBase}.csv`)
  fs.writeFileSync(outCsv, toCsv({ nodes: newNodes, edges: newEdges }), 'utf8')
  console.log('Wrote remapped graph:', outJson)
  console.log('Wrote CSV:', outCsv)
}

if (require.main === module) main()
