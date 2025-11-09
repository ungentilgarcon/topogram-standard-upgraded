#!/usr/bin/env node
/*
Validate a graph JSON for orphan edges and optionally fix them interactively.
Usage:
  node scripts/validate_orphans.js <path-to-json> [--action prompt|drop|placeholder] [--orphan-prefix missing:]

- prompt: show counts and ask whether to drop or create placeholders, then write a cleaned JSON next to input (<base>.clean.json)
- drop:   non-interactive; drop orphan edges and write <base>.clean.json
- placeholder: non-interactive; add placeholder nodes for missing endpoints and write <base>.clean.json
*/
const fs = require('fs')
const path = require('path')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p,'utf8'))
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8')
}

function ensurePlaceholderNode(id, orphanPrefix) {
  let type = 'placeholder'
  let label = id
  if (id.startsWith('module:')) { type='module'; label = orphanPrefix + id.replace(/^module:/,'') }
  else if (id.startsWith('package:')) { type='package'; label = orphanPrefix + id.replace(/^package:/,'') }
  return { id, label, type }
}

async function prompt(question) {
  return await new Promise(resolve => {
    process.stdout.write(question)
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', data => resolve(String(data||'').trim().toLowerCase()))
  })
}

async function main() {
  const argv = process.argv.slice(2)
  if (!argv.length) {
    console.log('Usage: node scripts/validate_orphans.js <path-to-json> [--action prompt|drop|placeholder] [--orphan-prefix missing:]')
    process.exit(2)
  }
  const jsonPath = argv[0]
  let action = 'prompt'
  let orphanPrefix = 'missing:'
  for (let i=1;i<argv.length;i++) {
    const a = argv[i]
    if (a === '--action' && i+1<argv.length) { action = argv[++i] }
    else if (a.startsWith('--action=')) { action = a.split('=')[1] }
    else if (a === '--orphan-prefix' && i+1<argv.length) { orphanPrefix = argv[++i] }
    else if (a.startsWith('--orphan-prefix=')) { orphanPrefix = a.split('=')[1] }
  }

  const data = readJson(jsonPath)
  const nodes = Array.isArray(data.nodes) ? data.nodes.slice() : []
  let edges = Array.isArray(data.edges) ? data.edges.slice() : []
  const nodeIds = new Set(nodes.map(n=>n.id))
  const orphans = []
  for (const e of edges) {
    const sOk = nodeIds.has(e.source)
    const tOk = nodeIds.has(e.target)
    if (!sOk || !tOk) orphans.push({ e, missingSource: !sOk, missingTarget: !tOk })
  }

  console.log(`Nodes: ${nodes.length}  Edges: ${edges.length}`)
  console.log(`Orphan edges: ${orphans.length}`)

  if (!orphans.length) { console.log('No orphans found.'); return }

  if (action === 'prompt') {
    const ans = await prompt('Fix orphans? [d]rop / [p]laceholders / [k]eep (default: drop): ')
    if (ans === 'k' || ans === 'keep') { console.log('Leaving orphans unchanged.'); return }
    action = (ans === 'p' || ans === 'placeholders') ? 'placeholder' : 'drop'
  }

  if (action === 'drop') {
    const before = edges.length
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    console.log(`Dropped ${before - edges.length} orphan edges.`)
  } else if (action === 'placeholder') {
    const existing = new Set(nodeIds)
    let created = 0
    for (const { e, missingSource, missingTarget } of orphans) {
      if (missingSource && !existing.has(e.source)) { nodes.push(ensurePlaceholderNode(e.source, orphanPrefix)); existing.add(e.source); created++ }
      if (missingTarget && !existing.has(e.target)) { nodes.push(ensurePlaceholderNode(e.target, orphanPrefix)); existing.add(e.target); created++ }
    }
    console.log(`Created ${created} placeholder nodes.`)
  }

  const base = path.basename(jsonPath, path.extname(jsonPath))
  const out = path.join(path.dirname(jsonPath), `${base}.clean.json`)
  writeJson(out, { nodes, edges })
  console.log(`Wrote cleaned graph to ${out}`)
}

main().catch(err => { console.error(err); process.exit(1) })
