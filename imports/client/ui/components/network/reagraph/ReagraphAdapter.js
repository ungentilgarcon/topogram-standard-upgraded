/* ReagraphAdapter
 * Adapter that integrates the npm-installed 'reagraph' + 'graphology' packages
 * and exposes a small Cytoscape-like API so TopogramDetail can use
 * `?graph=reagraph`. This module requires the packages to be installed and
 * will throw an error early if they're not present (no global/window fallback).
 */

// Require reagraph and graphology from node_modules (fail loudly if absent)
let ReagraphPkg = null;
try {
  // eslint-disable-next-line global-require
  ReagraphPkg = require('reagraph');
} catch (err) {
  console.error('ReagraphAdapter: missing required package "reagraph". Please run `npm install reagraph@4.27.0`');
  throw err;
}

let Graphology = null;
try {
  // eslint-disable-next-line global-require
  Graphology = require('graphology');
} catch (err) {
  console.error('ReagraphAdapter: missing required package "graphology". Please run `npm install graphology`');
  throw err;
}

// Runtime assertion / info to make it obvious which implementation is used
try {
  const reagraphPkgJson = (function() {
    try {
      return require('reagraph/package.json');
    } catch (e) { return null; }
  })();
  const graphologyPkgJson = (function() {
    try { return require('graphology/package.json'); } catch (e) { return null; }
  })();
  console.info('ReagraphAdapter: using npm packages', {
    reagraph: reagraphPkgJson ? `${reagraphPkgJson.name}@${reagraphPkgJson.version}` : (ReagraphPkg && (ReagraphPkg.version || ReagraphPkg.default && ReagraphPkg.default.version)) || 'unknown',
    graphology: graphologyPkgJson ? `${graphologyPkgJson.name}@${graphologyPkgJson.version}` : (Graphology && Graphology.version) || 'unknown',
    globalReagraphDetected: (typeof window !== 'undefined' && window.reagraph) ? true : false
  });
  if (typeof window !== 'undefined' && window.reagraph) {
    console.warn('ReagraphAdapter: detected a global `window.reagraph` — the adapter is configured to use the npm package; remove UMD shims to avoid confusion.');
  }
} catch (e) {
  // swallow logging errors
}

