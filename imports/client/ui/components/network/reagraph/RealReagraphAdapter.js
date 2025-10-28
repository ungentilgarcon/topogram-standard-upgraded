import React from 'react';
import { createRoot } from 'react-dom/client';
import loadReagraphModule from './loadReagraph.js';
import loadGraphologyModule from './loadGraphology.js';
let cachedReagraph = undefined;
let cachedGraphology = undefined;

async function ensureReagraph(env = {}) {
	if (env && env.reagraph) return env.reagraph;
	if (cachedReagraph !== undefined) return cachedReagraph;
	cachedReagraph = await loadReagraphModule();
	return cachedReagraph;
}

async function ensureGraphology(env = {}) {
	if (env && env.graphology) return env.graphology;
	if (cachedGraphology !== undefined) return cachedGraphology;
	cachedGraphology = await loadGraphologyModule();
	return cachedGraphology;
}


let cyElementsToGraphology = null;

async function ensureCyElementsToGraphology() {
	if (typeof cyElementsToGraphology === 'function') return cyElementsToGraphology;
	try {
		const mod = await import('../graphAdapters/cyElementsToGraphology.js');
		cyElementsToGraphology = mod && (mod.default || mod);
	} catch (err) {
		cyElementsToGraphology = null;
	}
	return cyElementsToGraphology;
}

function stringToColorHex(str) {
	try {
		const value = str || '';
		let h = 0;
		for (let i = 0; i < value.length; i += 1) {
			h = (h * 31 + value.charCodeAt(i)) >>> 0;
		}
		const hue = h % 360;
		const sat = 62;
		const light = 52;
		const hNorm = hue / 360;
		const s = sat / 100;
		const l = light / 100;
		const hue2rgb = (p, q, t) => {
			let tt = t;
			if (tt < 0) tt += 1;
			if (tt > 1) tt -= 1;
			if (tt < 1 / 6) return p + (q - p) * 6 * tt;
			if (tt < 1 / 2) return q;
			if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
			return p;
		};
		let r;
		let g;
		let b;
		if (s === 0) {
			r = l;
			g = l;
			b = l;
		} else {
			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			r = hue2rgb(p, q, hNorm + 1 / 3);
			g = hue2rgb(p, q, hNorm);
			b = hue2rgb(p, q, hNorm - 1 / 3);
		}
		const toHex = (x) => {
			const v = Math.round(x * 255);
			return (v < 16 ? '0' : '') + v.toString(16);
		};
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	} catch (err) {
		return '#1f2937';
	}
}

function mapRange(value, inMin, inMax, outMin, outMax) {
	const val = Number.isFinite(value) ? value : Number(value || 0);
	const imin = Number.isFinite(inMin) ? inMin : 0;
	const imax = Number.isFinite(inMax) && inMax !== inMin ? inMax : imin + 1;
	const omin = Number.isFinite(outMin) ? outMin : 0;
	const omax = Number.isFinite(outMax) ? outMax : omin + 1;
	const t = (val - imin) / (imax - imin);
	return omin + t * (omax - omin);
}

function buildNodeMeta(rawNodes) {
	const nodes = new Map();
	const weights = [];
	rawNodes.forEach((node) => {
		if (!node || !node.id) return;
		const id = String(node.id);
		const attrs = { ...(node.attrs || {}) };
		if (node.x != null || node.y != null) {
			const nx = Number(node.x);
			const ny = Number(node.y);
			if (Number.isFinite(nx)) attrs.x = nx;
			if (Number.isFinite(ny)) attrs.y = ny;
			if (Number.isFinite(nx) || Number.isFinite(ny)) {
				const px = Number.isFinite(nx) ? nx : 0;
				const py = Number.isFinite(ny) ? ny : 0;
				if (!attrs.position || typeof attrs.position !== 'object') attrs.position = { x: px, y: py };
			}
		}
		if (attrs.weight != null) {
			const w = Number(attrs.weight);
			if (Number.isFinite(w)) weights.push(w);
		}
		nodes.set(id, {
			id,
			attrs,
			data: { ...attrs },
		});
	});
	const minWeight = weights.length ? Math.min(...weights) : 1;
	const maxWeight = weights.length ? Math.max(...weights) : minWeight + 1;
	return { nodes, minWeight, maxWeight };
}

function buildEdgeMeta(rawEdges) {
	const edges = new Map();
	const weights = [];
	rawEdges.forEach((edge) => {
		if (!edge || !edge.source || !edge.target) return;
		const eid = String(edge.id || `${edge.source}-${edge.target}`);
		const attrs = { ...(edge.attrs || {}) };
		const weight = attrs.weight != null ? Number(attrs.weight) : (attrs.width != null ? Number(attrs.width) : null);
		if (Number.isFinite(weight)) weights.push(weight);
		edges.set(eid, {
			id: eid,
			source: String(edge.source),
			target: String(edge.target),
			attrs,
			data: { ...attrs },
		});
	});
	const minWeight = weights.length ? Math.min(...weights) : 1;
	const maxWeight = weights.length ? Math.max(...weights) : minWeight + 1;
	return { edges, minWeight, maxWeight };
}

function deriveNodeSize(attrs, minWeight, maxWeight) {
	const base = attrs && attrs.size != null ? Number(attrs.size) : null;
	if (Number.isFinite(base) && base > 0) return Math.max(6, Math.min(40, base));
	const weight = attrs && attrs.weight != null ? Number(attrs.weight) : null;
	if (Number.isFinite(weight)) {
		return Math.max(8, Math.min(48, Math.round(mapRange(weight, minWeight, maxWeight, 12, 60))));
	}
	return 14;
}

