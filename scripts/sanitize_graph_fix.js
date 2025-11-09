#!/usr/bin/env node
/*
 * scripts/sanitize_graph_fix.js
 *
 * Extended sanitizer that can optionally try to recover missing/NaN positions
 * and prints debug output. This is a non-destructive alternative to
 * overwriting the existing sanitize_graph.js. Use it like:
 *
 *   node scripts/sanitize_graph_fix.js <graph.json> [--mode drop|placeholder] [--orphan-prefix missing:] [--fix-positions] [--debug]
 *
 */
const fs = require('fs');
const path = require('path');

const HEADER = [
  'id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','extra'
];

function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function parseArgs(argv) {
  const args = { mode: 'drop', orphanPrefix: 'missing:', fixPositions: false, debug: false };
  const positional = [];
  for (let i=0;i<argv.length;i+=1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (a === '--mode' && i+1<argv.length) { args.mode = String(argv[++i]).toLowerCase(); }
      else if (a.startsWith('--mode=')) { args.mode = a.split('=')[1].toLowerCase(); }
      else if (a === '--orphan-prefix' && i+1<argv.length) { args.orphanPrefix = String(argv[++i]); }
      else if (a.startsWith('--orphan-prefix=')) { args.orphanPrefix = a.split('=')[1]; }
      else if (a === '--fix-positions') { args.fixPositions = true; }
      else if (a === '--debug') { args.debug = true; }
      else if (a === '--help' || a === '-h') { args.help = true; }
    } else { positional.push(a); }
  }
  if (args.mode !== 'drop' && args.mode !== 'placeholder') args.mode = 'drop';
  args.input = positional[0];
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/sanitize_graph_fix.js <graph.json> [--mode drop|placeholder] [--orphan-prefix missing:] [--fix-positions] [--debug]\n\n` +
  `Modes:\n  drop        Remove edges referencing missing nodes (default)\n  placeholder Create synthetic nodes for missing endpoints using prefix\n`);
}

function safeNumber(v, d=0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function ensurePlaceholderNode(id, orphanPrefix) {
  let type = 'placeholder';
  let label = id;
  if (id.startsWith('module:')) { type='module'; label = orphanPrefix + id.replace(/^module:/,''); }
  else if (id.startsWith('package:')) { type='package'; label = orphanPrefix + id.replace(/^package:/,''); }
  return { id, label, type };
}

function sanitizePosition(container, key, counters) {
  if (!isObject(container) || !Object.prototype.hasOwnProperty.call(container, key)) return;
  const pos = container[key];
  if (!isObject(pos)) {
    container[key] = { x: 0, y: 0 };
    counters.positionsFixed += 1;
    return;
  }
  const xRaw = pos.x;
  const yRaw = pos.y;
  const x = safeNumber(xRaw, 0);
  const y = safeNumber(yRaw, 0);
  if (!Number.isFinite(xRaw)) counters.positionsFixed += 1;
  if (!Number.isFinite(yRaw)) counters.positionsFixed += 1;
  container[key] = { x, y };
}

function sanitizeNumericField(obj, key, fallback, counters) {
  if (!isObject(obj) || !Object.prototype.hasOwnProperty.call(obj, key)) return;
  const val = obj[key];
  const num = Number(val);
  if (Number.isFinite(num)) { obj[key] = num; return; }
  obj[key] = fallback;
  counters.nanValuesFixed += 1;
}

function sanitizeNode(node, counters) {
  if (!isObject(node)) return;
  const numericTopLevel = ['x','y','weight','rawWeight','inDegree','outDegree','score','size'];
  for (const key of numericTopLevel) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const before = node[key];
      const after = safeNumber(before, 0);
      if (!Number.isFinite(before)) counters.nanValuesFixed += 1;
      node[key] = after;
    }
  }

  sanitizePosition(node, 'position', counters);

  if (isObject(node.attrs)) {
    sanitizePosition(node.attrs, 'position', counters);
    const attrsNumeric = ['weight','rawWeight','size','x','y'];
    for (const key of attrsNumeric) sanitizeNumericField(node.attrs, key, 0, counters);
  }

  if (isObject(node.data)) {
    sanitizePosition(node.data, 'position', counters);
    const dataNumeric = ['weight','rawWeight','size','x','y','positionx','positiony','posx','posy'];
    for (const key of dataNumeric) sanitizeNumericField(node.data, key, 0, counters);
  }
}

function sanitizeEdge(edge, counters) {
  if (!isObject(edge)) return;
  sanitizeNumericField(edge, 'pathLength', 1, counters);
  sanitizeNumericField(edge, 'edgeWeight', safeNumber(edge.pathLength, 1), counters);
  if (isObject(edge.attrs)) {
    const attrsNumeric = ['weight','rawWeight','width'];
    for (const key of attrsNumeric) sanitizeNumericField(edge.attrs, key, 0, counters);
  }
  if (isObject(edge.data)) {
    const dataNumeric = ['weight','rawWeight','width'];
    for (const key of dataNumeric) sanitizeNumericField(edge.data, key, 0, counters);
  }
}

function sanitizeGraph(graph, mode, orphanPrefix) {
  const nodes = Array.isArray(graph.nodes) ? [...graph.nodes] : [];
  const edges = Array.isArray(graph.edges) ? [...graph.edges] : [];
  const validNodes = [];
  const nodeIds = new Set();
  let removedNodes = 0;
  const counters = { positionsFixed: 0, nanValuesFixed: 0 };
  for (const n of nodes) {
    if (!n || !n.id) { removedNodes += 1; continue; }
    const id = String(n.id);
    if (!id.trim()) { removedNodes += 1; continue; }
    if (nodeIds.has(id)) { /* duplicate id -> skip */ continue; }
    if (n.weight != null) n.weight = safeNumber(n.weight, safeNumber(n.outDegree, 0));
    if (n.rawWeight != null) n.rawWeight = safeNumber(n.rawWeight, n.weight || 0);
    sanitizeNode(n, counters);
    validNodes.push(n);
    nodeIds.add(id);
  }

  const placeholders = new Map();
  const validEdges = [];
  let droppedEdges = 0;
  let fixedEdges = 0;
  for (const e of edges) {
    if (!e || !e.source || !e.target) { droppedEdges += 1; continue; }
    const srcOk = nodeIds.has(e.source);
    const tgtOk = nodeIds.has(e.target);
    if (!srcOk || !tgtOk) {
      if (mode === 'placeholder') {
        if (!srcOk) { const ph = ensurePlaceholderNode(e.source, orphanPrefix); if (!placeholders.has(ph.id)) { placeholders.set(ph.id, ph); nodeIds.add(ph.id); fixedEdges += 1; } }
        if (!tgtOk) { const ph = ensurePlaceholderNode(e.target, orphanPrefix); if (!placeholders.has(ph.id)) { placeholders.set(ph.id, ph); nodeIds.add(ph.id); fixedEdges += 1; } }
        validEdges.push(e);
      } else { droppedEdges += 1; }
      continue;
    }
    if (!Number.isFinite(e.pathLength)) e.pathLength = safeNumber(e.pathLength, 1);
    sanitizeEdge(e, counters);
    validEdges.push(e);
  }
  if (placeholders.size) {
    for (const ph of placeholders.values()) validNodes.push(ph);
  }

  return {
    nodes: validNodes,
    edges: validEdges,
    stats: { removedNodes, droppedEdges, fixedEdges, placeholders: placeholders.size, positionsFixed: counters.positionsFixed, nanValuesFixed: counters.nanValuesFixed }
  };
}

function mapNodeToTopogram(n) {
  const id = String(n.id);
  const type = n.type || (n.kind || 'node');
  const label = (type === 'function') ? `${n.label || n.name || id}()` : (n.label || n.name || id);
  const name = n.label || n.name || id;
  const description = String(n.type || n.description || '');
  const color = n.color || (type === 'module' ? '#1f77b4' : (type === 'function' ? '#2ca02c' : '#7f7f7f'));
  const fillColor = n.fillColor || color;
  const weight = (Number.isFinite(n.functionCount) ? n.functionCount : (Number.isFinite(n.weight) ? n.weight : ''));
  const rawWeight = (Number.isFinite(n.rawWeight) ? n.rawWeight : weight || '');
  const posx = (n.position && Number.isFinite(n.position.x)) ? n.position.x : (n.data && Number.isFinite(n.data.positionx) ? n.data.positionx : '');
  const posy = (n.position && Number.isFinite(n.position.y)) ? n.position.y : (n.data && Number.isFinite(n.data.positiony) ? n.data.positiony : '');
  const extra = JSON.stringify(n);
  return {
    id,
    name,
    label,
    description,
    color,
    fillColor,
    weight: weight === '' ? '' : weight,
    rawWeight: rawWeight === '' ? '' : rawWeight,
    lat: '',
    lng: '',
    start: '',
    end: '',
    time: '',
    date: '',
    source: '',
    target: '',
    edgeLabel: '',
    edgeColor: '',
    edgeWeight: '',
    relationship: '',
    enlightement: n.enlightement || (n.data && n.data.enlightement) || '',
    emoji: n.emoji || (n.data && n.data.emoji) || '',
    extra
  };
}

function mapEdgeToTopogram(e) {
  const id = e.id || `${e.source}->${e.target}`;
  const edgeWeight = Number.isFinite(e.pathLength) ? e.pathLength : (Number.isFinite(e.edgeWeight) ? e.edgeWeight : '');
  const relationship = e.type ? ({ 'function-call':'calls','function-call-external':'calls','module-import':'imports','package-import':'imports','module-has-function':'contains','module-import-transitive':'imports' }[e.type] || e.type) : '';
  const edgeColor = e.color || e.edgeColor || '';
  const extra = JSON.stringify(e);
  return {
    id,
    name: e.name || '',
    label: e.label || '',
    description: e.description || '',
    color: '',
    fillColor: '',
    weight: '',
    rawWeight: '',
    lat: '',
    lng: '',
    start: '',
    end: '',
    time: '',
    date: '',
    source: e.source || '',
    target: e.target || '',
    edgeLabel: e.label || '',
    edgeColor,
    edgeWeight: edgeWeight === '' ? '' : edgeWeight,
    relationship,
    enlightement: e.enlightement || (e.data && e.data.enlightement) || '',
    emoji: e.emoji || (e.data && e.data.emoji) || '',
    extra
  };
}

// New: scan mapped rows for NaN/Infinity and optionally try to repair positions
function detectAndFixNaNs(mappedNodes, mappedEdges, args) {
  const nodeProblems = [];
  const edgeProblems = [];
  for (const n of mappedNodes) {
    // check numeric-looking fields: weight, rawWeight
    const issues = [];
    const w = n.weight; const rw = n.rawWeight;
    if (w !== '' && !Number.isFinite(Number(w))) issues.push('weight');
    if (rw !== '' && !Number.isFinite(Number(rw))) issues.push('rawWeight');
    // pos fields are stored indirectly in extra -> try to recover
    let posx = n.lat || n.lng || '';
    // Note: mapNodeToTopogram places position into extra; try to parse
    try {
      const orig = JSON.parse(n.extra || '{}');
      if (orig && orig.position && Number.isFinite(Number(orig.position.x)) && Number.isFinite(Number(orig.position.y))) {
        // if mapped node lacks coordinates, recover them into extra fields lat/lng
        if (args.fixPositions) {
          n.lat = String(Number(orig.position.x));
          n.lng = String(Number(orig.position.y));
          issues.push('recovered-position');
        }
      }
    } catch (err) {
      // ignore parse errors
    }
    if (issues.length) nodeProblems.push({ id: n.id, issues });
  }
  for (const e of mappedEdges) {
    const issues = [];
    if (e.edgeWeight !== '' && !Number.isFinite(Number(e.edgeWeight))) issues.push('edgeWeight');
    if (issues.length) edgeProblems.push({ id: e.id, issues });
  }

  if (args.debug) {
    console.log('detectAndFixNaNs: nodeProblems:', nodeProblems.length, 'edgeProblems:', edgeProblems.length);
    if (nodeProblems.length) console.log('sample node problems:', nodeProblems.slice(0,10));
    if (edgeProblems.length) console.log('sample edge problems:', edgeProblems.slice(0,10));
  }

  return { nodeProblems, edgeProblems };
}

function toCsv(graph) {
  const rows = [];
  const outgoing = new Map();
  for (const n of graph.nodes) outgoing.set(n.id, 0);
  for (const e of graph.edges) { if (outgoing.has(e.source)) outgoing.set(e.source, outgoing.get(e.source)+1); }
  const relMap = { 'function-call':'calls','function-call-external':'calls','module-import':'imports','package-import':'imports','module-has-function':'contains','module-import-transitive':'imports' };
  for (const n of graph.nodes) {
    const count = outgoing.get(n.id) || 0;
    const color = n.type==='module' ? '#1f77b4' : (n.type==='function' ? '#2ca02c' : '#7f7f7f');
    rows.push({ id:n.id, name:n.label||'', label:n.type==='function'?`${n.label||''}()`:(n.label||''), description:n.type||'', color, fillColor:color, weight:count, rawWeight:count, lat:'', lng:'', start:'', end:'', time:'', date:'', source:'', target:'', edgeLabel:'', edgeColor:'', edgeWeight:'', relationship:'', enlightement:'', emoji:'', extra: JSON.stringify(n) });
  }
  for (const e of graph.edges) {
    rows.push({ id:e.id||`${e.source}->${e.target}`, name:'', label:'', description:'', color:'', fillColor:'', weight:'', rawWeight:'', lat:'', lng:'', start:'', end:'', time:'', date:'', source:e.source, target:e.target, edgeLabel:'', edgeColor:'', edgeWeight: Number.isFinite(e.pathLength)? e.pathLength : 1, relationship: relMap[e.type] || e.type || '', enlightement:'', emoji:'', extra: JSON.stringify(e) });
  }
  function cell(v) {
    if (v == null) return '';
    const s = String(v);
    if (s === 'NaN' || s === 'Infinity' || s === '-Infinity' || s === 'undefined') return '';
    return s;
  }
  const lines = [];
  lines.push(HEADER.join(','));
  for (const r of rows) { lines.push(HEADER.map(k=>cell(r[k])).join(',')); }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) { printHelp(); process.exit(args.input?0:1); }
  if (!fs.existsSync(args.input)) { console.error('Input not found:', args.input); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(args.input,'utf8'));
  const sanitized = sanitizeGraph(raw, args.mode, args.orphanPrefix);
  const base = path.basename(args.input, path.extname(args.input));
  const mappedNodes = sanitized.nodes.map(mapNodeToTopogram);
  const mappedEdges = sanitized.edges.map(mapEdgeToTopogram);

  // run detection and optional fixes
  const problems = detectAndFixNaNs(mappedNodes, mappedEdges, args);

  const outJson = path.join(path.dirname(args.input), `${base}.sanitized.json`);
  fs.writeFileSync(outJson, JSON.stringify({ nodes: mappedNodes, edges: mappedEdges }, null, 2),'utf8');
  const outCsv = path.join(path.dirname(args.input), `${base}.sanitized.csv`);
  const csvLines = [];
  csvLines.push(HEADER.join(','));
  const cell = v => {
    if (v == null) return '';
    const s = String(v);
    if (s === 'NaN' || s === 'Infinity' || s === '-Infinity' || s === 'undefined') return '';
    if (s.includes(',' ) || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  for (const r of mappedNodes.concat(mappedEdges)) {
    const row = HEADER.map(k => cell(r[k]));
    csvLines.push(row.join(','));
  }
  fs.writeFileSync(outCsv, csvLines.join('\n'), 'utf8');
  console.log('Sanitized graph written:', outJson);
  console.log('Sanitized CSV written :', outCsv);
  console.log('Stats:', sanitized.stats);
  if (args.debug) console.log('detect-fix problems summary:', problems);
}

if (require.main === module) { main(); }