// Translate cy-style elements to simple node/edge arrays (local helper)
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

    // Compute node degrees from edges so we can derive sensible default sizes
    const degreeMap = new Map();
    edgeMap.forEach(e => {
      try {
        const s = String(e.source); const t = String(e.target);
        degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
        degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
      } catch (err) {}
    });
    // Compute numeric weight range so we can map weight -> diameter consistent with Cytoscape
    const numericWeights = [];
    nodeMap.forEach(n => {
      try { numericWeights.push(Number((n.attrs && (n.attrs.weight != null ? n.attrs.weight : 1)) || 1)); } catch (e) {}
    });
    const minW = numericWeights.length ? Math.min(...numericWeights) : 1;
    const maxW = numericWeights.length ? Math.max(...numericWeights) : (minW + 1);
    function mapData(value, dmin, dmax, rmin, rmax) {
      const v = (typeof value === 'number' && isFinite(value)) ? value : Number(value || 0);
      const a = Number(dmin || 0); const b = Number(dmax || (a + 1));
      const mn = Number(rmin || 0); const mx = Number(rmax || mn + 1);
      if (b === a) return (mn + mx) / 2;
      const t = (v - a) / (b - a);
      return mn + t * (mx - mn);
    }

    // Ensure every node has a numeric 'size' attribute (used here as diameter)
    nodeMap.forEach(n => {
      try {
        const attrs = n.attrs || {};
        if (typeof attrs.size === 'undefined' || attrs.size === null) {
          const w = (typeof attrs.weight !== 'undefined' && attrs.weight !== null) ? Number(attrs.weight) : 1;
          if (w != null && !Number.isNaN(w)) {
            const dia = mapData(w, minW, maxW, 12, 60);
            attrs.size = Math.max(8, Math.min(48, Math.floor(dia)));
          } else {
            const deg = degreeMap.get(String(n.id)) || 0;
            attrs.size = Math.max(8, Math.min(48, 8 + deg * 4));
          }
        }
        // persist possibly updated attrs back
        n.attrs = attrs;
      } catch (e) {}
    });

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
    // defs for reusable markers (arrowheads)
    const defs = document.createElementNS(svgNS, 'defs');
    try {
      const marker = document.createElementNS(svgNS, 'marker');
      marker.setAttribute('id', 'reagraph-arrow');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('refX', '6');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('markerUnits', 'strokeWidth');
      // triangle path that inherits currentColor for flexible coloring
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', '0 0, 8 3, 0 6');
      poly.setAttribute('fill', 'currentColor');
      poly.setAttribute('stroke', 'none');
      marker.appendChild(poly);
      defs.appendChild(marker);
    } catch (e) {}
    svg.appendChild(defs);
    container.appendChild(svg);
    // viewport group that will be transformed for pan/zoom
    const viewport = document.createElementNS(svgNS, 'g');
    svg.appendChild(viewport);

    // helper to create per-edge markers sized and colored for visibility
    const _markerCache = new Map();
    // deterministic color helper (same algorithm as TopogramDetail)
    function _stringToColorHex(str) {
      try {
        if (!str) str = '';
        let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        const hue = h % 360; const sat = 62; const light = 52;
        const hNorm = hue / 360; const s = sat / 100; const l = light / 100;
        const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
        let r, g, b; if (s === 0) { r = g = b = l; } else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hue2rgb(p, q, hNorm + 1/3); g = hue2rgb(p, q, hNorm); b = hue2rgb(p, q, hNorm - 1/3); }
        const toHex = (x) => { const v = Math.round(x * 255); return (v < 16 ? '0' : '') + v.toString(16); };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      } catch (e) { return '#1f2937'; }
    }
    function createEdgeMarker(edgeId, color, strokeW) {
      try {
        const key = String(edgeId);
        const existing = _markerCache.get(key);
        if (existing) return existing;
        const m = document.createElementNS(svgNS, 'marker');
        const size = Math.max(8, Math.round((strokeW || 1) * 6));
        m.setAttribute('id', `reagraph-arrow-${key}`);
        m.setAttribute('markerWidth', String(size));
        m.setAttribute('markerHeight', String(size));
        m.setAttribute('refX', String(Math.max(6, Math.round(size * 0.75))));
        m.setAttribute('refY', String(Math.round(size / 2)));
        m.setAttribute('orient', 'auto');
        m.setAttribute('markerUnits', 'strokeWidth');
        const poly = document.createElementNS(svgNS, 'polygon');
        // create a slightly larger triangle for visibility
        poly.setAttribute('points', `0 0, ${size} ${Math.round(size/2)}, 0 ${size}`);
        poly.setAttribute('fill', color || 'currentColor');
        poly.setAttribute('stroke', 'none');
        m.appendChild(poly);
        try { defs.appendChild(m); } catch (e) {}
        _markerCache.set(key, m);
        return m;
      } catch (e) { return null; }
    }
    // helper to create an arrow polygon positioned at x,y rotated by angleDeg
    function createArrowPolygon(edgeId, color, size, x, y, angleDeg) {
      try {
        const key = `arrow-${edgeId}`;
        const poly = document.createElementNS(svgNS, 'polygon');
        const h = Math.max(6, Math.round(size || 10));
        // triangle centered at origin, pointing to +X, will be transformed
        const points = `0 ${-Math.round(h/2)} ${Math.round(h)} 0 0 ${Math.round(h/2)}`;
        poly.setAttribute('points', points);
        poly.setAttribute('fill', color || '#0f172a');
        poly.setAttribute('stroke', 'none');
        poly.setAttribute('data-edge-arrow', String(edgeId));
        poly.setAttribute('transform', `translate(${x},${y}) rotate(${angleDeg})`);
        poly.setAttribute('pointer-events', 'none');
        return poly;
      } catch (e) { return null; }
    }

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
          // preserve previously computed render positions when available to
          // avoid re-randomizing on every render (which caused jitter on
          // selection). Only assign random positions when none exist.
          if (typeof n.__renderX === 'number' && typeof n.__renderY === 'number') return;
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
            // If the node has numeric attrs.x/attrs.y, map them into viewport
            // coordinates. Otherwise, preserve any existing __renderX/__renderY
            // to avoid moving nodes on trivial attribute changes (like
            // selection). Only create a random fallback if none exists yet.
            const nx = (typeof n.attrs.x === 'number') ? (n.attrs.x - minX) * scale + pad : (typeof n.__renderX === 'number' ? n.__renderX : Math.random() * (w - pad*2) + pad);
            const ny = (typeof n.attrs.y === 'number') ? (n.attrs.y - minY) * scale + pad : (typeof n.__renderY === 'number' ? n.__renderY : Math.random() * (h - pad*2) + pad);
            n.__renderX = nx;
            n.__renderY = ny;
          });
        }
      }

  // edges
  const loopElements = [];
  const arrowElements = [];
      // group edges by unordered pair so reciprocal edges (A->B and B->A)
      // are considered together and can be curved to opposite sides for
      // visual differentiation
      const edgeGroups = new Map();
      edgeMap.forEach((edge, id) => {
        try {
          const a = String(edge.source);
          const b = String(edge.target);
          const key = a < b ? `${a}<>${b}` : `${b}<>${a}`;
          if (!edgeGroups.has(key)) edgeGroups.set(key, []);
          edgeGroups.get(key).push(edge);
        } catch (e) {}
      });
      // iterate groups and render each edge; if there are multiple edges
      // between the same unordered pair, render curved offsets. For
      // reciprocal edges, forward edges are curved to one side, backward
      // edges to the other side.
      // compute global edge weight range for mapping
      const allEdgeWeights = [];
      edgeMap.forEach(e => { try { allEdgeWeights.push(Number((e.attrs && (e.attrs.weight != null ? e.attrs.weight : (e.attrs && e.attrs.width != null ? e.attrs.width : 1))) || 1)); } catch (er) {} });
      const minEW = allEdgeWeights.length ? Math.min(...allEdgeWeights) : 1;
      const maxEW = allEdgeWeights.length ? Math.max(...allEdgeWeights) : (minEW + 1);
      function mapDataLocal(v, a, b, mn, mx) {
        const val = (typeof v === 'number' && isFinite(v)) ? v : Number(v || 0);
        const A = Number(a || 0); const B = Number(b || (A + 1));
        const MN = Number(mn || 0); const MX = Number(mx || (MN + 1));
        if (B === A) return (MN + MX) / 2;
        const t = (val - A) / (B - A);
        return MN + t * (MX - MN);
      }
      edgeGroups.forEach((edgesArr, groupKey) => {
        // prepare forward/back sublists based on direction
        const forward = []; const back = [];
        edgesArr.forEach(e => { try { if (String(e.source) <= String(e.target)) forward.push(e); else back.push(e); } catch (er) {} });
        // create an ordered list (forward edges first, then back). Using
        // the ordered list to compute offsets ensures reciprocal edges
        // (A->B and B->A) get symmetric, non-zero offsets even when each
        // directional count is 1.
        const ordered = forward.concat(back);
        // helper to get index/count for an edge within the ordered list
        function dirIndexAndCount(edge) {
          const idx = ordered.indexOf(edge);
          return { idx, count: ordered.length, isForward: (String(edge.source) <= String(edge.target)) };
        }
        edgesArr.forEach((edge) => {
          const { idx, count, isForward } = dirIndexAndCount(edge);
        try {
          // respect timeline/hidden attribute: skip drawing edges marked hidden
          if (edge && edge.attrs && edge.attrs.hidden) return;
          const s = nodeMap.get(edge.source);
          const t = nodeMap.get(edge.target);
          if (!s || !t) return;
          // if either endpoint is hidden, skip rendering this edge
          if ((s.attrs && s.attrs.hidden) || (t.attrs && t.attrs.hidden)) return;
          const sx = s.__renderX || 0; const sy = s.__renderY || 0;
          const tx = t.__renderX || 0; const ty = t.__renderY || 0;
          // Visual highlight when edge is selected: use a bright yellow and thicker stroke
          const sel = edge.attrs && edge.attrs.selected;
          const baseColor = (edge.attrs && edge.attrs.color) || _stringToColorHex(String(edge.id || `${edge.source}|${edge.target}`)) || 'rgba(31,41,55,0.6)';
          // prefer a highlight color provided on the edge, otherwise use a clear yellow
          const highlightColor = (edge.attrs && edge.attrs.highlightColor) || '#FFEB3B';
          const strokeColor = sel ? highlightColor : baseColor;
          const rawEdgeW = (edge.attrs && (edge.attrs.weight != null ? edge.attrs.weight : (edge.attrs && edge.attrs.width != null ? edge.attrs.width : 1))) || 1;
          const mappedWidth = Math.max(1, mapDataLocal(rawEdgeW, minEW, maxEW, 1, 6));
          const strokeWidth = sel ? Math.max(3, Math.round(mappedWidth * 2)) : mappedWidth;

            if (String(edge.source) === String(edge.target)) {
            // self-loop: render as a circular arc/path around the node
            const node = nodeMap.get(edge.source);
            const cx = node && (node.__renderX || 0);
            const cy = node && (node.__renderY || 0);
            // estimate node radius from attrs if available
            const nodeAttrs = node && node.attrs;
            const nodeR = (nodeAttrs && (nodeAttrs.size || nodeAttrs.weight)) ? Math.max(4, (nodeAttrs.size || nodeAttrs.weight) / 2) : 10;
            // Support multiple loops: compute an index and count so each loop can
            // be offset in radius and angle to avoid exact overlap (like Cytoscape).
            const loopIdx = (typeof idx === 'number') ? idx : 0;
            const loopCount = (typeof count === 'number' && count > 0) ? count : 1;
            // base loop radius and per-loop spacing
            const baseLoopRadius = Math.max(28, Math.round(nodeR * 3) + 12);
            // slightly smaller spacing so multiple loops are closer together
            // tightened further to make adjacent loops nearer each other
            const loopSpacing = Math.max(4, Math.round(nodeR * 0.5));
            const loopRadius = baseLoopRadius + loopIdx * loopSpacing;
            // angle distribution around the node (radians). center the spread
            // around the top-right quadrant by default, and step per-loop.
            const angleBase = -Math.PI / 3; // -60deg (upper-right)
            const angleStep = 0.28; // ~16deg step between loops (tighter)
            const angle = angleBase + (loopIdx - (loopCount - 1) / 2) * angleStep;
            // compute loop center offset from node using computed angle
            // slightly reduce the radial center distance so loops appear closer
            const centerDist = nodeR + Math.round(loopRadius * 0.55);
            const centerX = cx + Math.cos(angle) * centerDist;
            const centerY = cy + Math.sin(angle) * centerDist;
            // compute start point on the node perimeter in the direction of the loop center
            const dirX = centerX - cx;
            const dirY = centerY - cy;
            const dirLen = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
            const ux = dirX / dirLen;
            const uy = dirY / dirLen;
            // start on node perimeter so the loop visually 'touches' the node
            const startX = cx + ux * nodeR;
            const startY = cy + uy * nodeR;
            // compute angle from loop center to start point for arc start
            const relStartX = startX - centerX;
            const relStartY = startY - centerY;
            const angleStart = Math.atan2(relStartY, relStartX);
            // compute a point very close to start point on the arc to close the loop
            const epsilon = 0.6;
            const closeX = centerX + Math.cos(angleStart - epsilon) * loopRadius;
            const closeY = centerY + Math.sin(angleStart - epsilon) * loopRadius;
            const d = `M ${startX} ${startY} A ${loopRadius} ${loopRadius} 0 1 1 ${closeX} ${closeY}`;
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', strokeColor || _stringToColorHex(String(edge.id || `${edge.source}|${edge.target}`)));
            path.setAttribute('stroke-width', strokeWidth);
            path.setAttribute('opacity', sel ? '1' : '0.9');
            path.setAttribute('stroke-linecap', 'round');
            path.dataset.id = edge.id;
            path.style.cursor = 'pointer';
            // prepare loop label (use relationship/emoji/title/name when available)
            try {
              // Prefer an explicitly computed `_relVizLabel` (set by TopogramDetail).
              // If `_relVizLabel` exists it is authoritative (even if empty string -> 'none').
              let labelText = null;
              if (edge.attrs) {
                if (Object.prototype.hasOwnProperty.call(edge.attrs, '_relVizLabel')) {
                  labelText = String(edge.attrs._relVizLabel || '');
                } else {
                  labelText = (edge.attrs.label || edge.attrs.relationship || edge.attrs.emoji || edge.attrs.title || edge.attrs.name) || null;
                }
              }
              let labelEl = null;
                if (labelText) {
                  // Use foreignObject+HTML so emoji color glyphs render reliably
                  try {
                    const foW = 160; const foH = 20;
                    const fo = document.createElementNS(svgNS, 'foreignObject');
                    fo.setAttribute('x', String(Math.round(centerX - foW / 2)));
                    fo.setAttribute('y', String(Math.round(centerY - Math.max(6, loopRadius / 3) - foH / 2)));
                    fo.setAttribute('width', String(foW)); fo.setAttribute('height', String(foH));
                    fo.setAttribute('pointer-events', 'none');
                    const div = document.createElement('div');
                    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                    div.style.cssText = "font-size:12px; font-family: Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, 'Segoe UI Symbol', Arial, sans-serif; color: #0f172a; text-align:center; line-height:1;";
                    div.textContent = String(labelText);
                    fo.appendChild(div);
                    labelEl = fo;
                  } catch (e) {
                    labelEl = document.createElementNS(svgNS, 'text');
                    labelEl.setAttribute('x', String(centerX));
                    labelEl.setAttribute('y', String(centerY - Math.max(6, loopRadius / 3)));
                    labelEl.setAttribute('fill', '#0f172a');
                    labelEl.setAttribute('font-size', '12');
                    labelEl.setAttribute('text-anchor', 'middle');
                    labelEl.setAttribute('pointer-events', 'none');
                    labelEl.textContent = String(labelText);
                  }
                }
              // create loop arrow if requested
              try {
                const hasArrow = (edge.attrs && (String(edge.attrs.enlightement).toLowerCase() === 'arrow' || edge.attrs.arrow));
                let arrowEl = null;
                if (hasArrow) {
                  const px = startX + (centerX - startX) * 0.33;
                  const py = startY + (centerY - startY) * 0.33;
                  const angleDeg = (Math.atan2(centerY - startY, centerX - startX) * 180 / Math.PI);
                  const size = Math.max(10, Math.round(strokeWidth * 6));
                  arrowEl = createArrowPolygon(edge.id, strokeColor, size, px, py, angleDeg);
                }
                loopElements.push({ path, hitD: d, edge, labelEl, arrowEl });
              } catch (e) { loopElements.push({ path, hitD: d, edge, labelEl }); }
            } catch (e) { loopElements.push({ path, hitD: d, edge }); }
            } else {
            // multiple parallel edges: render curved quadratic Bezier paths offset from the center line
            // compute total count for this pair and symmetric offset index
            const group = edgesArr || [];
            const index = idx; // index within directional list
            // decide whether to curve: if more than one edge exists between
            // the unordered pair, curve all of them; otherwise keep straight
            if (group.length <= 1) {
              // single straight line
              const line = document.createElementNS(svgNS, 'line');
              line.setAttribute('x1', sx); line.setAttribute('y1', sy); line.setAttribute('x2', tx); line.setAttribute('y2', ty);
                line.setAttribute('stroke', strokeColor || _stringToColorHex(String(edge.id || `${edge.source}|${edge.target}`)));
              line.setAttribute('stroke-width', strokeWidth);
              line.setAttribute('opacity', sel ? '1' : '0.9');
              line.setAttribute('stroke-linecap', 'round');
              line.dataset.id = edge.id;
              line.style.cursor = 'pointer';
              // if edge indicates an arrow, draw a visible polygon arrowhead
              try {
                const hasArrow = (edge.attrs && (String(edge.attrs.enlightement).toLowerCase() === 'arrow' || edge.attrs.arrow));
                  if (hasArrow) {
                  const dx = tx - sx; const dy = ty - sy; const llen = Math.sqrt(dx*dx + dy*dy) || 1;
                  const ux = dx / llen; const uy = dy / llen;
                  const tgtNode = t;
                  const tgtR = (tgtNode && tgtNode.attrs && (tgtNode.attrs.size || tgtNode.attrs.weight)) ? Math.max(4, (tgtNode.attrs.size || tgtNode.attrs.weight) / 2) : 10;
                  const size = Math.max(10, Math.round(Math.min(14, strokeWidth * 4)));
                  const offset = tgtR + Math.max(4, Math.round(size / 3));
                  const ax = tx - ux * offset; const ay = ty - uy * offset;
                  const angleDeg = (Math.atan2(uy, ux) * 180 / Math.PI);
                  const arrow = createArrowPolygon(edge.id, strokeColor, size, ax, ay, angleDeg);
                  if (arrow) arrowElements.push(arrow);
                }
              } catch (e) {}
              viewport.appendChild(line);
              // label near midpoint, offset slightly perpendicular to avoid node overlap
              try {
                let labelText = null;
                if (edge.attrs) {
                  if (Object.prototype.hasOwnProperty.call(edge.attrs, '_relVizLabel')) {
                    labelText = String(edge.attrs._relVizLabel || '');
                  } else {
                    labelText = (edge.attrs.label || edge.attrs.relationship || edge.attrs.emoji || edge.attrs.title || edge.attrs.name) || null;
                  }
                }
                if (labelText) {
                  const dxl = tx - sx; const dyl = ty - sy; const llen = Math.sqrt(dxl*dxl + dyl*dyl) || 1;
                  const pxl = -dyl / llen; const pyl = dxl / llen;
                  const midX = (sx + tx) / 2 + pxl * Math.min(12, Math.max(8, strokeWidth*4));
                  const midY = (sy + ty) / 2 + pyl * Math.min(12, Math.max(8, strokeWidth*4));
                  try {
                    const foW = 180; const foH = 20;
                    const fo = document.createElementNS(svgNS, 'foreignObject');
                    fo.setAttribute('x', String(Math.round(midX - foW / 2))); fo.setAttribute('y', String(Math.round(midY - foH / 2)));
                    fo.setAttribute('width', String(foW)); fo.setAttribute('height', String(foH));
                    fo.setAttribute('pointer-events', 'none');
                    const div = document.createElement('div');
                    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                    div.style.cssText = "font-size:12px; font-family: Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, 'Segoe UI Symbol', Arial, sans-serif; color: #0f172a; text-align:center; line-height:1;";
                    div.textContent = String(labelText);
                    fo.appendChild(div);
                    viewport.appendChild(fo);
                  } catch (e) {
                    const txt = document.createElementNS(svgNS, 'text');
                    txt.setAttribute('x', String(midX)); txt.setAttribute('y', String(midY));
                    txt.setAttribute('fill', '#0f172a'); txt.setAttribute('font-size', '12'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('pointer-events', 'none');
                    txt.textContent = String(labelText);
                    viewport.appendChild(txt);
                  }
                }
              } catch (e) {}
              try {
                const hit = document.createElementNS(svgNS, 'line');
                hit.setAttribute('x1', sx); hit.setAttribute('y1', sy); hit.setAttribute('x2', tx); hit.setAttribute('y2', ty);
                const hitWidth = (edge.attrs && edge.attrs.width) ? Math.max(8, edge.attrs.width * 4) : 12;
                hit.setAttribute('stroke', 'transparent');
                hit.setAttribute('stroke-width', hitWidth);
                hit.style.pointerEvents = 'stroke';
                hit.dataset.id = edge.id;
                hit.style.cursor = 'pointer';
                hit.addEventListener('click', (ev) => {
                  try {
                    try { console.debug && console.debug('ReagraphAdapter: edge hit click', { edgeId: edge.id, event: ev }); } catch (e) {}
                    ev.stopPropagation();
                    const cur = edge.attrs && edge.attrs.selected;
                    if (cur) { if (edge.attrs) delete edge.attrs.selected; } else { if (!edge.attrs) edge.attrs = {}; edge.attrs.selected = true; }
                    const j = { data: { id: edge.id, source: edge.source, target: edge.target } };
                    const k = SelectionManager ? SelectionManager.canonicalKey(j) : `edge:${edge.id}`;
                    try { _localSelKeys.add(k); } catch (e) {}
                    try { if (SelectionManager) { console.debug && console.debug('ReagraphAdapter: calling SelectionManager', cur ? 'unselect' : 'select', j); if (cur) SelectionManager.unselect(j); else SelectionManager.select(j); } } catch (e) {}
                  } catch (e) {}
                  try { render(); } catch (e) {}
                });
                viewport.appendChild(hit);
              } catch (e) {}
              } else {
              // curve parameters
              const midX = (sx + tx) / 2;
              const midY = (sy + ty) / 2;
              const dx = tx - sx;
              const dy = ty - sy;
              const len = Math.sqrt(dx*dx + dy*dy) || 1;
              // perpendicular unit vector
              const px = -dy / len;
              const py = dx / len;
              // spacing between parallel edges: increase base so curves are visible
              // at typical viewport scales. Previously this was 18px which can
              // be too small when nodes are far apart; use 28px as a better
              // default for clear curvature.
              const baseSpacing = Math.max(18, Math.round(strokeWidth * 8));
              const spreadFactor = 1 + Math.max(0, (count - 1) / 2);
              const spacing = baseSpacing;
              // compute directional offset: spread edges of same direction
              // symmetrically around center, and push forward/back to
              // opposite sides
              const offsetIndex = (typeof idx === 'number' && typeof count === 'number') ? (idx - (count - 1) / 2) : 0;
              const dirSign = isForward ? 1 : -1;
              // If there are an even number of edges, the centered index will be
              // fractional (e.g. -0.5, +0.5). Multiply those offsets by 2 so a
              // pair of reciprocal/parallel edges produce symmetric full-step
              // offsets (-1, +1) making curvature visually apparent.
              const evenMultiplier = (typeof count === 'number' && (count % 2) === 0) ? 2 : 1;
              const offset = offsetIndex * spacing * spreadFactor * dirSign * evenMultiplier;
              const cx = midX + px * offset;
              const cy = midY + py * offset;
              const d = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
              const path = document.createElementNS(svgNS, 'path');
              path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', strokeColor || _stringToColorHex(String(edge.id || `${edge.source}|${edge.target}`)));
              path.setAttribute('stroke-width', strokeWidth);
              path.setAttribute('opacity', sel ? '1' : '0.9');
              path.setAttribute('stroke-linecap', 'round');
              path.dataset.id = edge.id;
              path.style.cursor = 'pointer';
              try {
                const hasArrow = (edge.attrs && (String(edge.attrs.enlightement).toLowerCase() === 'arrow' || edge.attrs.arrow));
                  if (hasArrow) {
                  const vx = tx - cx; const vy = ty - cy; const vlen = Math.sqrt(vx*vx + vy*vy) || 1;
                  const ux = vx / vlen; const uy = vy / vlen;
                  const tgtNode = t;
                  const tgtR = (tgtNode && tgtNode.attrs && (tgtNode.attrs.size || tgtNode.attrs.weight)) ? Math.max(4, (tgtNode.attrs.size || tgtNode.attrs.weight) / 2) : 10;
                  const size = Math.max(10, Math.round(Math.min(14, strokeWidth * 4)));
                  const offset = tgtR + Math.max(4, Math.round(size / 3));
                  const ax = tx - ux * offset; const ay = ty - uy * offset;
                  const angleDeg = (Math.atan2(uy, ux) * 180 / Math.PI);
                  const arrow = createArrowPolygon(edge.id, strokeColor, size, ax, ay, angleDeg);
                  if (arrow) arrowElements.push(arrow);
                }
              } catch (e) {}
              viewport.appendChild(path);
              // label positioned at quadratic bezier midpoint (t=0.5) and offset slightly
              try {
                let labelText = null;
                if (edge.attrs) {
                  if (Object.prototype.hasOwnProperty.call(edge.attrs, '_relVizLabel')) {
                    labelText = String(edge.attrs._relVizLabel || '');
                  } else {
                    labelText = (edge.attrs.label || edge.attrs.relationship || edge.attrs.emoji || edge.attrs.title || edge.attrs.name) || null;
                  }
                }
                if (labelText) {
                  const midX = 0.25 * sx + 0.5 * cx + 0.25 * tx;
                  const midY = 0.25 * sy + 0.5 * cy + 0.25 * ty;
                  const dxl = tx - sx; const dyl = ty - sy; const llen = Math.sqrt(dxl*dxl + dyl*dyl) || 1;
                  const pxl = -dyl / llen; const pyl = dxl / llen;
                  const mx = midX + pxl * Math.min(12, Math.max(8, strokeWidth*4));
                  const my = midY + pyl * Math.min(12, Math.max(8, strokeWidth*4));
                  try {
                    const foW = 180; const foH = 20;
                    const fo = document.createElementNS(svgNS, 'foreignObject');
                    fo.setAttribute('x', String(Math.round(mx - foW / 2))); fo.setAttribute('y', String(Math.round(my - foH / 2)));
                    fo.setAttribute('width', String(foW)); fo.setAttribute('height', String(foH));
                    fo.setAttribute('pointer-events', 'none');
                    const div = document.createElement('div');
                    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                    div.style.cssText = "font-size:12px; font-family: Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, 'Segoe UI Symbol', Arial, sans-serif; color: #0f172a; text-align:center; line-height:1;";
                    div.textContent = String(labelText);
                    fo.appendChild(div);
                    viewport.appendChild(fo);
                  } catch (e) {
                    const txt = document.createElementNS(svgNS, 'text');
                    txt.setAttribute('x', String(mx)); txt.setAttribute('y', String(my));
                    txt.setAttribute('fill', '#0f172a'); txt.setAttribute('font-size', '12'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('pointer-events', 'none');
                    txt.textContent = String(labelText);
                    viewport.appendChild(txt);
                  }
                }
              } catch (e) {}
              try {
                const hit = document.createElementNS(svgNS, 'path');
                hit.setAttribute('d', d);
                const hitWidth = (edge.attrs && edge.attrs.width) ? Math.max(8, edge.attrs.width * 4) : 12;
                hit.setAttribute('stroke', 'transparent');
                hit.setAttribute('stroke-width', hitWidth);
                hit.setAttribute('fill', 'none');
                hit.style.pointerEvents = 'stroke';
                hit.dataset.id = edge.id;
                hit.style.cursor = 'pointer';
                hit.addEventListener('click', (ev) => {
                  try {
                    try { console.debug && console.debug('ReagraphAdapter: edge hit click', { edgeId: edge.id, event: ev }); } catch (e) {}
                    ev.stopPropagation();
                    const cur = edge.attrs && edge.attrs.selected;
                    if (cur) { if (edge.attrs) delete edge.attrs.selected; } else { if (!edge.attrs) edge.attrs = {}; edge.attrs.selected = true; }
                    const j = { data: { id: edge.id, source: edge.source, target: edge.target } };
                    const k = SelectionManager ? SelectionManager.canonicalKey(j) : `edge:${edge.id}`;
                    try { _localSelKeys.add(k); } catch (e) {}
                    try { if (SelectionManager) { console.debug && console.debug('ReagraphAdapter: calling SelectionManager', cur ? 'unselect' : 'select', j); if (cur) SelectionManager.unselect(j); else SelectionManager.select(j); } } catch (e) {}
                  } catch (e) {}
                  try { render(); } catch (e) {}
                });
                viewport.appendChild(hit);
              } catch (e) {}
            }
          }
        } catch (e) {}
        });
      });
      
      // nodes
      nodeMap.forEach(node => {
        try {
          // Respect hidden attribute: skip rendering nodes marked hidden
          if (node && node.attrs && node.attrs.hidden) return;
          const cx = node.__renderX || 0; const cy = node.__renderY || 0;
          // larger default radius and stronger scaling from weight/size
          const r = (node.attrs && (node.attrs.size || node.attrs.weight)) ? Math.max(4, (node.attrs.size || node.attrs.weight) / 2) : 10;
          const circ = document.createElementNS(svgNS, 'circle');
          circ.setAttribute('cx', cx); circ.setAttribute('cy', cy); circ.setAttribute('r', r);
          // dark node fill by default on light background
          circ.setAttribute('fill', (node.attrs && node.attrs.color) || _stringToColorHex(String(node.id || '')));
          // stroke: red when selected, otherwise subtle dark outline
          circ.setAttribute('stroke', node.attrs && node.attrs.selected ? '#ef4444' : 'rgba(31,41,55,0.15)');
          circ.setAttribute('stroke-width', node.attrs && node.attrs.selected ? 2 : 0.5);
          circ.setAttribute('data-id', node.id);
          circ.style.cursor = 'pointer';
          circ.addEventListener('click', (ev) => {
            try {
              try { console.debug && console.debug('ReagraphAdapter: node click', { nodeId: node.id, event: ev }); } catch (e) {}
              ev.stopPropagation();
              // toggle selection locally
              try {
                const cur = node.attrs && node.attrs.selected;
                if (cur) { if (node.attrs) delete node.attrs.selected; } else { if (!node.attrs) node.attrs = {}; node.attrs.selected = true; }
                const j = { data: { id: node.id } };
                const k = SelectionManager ? SelectionManager.canonicalKey(j) : `node:${node.id}`;
                try { _localSelKeys.add(k); } catch (e) {}
                try { if (SelectionManager) { console.debug && console.debug('ReagraphAdapter: calling SelectionManager', cur ? 'unselect' : 'select', j); if (cur) SelectionManager.unselect(j); else SelectionManager.select(j); } } catch (e) {}
              } catch (e) {}
              try { render(); } catch (e) {}
            } catch (e) {}
          });
            // append collected loops after node labels so loops are visible above labels
            try {
              loopElements.forEach(({ path, hitD, edge, labelEl }) => {
                try { viewport.appendChild(path); } catch (e) {}
                try { if (labelEl) viewport.appendChild(labelEl); } catch (e) {}
                try {
                  const hit = document.createElementNS(svgNS, 'path');
                  hit.setAttribute('d', hitD);
                  const hitWidth = Math.max(8, Math.round((edge.attrs && edge.attrs.width) ? edge.attrs.width * 4 : (mappedWidth * 4)));
                  hit.setAttribute('stroke', 'transparent');
                  hit.setAttribute('stroke-width', hitWidth);
                  hit.setAttribute('fill', 'none');
                  hit.style.pointerEvents = 'stroke';
                  hit.dataset.id = edge.id;
                  hit.style.cursor = 'pointer';
                  hit.addEventListener('click', (ev) => {
                    try {
                      try { console.debug && console.debug('ReagraphAdapter: edge hit click', { edgeId: edge.id, event: ev }); } catch (e) {}
                      ev.stopPropagation();
                      // toggle selection state locally
                      try {
                        const cur = edge.attrs && edge.attrs.selected;
                        if (cur) { if (edge.attrs) delete edge.attrs.selected; } else { if (!edge.attrs) edge.attrs = {}; edge.attrs.selected = true; }
                        const j = { data: { id: edge.id, source: edge.source, target: edge.target } };
                        const k = SelectionManager ? SelectionManager.canonicalKey(j) : `edge:${edge.id}`;
                        try { _localSelKeys.add(k); } catch (e) {}
                        try { if (SelectionManager) { console.debug && console.debug('ReagraphAdapter: calling SelectionManager', cur ? 'unselect' : 'select', j); if (cur) SelectionManager.unselect(j); else SelectionManager.select(j); } } catch (e) {}
                      } catch (e) {}
                      try { render(); } catch (e) {}
                    } catch (e) {}
                  });
                  viewport.appendChild(hit);
                } catch (e) {}
              });
            } catch (e) {}
            try { arrowElements.forEach(a => { try { viewport.appendChild(a); } catch (e) {} }); } catch (e) {}
          viewport.appendChild(circ);
        // render label if present (use _vizLabel or label fields)
        try {
          const label = (node.attrs && (node.attrs._vizLabel || node.attrs.label || node.attrs.name)) || null;
          if (label) {
            try {
              const foW = Math.max(80, Math.round(r * 3)); const foH = 20;
              const fo = document.createElementNS(svgNS, 'foreignObject');
              fo.setAttribute('x', String(Math.round(cx - foW / 2))); fo.setAttribute('y', String(Math.round(cy + r + 12 - foH / 2)));
              fo.setAttribute('width', String(foW)); fo.setAttribute('height', String(foH));
              fo.setAttribute('pointer-events', 'none');
              const div = document.createElement('div');
              div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
              div.style.cssText = "font-size:12px; font-family: Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, 'Segoe UI Symbol', Arial, sans-serif; color: #0f172a; text-align:center; line-height:1;";
              div.textContent = String(label);
              fo.appendChild(div);
              viewport.appendChild(fo);
            } catch (e) {
              const txt = document.createElementNS(svgNS, 'text');
              txt.setAttribute('x', cx);
              txt.setAttribute('y', cy + r + 12);
              txt.setAttribute('fill', '#0f172a');
              txt.setAttribute('font-size', '12');
              txt.setAttribute('text-anchor', 'middle');
              txt.setAttribute('pointer-events', 'none');
              txt.textContent = String(label);
              viewport.appendChild(txt);
            }
          }
        } catch (e) {}
        } catch (e) {}
      });
      // re-apply transform after rendering
      applyTransform();
    }

    // local-origin selection keys to avoid echo loops when mirroring to SelectionManager
    const _localSelKeys = new Set();
    // panning state: support background drag-to-pan (mouse + touch)
    let _isPanning = false;
    let _panStart = null; // {x,y,startTx,startTy}
    let _didPan = false; // suppress click action after a pan
  let _isSelecting = false;
  let _selStart = null; // {x,y}
  let _selRect = null; // SVG rect element

    function _getEventPoint(ev) {
      if (!ev) return null;
      if (ev.touches && ev.touches.length) {
        return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      }
      return { x: ev.clientX, y: ev.clientY };
    }

    function clientToSvg(pt) {
      try {
        const rect = svg.getBoundingClientRect();
        return { x: (pt.x - rect.left), y: (pt.y - rect.top) };
      } catch (e) { return { x: pt.x, y: pt.y }; }
    }

    function onPointerDown(ev) {
      try {
        // only start when clicking/touching the SVG background (not nodes/edges)
        if (ev.target !== svg) return;
        const pt = _getEventPoint(ev);
        if (!pt) return;
        // Ctrl/Meta + drag -> selection box; otherwise pan
        const isCtrl = !!(ev.ctrlKey || ev.metaKey);
        if (isCtrl) {
          _isSelecting = true;
          const svgPt = clientToSvg(pt);
          _selStart = { x: svgPt.x, y: svgPt.y };
          _didPan = true; // prevent immediate background-click clearing
          // create overlay rect on svg (not in viewport) so it isn't transformed
          try {
            _selRect = document.createElementNS(svgNS, 'rect');
            _selRect.setAttribute('x', String(_selStart.x)); _selRect.setAttribute('y', String(_selStart.y));
            _selRect.setAttribute('width', '0'); _selRect.setAttribute('height', '0');
            _selRect.setAttribute('fill', 'rgba(59,130,246,0.08)');
            _selRect.setAttribute('stroke', 'rgba(59,130,246,0.9)');
            _selRect.setAttribute('stroke-dasharray', '4 3');
            _selRect.style.pointerEvents = 'none';
            svg.appendChild(_selRect);
          } catch (e) {}
          try { ev.preventDefault(); } catch (e) {}
          return;
        }
        // otherwise start panning
        _isPanning = true;
        _didPan = false;
        _panStart = { x: pt.x, y: pt.y, startTx: _tx, startTy: _ty };
        try { ev.preventDefault(); } catch (e) {}
      } catch (e) {}
    }

    function onPointerMove(ev) {
      try {
        if (_isSelecting && _selStart && _selRect) {
          const pt = _getEventPoint(ev);
          if (!pt) return;
          const svgPt = clientToSvg(pt);
          const x = Math.min(_selStart.x, svgPt.x);
          const y = Math.min(_selStart.y, svgPt.y);
          const w = Math.abs(svgPt.x - _selStart.x);
          const h = Math.abs(svgPt.y - _selStart.y);
          try { _selRect.setAttribute('x', String(x)); _selRect.setAttribute('y', String(y)); _selRect.setAttribute('width', String(w)); _selRect.setAttribute('height', String(h)); } catch (e) {}
          return;
        }
        if (!_isPanning || !_panStart) return;
        const pt = _getEventPoint(ev);
        if (!pt) return;
        const dx = pt.x - _panStart.x;
        const dy = pt.y - _panStart.y;
        _tx = _panStart.startTx + dx;
        _ty = _panStart.startTy + dy;
        _didPan = Math.abs(dx) > 2 || Math.abs(dy) > 2;
        applyTransform();
      } catch (e) {}
    }

    function onPointerUp(ev) {
      try {
        if (_isSelecting) {
          // finalize selection box
          try {
            const rectBox = (function() {
              try {
                const x = Number(_selRect.getAttribute('x') || 0);
                const y = Number(_selRect.getAttribute('y') || 0);
                const w = Number(_selRect.getAttribute('width') || 0);
                const h = Number(_selRect.getAttribute('height') || 0);
                return { x, y, w, h };
              } catch (e) { return null; }
            })();
            if (rectBox && rectBox.w > 0 && rectBox.h > 0) {
              // collect nodes whose screen positions are inside rect
              const pickedNodes = [];
              nodeMap.forEach((n, id) => {
                try {
                  // node screen position in SVG local coords
                  const sx = (n.__renderX || 0) * _scale + _tx;
                  const sy = (n.__renderY || 0) * _scale + _ty;
                  if (sx >= rectBox.x && sx <= rectBox.x + rectBox.w && sy >= rectBox.y && sy <= rectBox.y + rectBox.h) pickedNodes.push(id);
                } catch (e) {}
              });
              // pick edges whose midpoint is inside rect
              const pickedEdges = [];
              edgeMap.forEach((e, id) => {
                try {
                  const s = nodeMap.get(e.source); const t = nodeMap.get(e.target);
                  if (!s || !t) return;
                  const mx = ((s.__renderX || 0) + (t.__renderX || 0)) / 2 * _scale + _tx;
                  const my = ((s.__renderY || 0) + (t.__renderY || 0)) / 2 * _scale + _ty;
                  if (mx >= rectBox.x && mx <= rectBox.x + rectBox.w && my >= rectBox.y && my <= rectBox.y + rectBox.h) pickedEdges.push(id);
                } catch (e) {}
              });

              // apply selection: if ctrl/meta was used at start, do additive; otherwise replace
              const add = !!(ev.ctrlKey || ev.metaKey);
              if (SelectionManager && typeof SelectionManager.select === 'function') {
                try {
                  if (!add) { SelectionManager.clear(); }
                } catch (e) {}
                pickedNodes.forEach(id => {
                  try {
                    const j = { data: { id } };
                    const k = SelectionManager ? SelectionManager.canonicalKey(j) : `node:${id}`;
                    try { _localSelKeys.add(k); } catch (e) {}
                    SelectionManager.select(j);
                  } catch (e) {}
                });
                pickedEdges.forEach(id => {
                  try {
                    const e = edgeMap.get(id);
                    const j = { data: { id: e.id, source: e.source, target: e.target } };
                    const k = SelectionManager ? SelectionManager.canonicalKey(j) : `edge:${id}`;
                    try { _localSelKeys.add(k); } catch (e) {}
                    SelectionManager.select(j);
                  } catch (e) {}
                });
              } else {
                // fallback: set attrs directly
                if (!add) {
                  nodeMap.forEach(n => { if (n && n.attrs && n.attrs.selected) delete n.attrs.selected; });
                  edgeMap.forEach(ed => { if (ed && ed.attrs && ed.attrs.selected) delete ed.attrs.selected; });
                }
                pickedNodes.forEach(id => { try { const n = nodeMap.get(id); if (n) { if (!n.attrs) n.attrs = {}; n.attrs.selected = true; } } catch (e) {} });
                pickedEdges.forEach(id => { try { const ed = edgeMap.get(id); if (ed) { if (!ed.attrs) ed.attrs = {}; ed.attrs.selected = true; } } catch (e) {} });
                try { render(); } catch (e) {}
              }
            }
          } catch (e) {}
          // cleanup selection rect
          try { if (_selRect && _selRect.parentNode) _selRect.parentNode.removeChild(_selRect); } catch (e) {}
          _selRect = null; _selStart = null; _isSelecting = false;
          // leave _didPan true briefly so click handler doesn't clear
          setTimeout(() => { _didPan = false; }, 50);
          return;
        }
        if (!_isPanning) return;
        _isPanning = false;
        _panStart = null;
        // small timeout to allow click event to see _didPan flag
        setTimeout(() => { _didPan = false; }, 50);
      } catch (e) {}
    }

    // wire mouse and touch events
    svg.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    svg.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);

    // background click clears selection (notify SelectionManager so other views update)
    svg.addEventListener('click', (ev) => {
      try {
        // if we just panned, don't treat this as a click to clear selection
        if (_didPan) { try { _didPan = false; } catch (e) {} return; }
        // NOTE: previously background clicks cleared selection. That caused
        // unintentional deselection when users clicked empty canvas areas.
        // We intentionally do nothing here so clicking the background does
        // not change selection. Selection should only change via explicit
        // interactions (element clicks, selection box, or programmatic calls).
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
              return ids.filter(i => { const n = nodeMap.get(i); if (!n) return false; if (cls === 'selected') return !!(n.attrs && n.attrs.selected); if (cls === 'hidden') return !!(n.attrs && n.attrs.hidden); return false; }).map(i => makeNodeWrapper(i));
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
      elements() {
        // build arrays of wrappers
        const nodeArr = [];
        const edgeArr = [];
        nodeMap.forEach((n, id) => nodeArr.push(makeNodeWrapper(id)));
        edgeMap.forEach((e, id) => edgeArr.push(makeEdgeWrapper(id)));
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
            if (k === 'selected') { if (v) return this.select(); return this.unselect(); }
            // generic set on attrs where possible: update underlying maps
            all.forEach(w => {
              try {
                const j = w.json && w.json();
                if (j && j.data && typeof j.data.id !== 'undefined') {
                  const id = j.data.id;
                  // try node map first
                  if (nodeMap.has(id)) {
                    const n = nodeMap.get(id); if (!n.attrs) n.attrs = {}; n.attrs[k] = v;
                  } else if (edgeMap.has(id)) {
                    const e = edgeMap.get(id); if (!e.attrs) e.attrs = {}; e.attrs[k] = v;
                  }
                }
              } catch (e) {}
            });
            try { render(); } catch (e) {}
          }
        };
      },
      // selector helper similar to Cytoscape's $ - supports ':selected', node[id='..'], edge[id='..'] and source/target
      $: function(selector) {
        const nodes = [];
        const edges = [];
        if (!selector) return { toArray: () => [], forEach() {}, map() { return []; }, filter() { return []; }, length: 0 };
        // support 'node' and 'edge' to return all wrappers
        if (selector === 'node') {
          nodeMap.forEach((n, id) => nodes.push(makeNodeWrapper(id)));
          const arrN = nodes;
          return {
            length: arrN.length,
            toArray: () => arrN,
            forEach: (fn) => arrN.forEach(fn),
            map: (fn) => arrN.map(fn),
            filter: (pred) => (Array.isArray(arrN) ? arrN.filter(pred) : []),
            select: () => { arrN.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
            unselect: () => { arrN.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
            data: (k, v) => { if (k === 'selected') { if (v) return this.select(); return this.unselect(); } }
          };
        }
        if (selector === 'edge') {
          edgeMap.forEach((e, id) => edges.push(makeEdgeWrapper(id)));
          const arrE = edges;
          return {
            length: arrE.length,
            toArray: () => arrE,
            forEach: (fn) => arrE.forEach(fn),
            map: (fn) => arrE.map(fn),
            filter: (pred) => (Array.isArray(arrE) ? arrE.filter(pred) : []),
            select: () => { arrE.forEach(w => { try { if (typeof w.select === 'function') w.select(); else if (typeof w.addClass === 'function') w.addClass('selected'); } catch (e) {} }); },
            unselect: () => { arrE.forEach(w => { try { if (typeof w.unselect === 'function') w.unselect(); else if (typeof w.removeClass === 'function') w.removeClass('selected'); } catch (e) {} }); },
            data: (k, v) => { if (k === 'selected') { if (v) return this.select(); return this.unselect(); } }
          };
        }
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
      filter(predicate) {
        try {
          // selector string -> delegate to $ and return array of wrappers
          if (typeof predicate === 'string') {
            const res = this.$(predicate)
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
                    const j = w.json && w.json();
                    if (j && j.data && typeof j.data.id !== 'undefined') {
                      const id = j.data.id;
                      if (nodeMap.has(id)) { const n = nodeMap.get(id); if (!n.attrs) n.attrs = {}; n.attrs[k] = v; }
                      else if (edgeMap.has(id)) { const e = edgeMap.get(id); if (!e.attrs) e.attrs = {}; e.attrs[k] = v; }
                    }
                  } catch (e) {}
                });
                try { render(); } catch (e) {}
              }
            }
            return coll
          }
          // function predicate -> call with wrapper objects
          if (typeof predicate === 'function') {
            const out = []
            nodeMap.forEach((n, id) => { try { const w = makeNodeWrapper(id); if (predicate(w)) out.push(w); } catch (e) {} });
            edgeMap.forEach((e, id) => { try { const w = makeEdgeWrapper(id); if (predicate(w)) out.push(w); } catch (e) {} });
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
          }
          return []
        } catch (e) { return []; }
      },
      destroy() { try { container.removeChild(svg); } catch (e) {} }
    };

    function makeNodeWrapper(id) {
      return {
        id: () => id,
        data: (k) => {
          const obj = { ... (nodeMap.get(id) && nodeMap.get(id).attrs) };
          if (typeof k === 'undefined') return obj;
          return obj ? obj[k] : undefined;
        },
        json: () => ({ data: { ... (nodeMap.get(id) && nodeMap.get(id).attrs) } }),
        isNode: () => true,
        hasClass: (cls) => { const n = nodeMap.get(id); if (!n) return false; if (cls === 'selected') return !!(n.attrs && n.attrs.selected); if (cls === 'hidden') return !!(n.attrs && n.attrs.hidden); return false; },
        addClass: (cls) => { const n = nodeMap.get(id); if (!n) return; if (!n.attrs) n.attrs = {}; if (cls === 'selected') { n.attrs.selected = true; render(); } if (cls === 'hidden') { n.attrs.hidden = true; render(); } },
        removeClass: (cls) => { const n = nodeMap.get(id); if (!n || !n.attrs) return; if (cls === 'selected') { delete n.attrs.selected; render(); } if (cls === 'hidden') { delete n.attrs.hidden; render(); } },
        select: () => adapter.select(id),
        unselect: () => adapter.unselect(id)
      };
    }

    function makeEdgeWrapper(id) {
      return {
        id: () => id,
        data: (k) => {
          const obj = { ...(edgeMap.get(id) && edgeMap.get(id).attrs) };
          if (typeof k === 'undefined') return obj;
          return obj ? obj[k] : undefined;
        },
        json: () => ({ data: { ...(edgeMap.get(id) && edgeMap.get(id).attrs) } }),
        isNode: () => false,
        source: () => ({ id: () => (edgeMap.get(id) && edgeMap.get(id).source) }),
        target: () => ({ id: () => (edgeMap.get(id) && edgeMap.get(id).target) }),
        hasClass: (cls) => { const e = edgeMap.get(id); if (!e) return false; if (cls === 'hidden') return !!(e.attrs && e.attrs.hidden); if (cls === 'selected') return !!(e.attrs && e.attrs.selected); return false; },
        addClass: (cls) => { const e = edgeMap.get(id); if (!e) return; if (!e.attrs) e.attrs = {}; if (cls === 'hidden') { e.attrs.hidden = true; render(); } if (cls === 'selected') { e.attrs.selected = true; render(); } },
        removeClass: (cls) => { const e = edgeMap.get(id); if (!e || !e.attrs) return; if (cls === 'hidden') { delete e.attrs.hidden; render(); } if (cls === 'selected') { delete e.attrs.selected; render(); } }
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
            try { console.debug && console.debug('ReagraphAdapter: SelectionManager.select', element); } catch (e) {}
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
            try { console.debug && console.debug('ReagraphAdapter: SelectionManager.unselect', element); } catch (e) {}
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
            try { console.debug && console.debug('ReagraphAdapter: SelectionManager.clear'); } catch (e) {}
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