function deriveEdgeWidth(attrs, minWeight, maxWeight) {
	const base = attrs && attrs.width != null ? Number(attrs.width) : null;
	if (Number.isFinite(base) && base > 0) return Math.max(0.5, Math.min(8, base));
	const weight = attrs && attrs.weight != null ? Number(attrs.weight) : null;
	if (Number.isFinite(weight)) {
		return Math.max(0.75, Math.min(6, mapRange(weight, minWeight, maxWeight, 1, 6)));
	}
	return 1.2;
}

function deriveNodeLabel(attrs) {
	if (!attrs) return '';
	if (Object.prototype.hasOwnProperty.call(attrs, '_vizLabel')) return String(attrs._vizLabel || '');
	if (attrs.label) return String(attrs.label);
	if (attrs.name) return String(attrs.name);
	if (attrs.title) return String(attrs.title);
	if (attrs.emoji) return String(attrs.emoji);
	if (attrs.id != null) return String(attrs.id);
	return '';
}

function deriveEdgeLabel(attrs) {
	if (!attrs) return '';
	if (Object.prototype.hasOwnProperty.call(attrs, '_relVizLabel')) return String(attrs._relVizLabel || '');
	if (attrs.label) return String(attrs.label);
	if (attrs.relationship) return String(attrs.relationship);
	if (attrs.emoji) return String(attrs.emoji);
	if (attrs.title) return String(attrs.title);
	if (attrs.name) return String(attrs.name);
	return '';
}

function makeSelectionPayload(id, type, edgeData) {
	if (type === 'edge') {
		return { data: { id: edgeData && edgeData.id ? edgeData.id : id, source: edgeData ? edgeData.source : null, target: edgeData ? edgeData.target : null } };
	}
	return { data: { id } };
}

function mapLayoutNameToReagraph(name) {
	if (!name) return 'forceatlas2';
	const lower = String(name).toLowerCase();
	switch (lower) {
		case 'concentric':
			return 'concentric2d';
		case 'circle':
		case 'circular':
			return 'circular2d';
		case 'breadthfirst':
			return 'treeTd2d';
		case 'radial':
		case 'radialout':
		case 'radial-out':
			return 'radialOut2d';
		case 'nooverlap':
		case 'grid':
			return 'nooverlap';
		case 'cose':
		case 'cola':
		case 'force-directed':
		case 'spring':
			return 'forceDirected2d';
		case 'preset':
		case 'custom':
			return 'forceatlas2';
		default:
			return 'forceatlas2';
	}
}

function recomputeNodeWeights(meta) {
	let min = Infinity;
	let max = -Infinity;
	meta.nodes.forEach((entry) => {
		const attrs = entry && entry.attrs;
		const weight = attrs && attrs.weight != null ? Number(attrs.weight) : null;
		if (Number.isFinite(weight)) {
			if (weight < min) min = weight;
			if (weight > max) max = weight;
		}
	});
	if (!Number.isFinite(min)) min = 1;
	if (!Number.isFinite(max)) max = min + 1;
	meta.minWeight = min;
	meta.maxWeight = max;
}

function recomputeEdgeWeights(meta) {
	let min = Infinity;
	let max = -Infinity;
	meta.edges.forEach((entry) => {
		const attrs = entry && entry.attrs;
		const weight = attrs && (attrs.weight != null ? Number(attrs.weight) : (attrs.width != null ? Number(attrs.width) : null));
		if (Number.isFinite(weight)) {
			if (weight < min) min = weight;
			if (weight > max) max = weight;
		}
	});
	if (!Number.isFinite(min)) min = 1;
	if (!Number.isFinite(max)) max = min + 1;
	meta.minWeight = min;
	meta.maxWeight = max;
}

const LARGE_NODE_THRESHOLD = 2500;
const LARGE_EDGE_THRESHOLD = 8000;
const LABEL_SWITCH_THRESHOLD = 1800;
const MAX_IDLE_DELAY_MS = 32;

export async function mountRealReagraphAdapter(opts = {}, env = {}) {
	const { container, elements = [], layout = null } = opts;
	if (!container) return { impl: 'reagraph', noop: true };

	const runtimeReagraph = await ensureReagraph(env);
	const GraphCanvas = runtimeReagraph && (runtimeReagraph.GraphCanvas || (runtimeReagraph.default && runtimeReagraph.default.GraphCanvas));
	if (!GraphCanvas) return null;

	const runtimeGraphology = await ensureGraphology(env);
	const GraphCtorCandidate = runtimeGraphology && (runtimeGraphology.Graph || runtimeGraphology.default || runtimeGraphology);
	const GraphCtor = typeof GraphCtorCandidate === 'function' ? GraphCtorCandidate : null;

	const cyToGraph = await ensureCyElementsToGraphology();
	if (typeof cyToGraph !== 'function') return null;

	const { nodes: rawNodes, edges: rawEdges } = cyToGraph(elements || []);
	const nodeMeta = buildNodeMeta(rawNodes);
	const edgeMeta = buildEdgeMeta(rawEdges);

	function buildGraphSnapshot(nodesArr, edgesArr) {
		if (!GraphCtor) return null;
		let graphInstance = null;
		try {
			graphInstance = new GraphCtor({ multi: true, allowSelfLoops: true, type: 'directed' });
		} catch (err) {
			try { graphInstance = new GraphCtor(); } catch (err2) { graphInstance = null; }
		}
		if (!graphInstance) return null;
		(nodesArr || []).forEach((node) => {
			const attrs = {
				label: node.label,
				size: node.size,
				color: node.fill,
				selected: node.data && node.data.selected,
				...node.data,
			};
			if (node.position) {
				attrs.position = { x: node.position.x, y: node.position.y };
				if (node.position.x != null) attrs.x = node.position.x;
				if (node.position.y != null) attrs.y = node.position.y;
			}
			try { graphInstance.addNode(node.id, attrs); } catch (err) {}
		});
		(edgesArr || []).forEach((edge) => {
			if (!graphInstance.hasNode(edge.source) || !graphInstance.hasNode(edge.target)) return;
			const attrs = {
				label: edge.label,
				size: edge.size,
				color: edge.fill,
				selected: edge.data && edge.data.selected,
				...edge.data,
			};
			try {
				graphInstance.addEdgeWithKey(edge.id, edge.source, edge.target, attrs);
			} catch (err) {
				try {
					const fallbackKey = `${edge.id || 'edge'}#${Math.random().toString(36).slice(2, 8)}`;
					graphInstance.addEdgeWithKey(fallbackKey, edge.source, edge.target, attrs);
				} catch (err2) {}
			}
		});
		return graphInstance;
	}

	const nodeWrappers = new Map();
	const edgeWrappers = new Map();
	const selectedNodeIds = new Set();
	const selectedEdgeIds = new Set();
	const hiddenNodeIds = new Set();
	const hiddenEdgeIds = new Set();
	const localSelectionKeys = new Set();
	let currentLayoutName = layout && layout.name ? String(layout.name) : null;

	const nodeCacheIndices = new Map();
	const edgeCacheIndices = new Map();
	let nodeRecords = [];
	let edgeRecords = [];
	let renderNodeArray = [];
	let renderEdgeArray = [];
	const dirtyNodeIds = new Set();
	const dirtyEdgeIds = new Set();
	let nodesRequireFullSync = true;
	let edgesRequireFullSync = true;
	let graphVersion = 0;

	let SelectionManager = null;
	try {
		const maybeSelection = require('/imports/client/selection/SelectionManager');
		SelectionManager = maybeSelection && (maybeSelection.default || maybeSelection);
	} catch (err) {
		SelectionManager = null;
	}

	const canvasRef = { current: null };
	let baseDistance = null;
	let zoomLevel = 1;
	let rafHandle = null;
	let idleHandle = null;
	let renderQueued = false;
	let disposed = false;

	// Reuse a single React root per container to avoid double createRoot warnings
	let root = container.__reagraphRoot || null;
	if (!root) {
		try { container.innerHTML = ''; } catch (e) {}
		root = createRoot(container);
		try { container.__reagraphRoot = root; } catch (e) {}
	}

	const supportsRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
	const supportsIdle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';

	// Debug flag: enable by adding ?reagraphDebug=1 to URL or setting window.__REAGRAPH_DEBUG__ = true
	const isDebugEnabled = (() => {
		try {
			if (typeof window !== 'undefined') {
				if (window.__REAGRAPH_DEBUG__ === true) return true;
				const qs = new URLSearchParams(window.location.search || '');
				return qs.has('reagraphDebug') || qs.has('debugReagraph');
			}
			return false;
		} catch (e) { return false; }
	})();

	// Runtime flags via URL params
	const runtimeFlags = (() => {
		let flags = { aggregateEdges: false, noGraph: false };
		try {
			if (typeof window !== 'undefined') {
				const qs = new URLSearchParams(window.location.search || '');
				const readBool = (k, d) => {
					if (!qs.has(k)) return d;
					const v = String(qs.get(k)).toLowerCase();
					return v === '1' || v === 'true' || v === 'yes' || v === 'on';
				};
				// Defaults: aggregateEdges OFF by default; allow explicit override via URL
				flags.aggregateEdges = readBool('reagraphAggregateEdges', readBool('aggregateEdges', false));
				flags.noGraph = readBool('reagraphNoGraph', readBool('noGraph', false));
			}
		} catch (e) {}
		return flags;
	})();

	// Runtime mutable flag controlled by UI toggle (default off)
	let aggregateEdgesEnabled = !!runtimeFlags.aggregateEdges;

	function nodeIsHidden(id) {
		const entry = nodeMeta.nodes.get(id);
		// Treat missing nodes as hidden so dependent edges are filtered out
		if (!entry) return true;
		return !!entry.attrs.hidden || hiddenNodeIds.has(id);
	}

	function edgeIsHidden(id) {
		const entry = edgeMeta.edges.get(id);
		if (!entry) return true;
		if (hiddenEdgeIds.has(id)) return true;
		if (entry.attrs && entry.attrs.hidden) return true;
		// Hide if either endpoint is missing or hidden
		if (!nodeMeta.nodes.has(entry.source) || !nodeMeta.nodes.has(entry.target)) return true;
		if (nodeIsHidden(entry.source) || nodeIsHidden(entry.target)) return true;
		return false;
	}

	function buildNodeRecord(entry, id) {
		const { attrs, data } = entry;
		const label = deriveNodeLabel(attrs);
		const selected = selectedNodeIds.has(id) || !!attrs.selected;
		let pos = attrs && typeof attrs.position === 'object' ? attrs.position : null;
		// Safety: ensure every node has a position object to avoid consumers reading undefined.position
		if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
			pos = { x: 0, y: 0 };
		}
		const record = {
			id,
			label,
			data: { ...data, id, selected },
			size: deriveNodeSize(attrs, nodeMeta.minWeight, nodeMeta.maxWeight),
			fill: selected ? '#ef4444' : (attrs && attrs.color ? attrs.color : stringToColorHex(id)),
			labelVisible: !!label,
			cluster: attrs && attrs.cluster ? String(attrs.cluster) : undefined,
			icon: attrs && attrs.icon ? attrs.icon : undefined,
			position: { x: pos.x, y: pos.y },
		};
		return record;
	}

	function buildEdgeRecord(entry, id) {
		const { attrs, data, source, target } = entry;
		const label = deriveEdgeLabel(attrs);
		const selected = selectedEdgeIds.has(id) || !!attrs.selected;
		return {
			id,
			source,
			target,
			label,
			data: { ...data, id, source, target, selected },
			size: Math.max(selected ? deriveEdgeWidth(attrs, edgeMeta.minWeight, edgeMeta.maxWeight) * 1.8 : deriveEdgeWidth(attrs, edgeMeta.minWeight, edgeMeta.maxWeight), 0.75),
			fill: selected ? '#facc15' : (attrs && attrs.color ? attrs.color : 'rgba(30,41,59,0.65)'),
			dashed: !!attrs.dashed,
			subLabel: attrs && attrs.subLabel ? String(attrs.subLabel) : undefined,
		};
	}

	function rebuildNodeRecords() {
		nodeCacheIndices.clear();
		nodeRecords = [];
		nodeMeta.nodes.forEach((entry, id) => {
			if (nodeIsHidden(id)) return;
			const record = buildNodeRecord(entry, id);
			nodeCacheIndices.set(id, nodeRecords.length);
			nodeRecords.push(record);
		});
		renderNodeArray = nodeRecords;
	}

	function rebuildEdgeRecords() {
		edgeCacheIndices.clear();
		edgeRecords = [];
		let _skippedMissing = 0;
		edgeMeta.edges.forEach((entry, id) => {
			if (edgeIsHidden(id)) return;
			if (!nodeMeta.nodes.has(entry.source) || !nodeMeta.nodes.has(entry.target)) { _skippedMissing += 1; return; }
			const record = buildEdgeRecord(entry, id);
			edgeCacheIndices.set(id, edgeRecords.length);
			edgeRecords.push(record);
		});
		renderEdgeArray = edgeRecords;
		try { if (_skippedMissing) console.debug && console.debug('ReagraphAdapter: skipped edges with missing endpoints', _skippedMissing); } catch (e) {}
	}

	function updateNodeRecord(id) {
		const entry = nodeMeta.nodes.get(id);
		if (!entry || nodeIsHidden(id)) {
			nodesRequireFullSync = true;
			return;
		}
		const idx = nodeCacheIndices.get(id);
		if (idx === undefined || !nodeRecords[idx]) {
			nodesRequireFullSync = true;
			return;
		}
		const target = nodeRecords[idx];
		const { attrs, data } = entry;
		const label = deriveNodeLabel(attrs);
		const selected = selectedNodeIds.has(id) || !!attrs.selected;
		target.label = label;
		target.data = { ...data, id, selected };
		target.size = deriveNodeSize(attrs, nodeMeta.minWeight, nodeMeta.maxWeight);
		target.fill = selected ? '#ef4444' : (attrs && attrs.color ? attrs.color : stringToColorHex(id));
		target.labelVisible = !!label;
		target.cluster = attrs && attrs.cluster ? String(attrs.cluster) : undefined;
		target.icon = attrs && attrs.icon ? attrs.icon : undefined;
	}

	function updateEdgeRecord(id) {
		const entry = edgeMeta.edges.get(id);
		if (!entry || edgeIsHidden(id)) {
			edgesRequireFullSync = true;
			return;
		}
		const idx = edgeCacheIndices.get(id);
		if (idx === undefined || !edgeRecords[idx]) {
			edgesRequireFullSync = true;
			return;
		}
		const target = edgeRecords[idx];
		const { attrs, data, source, target: tgt } = entry;
		const label = deriveEdgeLabel(attrs);
		const selected = selectedEdgeIds.has(id) || !!attrs.selected;
		target.source = source;
		target.target = tgt;
		target.label = label;
		target.data = { ...data, id, source, target: tgt, selected };
		const width = deriveEdgeWidth(attrs, edgeMeta.minWeight, edgeMeta.maxWeight);
		target.size = Math.max(selected ? width * 1.8 : width, 0.75);
		target.fill = selected ? '#facc15' : (attrs && attrs.color ? attrs.color : 'rgba(30,41,59,0.65)');
		target.dashed = !!attrs.dashed;
		target.subLabel = attrs && attrs.subLabel ? String(attrs.subLabel) : undefined;
	}

	function prepareRenderData() {
		let changed = false;
		if (nodesRequireFullSync) {
			rebuildNodeRecords();
			dirtyNodeIds.clear();
			nodesRequireFullSync = false;
			changed = true;
		} else if (dirtyNodeIds.size) {
			dirtyNodeIds.forEach(updateNodeRecord);
			dirtyNodeIds.clear();
			changed = true;
		}
		if (edgesRequireFullSync) {
			rebuildEdgeRecords();
			dirtyEdgeIds.clear();
			edgesRequireFullSync = false;
			changed = true;
		} else if (dirtyEdgeIds.size) {
			dirtyEdgeIds.forEach(updateEdgeRecord);
			dirtyEdgeIds.clear();
			changed = true;
		}
		if (changed) graphVersion += 1;
	}

	function cancelScheduledRender() {
		if (rafHandle && supportsRaf) {
			window.cancelAnimationFrame(rafHandle);
		}
		if (idleHandle && supportsIdle) {
			window.cancelIdleCallback(idleHandle);
		}
		rafHandle = null;
		idleHandle = null;
		renderQueued = false;
	}

	function performRender(forceFullSync = false) {
		if (disposed) return;
		if (forceFullSync) {
			nodesRequireFullSync = true;
			edgesRequireFullSync = true;
		}
		prepareRenderData();
		const nodeCount = renderNodeArray.length;
		// Only render edges whose endpoints are currently visible nodes
		const visibleNodeIds = new Set(renderNodeArray.map((n) => n.id));
		let safeEdgeArray = renderEdgeArray.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
		const edgeCount = safeEdgeArray.length;
		const heavyGraph = nodeCount > LARGE_NODE_THRESHOLD || edgeCount > LARGE_EDGE_THRESHOLD;
		const layoutType = mapLayoutNameToReagraph(currentLayoutName);
		const labelType = nodeCount > LABEL_SWITCH_THRESHOLD ? 'hover' : 'all';
		const graphSnapshot = runtimeFlags.noGraph ? null : buildGraphSnapshot(renderNodeArray, safeEdgeArray);

		// Debug diagnostics: validate edges/nodes and expose a snapshot for inspection
		if (isDebugEnabled) {
			try {
				// Detect and log any invalid edges (should be none)
				const allEdgeProblems = [];
				renderEdgeArray.forEach((e) => {
					if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) {
						allEdgeProblems.push({ id: e.id, source: e.source, target: e.target });
					}
				});
				// Count nodes with preset positions
				let nodesWithPos = 0;
				let nodesWithDataPos = 0;
				renderNodeArray.forEach((n) => {
					if (n && n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number') nodesWithPos += 1;
					if (n && n.data && typeof n.data.x === 'number' && typeof n.data.y === 'number') nodesWithDataPos += 1;
				});
				const debugObj = {
					timestamp: Date.now(),
					counts: { nodes: nodeCount, edges: edgeCount, allEdgesBeforeSafeFilter: renderEdgeArray.length },
					positions: { nodesWithPos, nodesWithDataPos },
					firstNodes: renderNodeArray.slice(0, 5).map((n) => ({ id: n.id, position: n.position })),
					firstEdges: safeEdgeArray.slice(0, 5).map((e) => ({ id: e.id, source: e.source, target: e.target })),
					invalidEdges: allEdgeProblems.slice(0, 20),
					visibleNodeIdsSample: Array.from(visibleNodeIds).slice(0, 20),
					layoutType,
					heavyGraph,
					graphVersion,
				};
				if (typeof window !== 'undefined') {
					window.__REAGRAPH_DEBUG_LAST__ = debugObj;
					if (!window.reagraphDebugDump) window.reagraphDebugDump = () => window.__REAGRAPH_DEBUG_LAST__;
				}
				if (allEdgeProblems.length) {
					// Log once per render cycle for visibility
					try { console.warn && console.warn('Reagraph DEBUG: edges referencing non-visible nodes', { count: allEdgeProblems.length, sample: debugObj.invalidEdges }); } catch (e) {}
				}
			} catch (e) {}
		}
		let layout = undefined;
		try {
			if (!runtimeFlags.noGraph && graphSnapshot && runtimeReagraph && typeof runtimeReagraph.layoutProvider === 'function') {
				const iterations = heavyGraph ? 500 : 800;
				layout = runtimeReagraph.layoutProvider({ type: layoutType, graph: graphSnapshot, iterations });
			}
		} catch (e) { layout = undefined; }
		const element = React.createElement(GraphCanvas, {
			key: `real-reagraph-canvas-${graphVersion}`,
			ref: attachCanvasRef,
			nodes: renderNodeArray,
			edges: safeEdgeArray,
			graph: graphSnapshot || undefined,
			layout,
			layoutType,
			animated: !heavyGraph,
			aggregateEdges: !!aggregateEdgesEnabled,
			labelType,
			edgeLabelPosition: 'center',
			graphVersion,
			onNodeClick: (node) => {
				try {
					if (!node || !node.id) return;
					const id = String(node.id);
					if (selectedNodeIds.has(id)) unselectNode(id);
					else selectNode(id);
				} catch (err) {}
			},
			onEdgeClick: (edge) => {
				try {
					if (!edge || !edge.id) return;
					const id = String(edge.id);
					if (selectedEdgeIds.has(id)) unselectEdge(id);
					else selectEdge(id);
				} catch (err) {}
			},
			onCanvasClick: () => {
				clearSelection();
			},
			onLassoEnd: (ids) => {
				if (!ids || !ids.length) return;
				ids.forEach((id) => {
					try { selectNode(String(id)); } catch (err) {}
				});
			},
		});
		root.render(element);

		// Attach a WebGL context lost listener for debugging if possible
		if (isDebugEnabled) {
			try {
				const canvas = container.querySelector('canvas');
				if (canvas && !canvas.__reagraphCtxLostHook) {
					canvas.addEventListener('webglcontextlost', (ev) => {
						try { console.warn && console.warn('Reagraph DEBUG: WebGL context lost', ev); } catch (e) {}
						if (typeof window !== 'undefined') {
							window.__REAGRAPH_DEBUG_LAST__ = Object.assign({}, window.__REAGRAPH_DEBUG_LAST__ || {}, { webglContextLost: true, webglEvent: { type: ev && ev.type } });
						}
					});
					canvas.__reagraphCtxLostHook = true;
				}
			} catch (e) {}
		}
	}

	function scheduleRender(forceFullSync = false) {
		if (disposed) return;
		if (forceFullSync) {
			nodesRequireFullSync = true;
			edgesRequireFullSync = true;
		}
		if (renderQueued) return;
		renderQueued = true;
		const run = () => {
			renderQueued = false;
			rafHandle = null;
			idleHandle = null;
			performRender();
		};
		const totalElements = nodeMeta.nodes.size + edgeMeta.edges.size;
		if (supportsIdle && totalElements > LARGE_NODE_THRESHOLD) {
			idleHandle = window.requestIdleCallback(run, { timeout: MAX_IDLE_DELAY_MS });
			return;
		}
		if (supportsRaf) {
			rafHandle = window.requestAnimationFrame(run);
			return;
		}
		run();
	}

	function attachCanvasRef(instance) {
		canvasRef.current = instance;
		if (!instance) return;
		try {
			const controls = instance.getControls && instance.getControls();
			if (controls && baseDistance == null) {
				baseDistance = controls.distance || 1;
				zoomLevel = 1;
			}
		} catch (err) {
			baseDistance = baseDistance || 1;
		}
	}

	function getControls() {
		if (!canvasRef.current || typeof canvasRef.current.getControls !== 'function') return null;
		try { return canvasRef.current.getControls(); } catch (err) { return null; }
	}

	function getZoom() {
		const controls = getControls();
		if (controls) {
			if (baseDistance == null) baseDistance = controls.distance || 1;
			const dist = controls.distance || baseDistance || 1;
			const computed = baseDistance / dist;
			if (Number.isFinite(computed) && computed > 0) zoomLevel = computed;
		}
		return zoomLevel;
	}

	function setZoom(value) {
		const target = Number(value);
		if (!Number.isFinite(target) || target <= 0) return getZoom();
		const controls = getControls();
		if (!controls) {
			zoomLevel = target;
			return zoomLevel;
		}
		if (baseDistance == null) baseDistance = controls.distance || 1;
		const rawDist = baseDistance / target;
		const clamped = Math.max(controls.minDistance || rawDist, Math.min(controls.maxDistance || rawDist, rawDist));
		try {
			controls.distance = clamped;
		} catch (err) {}
		zoomLevel = target;
		return zoomLevel;
	}

	function markNodeDirty(id) {
		if (!id) return;
		dirtyNodeIds.add(String(id));
		if (!renderQueued) scheduleRender();
	}

	function markEdgeDirty(id) {
		if (!id) return;
		dirtyEdgeIds.add(String(id));
		if (!renderQueued) scheduleRender();
	}

	function refreshNodeWeights() {
		recomputeNodeWeights(nodeMeta);
		nodesRequireFullSync = true;
	}

	function refreshEdgeWeights() {
		recomputeEdgeWeights(edgeMeta);
		edgesRequireFullSync = true;
	}

	function selectNode(id, opts = {}) {
		const entry = nodeMeta.nodes.get(id);
		if (!entry) return false;
		if (selectedNodeIds.has(id) && !opts.force) return false;
		selectedNodeIds.add(id);
		entry.attrs.selected = true;
		entry.data.selected = true;
		markNodeDirty(id);
		if (!opts.silent && SelectionManager) {
			const payload = makeSelectionPayload(id, 'node');
			const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `node:${id}`;
			if (key) {
				localSelectionKeys.add(key);
				try { SelectionManager.select(payload); } catch (err) {}
			}
		}
		emitEvent('select', { type: 'select', target: { id } });
		return true;
	}

	function unselectNode(id, opts = {}) {
		const entry = nodeMeta.nodes.get(id);
		if (!entry) return false;
		if (!selectedNodeIds.has(id) && !opts.force) return false;
		selectedNodeIds.delete(id);
		if (entry.attrs) delete entry.attrs.selected;
		if (entry.data) delete entry.data.selected;
		markNodeDirty(id);
		if (!opts.silent && SelectionManager) {
			const payload = makeSelectionPayload(id, 'node');
			const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `node:${id}`;
			if (key) {
				localSelectionKeys.add(key);
				try { SelectionManager.unselect(payload); } catch (err) {}
			}
		}
		emitEvent('unselect', { type: 'unselect', target: { id } });
		return true;
	}

	function selectEdge(id, opts = {}) {
		const entry = edgeMeta.edges.get(id);
		if (!entry) return false;
		if (selectedEdgeIds.has(id) && !opts.force) return false;
		selectedEdgeIds.add(id);
		entry.attrs.selected = true;
		entry.data.selected = true;
		markEdgeDirty(id);
		if (!opts.silent && SelectionManager) {
			const payload = makeSelectionPayload(id, 'edge', entry);
			const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `edge:${id}`;
			if (key) {
				localSelectionKeys.add(key);
				try { SelectionManager.select(payload); } catch (err) {}
			}
		}
		emitEvent('select', { type: 'select', target: { id } });
		return true;
	}

	function unselectEdge(id, opts = {}) {
		const entry = edgeMeta.edges.get(id);
		if (!entry) return false;
		if (!selectedEdgeIds.has(id) && !opts.force) return false;
		selectedEdgeIds.delete(id);
		if (entry.attrs) delete entry.attrs.selected;
		if (entry.data) delete entry.data.selected;
		markEdgeDirty(id);
		if (!opts.silent && SelectionManager) {
			const payload = makeSelectionPayload(id, 'edge', entry);
			const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(payload) : `edge:${id}`;
			if (key) {
				localSelectionKeys.add(key);
				try { SelectionManager.unselect(payload); } catch (err) {}
			}
		}
		emitEvent('unselect', { type: 'unselect', target: { id } });
		return true;
	}

	function clearSelection(opts = {}) {
		nodeMeta.nodes.forEach((_, id) => {
			if (selectedNodeIds.has(id)) unselectNode(id, { silent: true });
		});
		edgeMeta.edges.forEach((_, id) => {
			if (selectedEdgeIds.has(id)) unselectEdge(id, { silent: true });
		});
		if (!opts.silent && SelectionManager) {
			try { SelectionManager.clear(); } catch (err) {}
		}
		scheduleRender();
	}

	function makeNodeWrapper(id) {
		if (nodeWrappers.has(id)) return nodeWrappers.get(id);
		const wrapper = {
			id: () => id,
			data: (key, value) => {
				const entry = nodeMeta.nodes.get(id);
				if (!entry) return undefined;
				if (typeof key === 'undefined') return { ...(entry.data || {}) };
				if (typeof value === 'undefined') return entry.data ? entry.data[key] : undefined;
				if (!entry.data) entry.data = {};
				entry.data[key] = value;
				entry.attrs[key] = value;
				if (key === 'weight') refreshNodeWeights();
				if (key === 'hidden') {
					if (value) hiddenNodeIds.add(id); else hiddenNodeIds.delete(id);
					nodesRequireFullSync = true;
				}
				if (key === 'selected') {
					if (value) selectNode(id, { silent: true }); else unselectNode(id, { silent: true });
				}
				if (key !== 'hidden') markNodeDirty(id);
				scheduleRender();
				return value;
			},
			json: () => {
				const entry = nodeMeta.nodes.get(id);
				return { data: { ...(entry ? entry.data : {}) } };
			},
			isNode: () => true,
			select: () => selectNode(id),
			unselect: () => unselectNode(id),
			addClass: (cls) => {
				if (cls === 'hidden') {
					hiddenNodeIds.add(id);
					nodesRequireFullSync = true;
				}
				if (cls === 'selected') selectNode(id);
				scheduleRender();
			},
			removeClass: (cls) => {
				if (cls === 'hidden') {
					hiddenNodeIds.delete(id);
					nodesRequireFullSync = true;
				}
				if (cls === 'selected') unselectNode(id);
				scheduleRender();
			},
			hasClass: (cls) => {
				if (cls === 'hidden') return nodeIsHidden(id);
				if (cls === 'selected') return selectedNodeIds.has(id);
				return false;
			},
		};
		nodeWrappers.set(id, wrapper);
		return wrapper;
	}

	function makeEdgeWrapper(id) {
		if (edgeWrappers.has(id)) return edgeWrappers.get(id);
		const wrapper = {
			id: () => id,
			data: (key, value) => {
				const entry = edgeMeta.edges.get(id);
				if (!entry) return undefined;
				if (typeof key === 'undefined') return { ...(entry.data || {}) };
				if (typeof value === 'undefined') return entry.data ? entry.data[key] : undefined;
				if (!entry.data) entry.data = {};
				entry.data[key] = value;
				entry.attrs[key] = value;
				if (key === 'weight' || key === 'width') refreshEdgeWeights();
				if (key === 'hidden') {
					if (value) hiddenEdgeIds.add(id); else hiddenEdgeIds.delete(id);
					edgesRequireFullSync = true;
				}
				if (key === 'selected') {
					if (value) selectEdge(id, { silent: true }); else unselectEdge(id, { silent: true });
				}
				if (key !== 'hidden') markEdgeDirty(id);
				scheduleRender();
				return value;
			},
			json: () => {
				const entry = edgeMeta.edges.get(id);
				return { data: { ...(entry ? entry.data : {}) } };
			},
			isNode: () => false,
			select: () => selectEdge(id),
			unselect: () => unselectEdge(id),
			addClass: (cls) => {
				if (cls === 'hidden') {
					hiddenEdgeIds.add(id);
					edgesRequireFullSync = true;
				}
				if (cls === 'selected') selectEdge(id);
				scheduleRender();
			},
			removeClass: (cls) => {
				if (cls === 'hidden') {
					hiddenEdgeIds.delete(id);
					edgesRequireFullSync = true;
				}
				if (cls === 'selected') unselectEdge(id);
				scheduleRender();
			},
			source: () => ({ id: () => (edgeMeta.edges.get(id) ? edgeMeta.edges.get(id).source : undefined) }),
			target: () => ({ id: () => (edgeMeta.edges.get(id) ? edgeMeta.edges.get(id).target : undefined) }),
			hasClass: (cls) => {
				if (cls === 'hidden') return edgeIsHidden(id);
				if (cls === 'selected') return selectedEdgeIds.has(id);
				return false;
			},
		};
		edgeWrappers.set(id, wrapper);
		return wrapper;
	}

	function nodesCollection() {
		const arr = [];
		nodeMeta.nodes.forEach((_, id) => arr.push(makeNodeWrapper(id)));
		return arr;
	}

	function edgesCollection() {
		const arr = [];
		edgeMeta.edges.forEach((_, id) => arr.push(makeEdgeWrapper(id)));
		return arr;
	}

	function elementsCollection() {
		return nodesCollection().concat(edgesCollection());
	}

	performRender(true);

	const selectionHandlers = [];
	if (SelectionManager) {
		selectionHandlers.push(SelectionManager.on('select', ({ element } = {}) => {
			if (!element || !element.data) return;
			const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(element) : null;
			if (key && localSelectionKeys.has(key)) {
				localSelectionKeys.delete(key);
				return;
			}
			if (element.data.source != null || element.data.target != null) {
				const id = String(element.data.id || `${element.data.source}-${element.data.target}`);
				selectEdge(id, { silent: true, force: true });
			} else if (element.data.id != null) {
				const id = String(element.data.id);
				selectNode(id, { silent: true, force: true });
			}
			scheduleRender();
		}));
		selectionHandlers.push(SelectionManager.on('unselect', ({ element } = {}) => {
			if (!element || !element.data) return;
			const key = SelectionManager.canonicalKey ? SelectionManager.canonicalKey(element) : null;
			if (key && localSelectionKeys.has(key)) {
				localSelectionKeys.delete(key);
				return;
			}
			if (element.data.source != null || element.data.target != null) {
				const id = String(element.data.id || `${element.data.source}-${element.data.target}`);
				unselectEdge(id, { silent: true, force: true });
			} else if (element.data.id != null) {
				const id = String(element.data.id);
				unselectNode(id, { silent: true, force: true });
			}
			scheduleRender();
		}));
		selectionHandlers.push(SelectionManager.on('clear', () => {
			clearSelection({ silent: true });
		}));
	}

	const eventHandlers = {};
	function emitEvent(event, payload) {
		const handlers = eventHandlers[event];
		if (!handlers || !handlers.length) return;
		handlers.forEach((fn) => {
			try { fn(payload); } catch (err) {}
		});
	}

	const adapter = {
		impl: 'reagraph',
		noop: false,
		getInstance: () => canvasRef.current,
		getAggregateEdges() { return !!aggregateEdgesEnabled; },
		setAggregateEdges(value) {
			try {
				aggregateEdgesEnabled = !!value;
				// Render with new prop value; no need for full sync
				performRender(false);
				return aggregateEdgesEnabled;
			} catch (e) { return aggregateEdgesEnabled; }
		},
		on(event, handler) {
			if (!handler || typeof handler !== 'function') return;
			if (!eventHandlers[event]) eventHandlers[event] = [];
			eventHandlers[event].push(handler);
		},
		off(event, handler) {
			if (!eventHandlers[event]) return;
			eventHandlers[event] = eventHandlers[event].filter((fn) => fn !== handler);
		},
		fit() {
			try { if (canvasRef.current && typeof canvasRef.current.fitNodesInView === 'function') canvasRef.current.fitNodesInView(); } catch (err) {}
		},
		center() {
			try { if (canvasRef.current && typeof canvasRef.current.centerGraph === 'function') canvasRef.current.centerGraph(); } catch (err) {}
		},
		resize() {
			performRender(true);
		},
		zoom(value) {
			if (typeof value === 'undefined') return getZoom();
			return setZoom(value);
		},
		nodes: () => nodesCollection(),
		edges: () => edgesCollection(),
		elements: () => elementsCollection(),
		select(id) {
			if (nodeMeta.nodes.has(String(id))) return selectNode(String(id));
			if (edgeMeta.edges.has(String(id))) return selectEdge(String(id));
			return false;
		},
		unselect(id) {
			if (nodeMeta.nodes.has(String(id))) return unselectNode(String(id));
			if (edgeMeta.edges.has(String(id))) return unselectEdge(String(id));
			return false;
		},
		unselectAll() {
			clearSelection({ silent: false });
		},
		filter(selector) {
			if (!selector) return [];
			if (selector === 'node') return nodesCollection();
			if (selector === 'edge') return edgesCollection();
			if (selector === ':selected') {
				const res = [];
				selectedNodeIds.forEach((id) => res.push(makeNodeWrapper(id)));
				selectedEdgeIds.forEach((id) => res.push(makeEdgeWrapper(id)));
				return res;
			}
			const match = selector.match(/id\s*=\s*['"]([^'"]+)['"]/);
			if (match) {
				const id = match[1];
				if (nodeMeta.nodes.has(id)) return [makeNodeWrapper(id)];
				if (edgeMeta.edges.has(id)) return [makeEdgeWrapper(id)];
			}
			return [];
		},
		add(elementsToAdd = []) {
			try {
				const { nodes = [], edges = [] } = cyToGraph(elementsToAdd);
				nodes.forEach((n) => {
					const id = String(n.id);
					if (!id) return;
					const attrs = { ...(n.attrs || {}) };
					nodeMeta.nodes.set(id, { id, attrs, data: { ...attrs } });
				});
				edges.forEach((e) => {
					const id = String(e.id || `${e.source}-${e.target}`);
					// Skip edges referencing endpoints that are not present
					if (!nodeMeta.nodes.has(String(e.source)) || !nodeMeta.nodes.has(String(e.target))) return;
					const attrs = { ...(e.attrs || {}) };
					edgeMeta.edges.set(id, { id, source: String(e.source), target: String(e.target), attrs, data: { ...attrs } });
				});
				if (nodes.length) refreshNodeWeights();
				if (edges.length) refreshEdgeWeights();
				nodesRequireFullSync = true;
				edgesRequireFullSync = true;
				scheduleRender();
			} catch (err) {}
		},
		remove(elementsToRemove = []) {
			elementsToRemove.forEach((el) => {
				const id = el && el.data && el.data.id ? String(el.data.id) : null;
				if (!id) return;
				if (nodeMeta.nodes.delete(id)) {
					selectedNodeIds.delete(id);
					hiddenNodeIds.delete(id);
				}
				if (edgeMeta.edges.delete(id)) {
					selectedEdgeIds.delete(id);
					hiddenEdgeIds.delete(id);
				}
			});
			refreshNodeWeights();
			refreshEdgeWeights();
			nodesRequireFullSync = true;
			edgesRequireFullSync = true;
			scheduleRender();
		},
		layout(layoutOptions) {
			return {
				run: () => {
					if (layoutOptions && layoutOptions.name) {
						const name = String(layoutOptions.name);
						adapter._layoutName = name;
						currentLayoutName = name;
					}
					scheduleRender();
				},
				on: () => {},
			};
		},
		destroy() {
			disposed = true;
			cancelScheduledRender();
			try { selectionHandlers.forEach((off) => { if (typeof off === 'function') off(); }); } catch (err) {}
			// Prefer clearing the rendered tree but keep the root attached to avoid duplicate createRoot warnings
			try { setTimeout(() => { try { root.render(null); } catch (err) {} }, 0); } catch (err) {}
		},
	};

	adapter.container = container;
	adapter._root = root;
	adapter._layoutName = currentLayoutName;

	return adapter;
}

export const mount = mountRealReagraphAdapter;

export default { mount: mountRealReagraphAdapter, mountRealReagraphAdapter };
