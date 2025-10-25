#!/usr/bin/env node
/*
 * Build a fine-grained dependency graph for the Topogram codebase.
 * The script traverses JS/JSX sources, extracts module imports and
 * function declarations, and then records call relationships between
 * functions when possible. The resulting graph is exported as both a
 * JSON file (Topogram-style { nodes, edges }) and a CSV compatible with
 * the existing sample datasets.
 */

const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const Papa = require('papaparse')

const PROJECT_ROOT = path.join(__dirname, '..')
const SOURCE_ROOTS = ['imports', 'client', 'server', 'mapappbuilder']
const OUTPUT_JSON = path.join(PROJECT_ROOT, 'samples', 'dependency_graph_topogram_code.json')
const OUTPUT_CSV = path.join(PROJECT_ROOT, 'samples', 'dependency_graph_topogram_code.csv')

const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']
const INDEX_FILES = JS_EXTENSIONS.map(ext => `index${ext}`)
const PARSER_PLUGINS = [
	'jsx',
	'classProperties',
	'classPrivateProperties',
	'classPrivateMethods',
	'decorators-legacy',
	'dynamicImport',
	'importAssertions',
	'objectRestSpread',
	'optionalCatchBinding',
	'optionalChaining',
	'nullishCoalescingOperator',
	'topLevelAwait'
]

const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'.meteor',
	'vendor',
	'exports',
	'.sandboxapp'
])

let anonymousFunctionCounter = 0

function collectSourceFiles() {
	const files = []
	for (const root of SOURCE_ROOTS) {
		const abs = path.join(PROJECT_ROOT, root)
		if (!fs.existsSync(abs)) continue
		walk(abs, filePath => {
			const ext = path.extname(filePath)
			if (JS_EXTENSIONS.includes(ext)) {
				files.push(filePath)
			}
		})
	}
	return files
}

function walk(dir, onFile) {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	for (const entry of entries) {
		if (IGNORED_DIRS.has(entry.name)) continue
		const abs = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			walk(abs, onFile)
		} else if (entry.isFile()) {
			onFile(abs)
		}
	}
}

function parseSource(code, filePath) {
	try {
		return parser.parse(code, {
			sourceType: 'unambiguous',
			plugins: PARSER_PLUGINS
		})
	} catch (err) {
		console.error(`Failed to parse ${filePath}: ${err.message}`)
		return null
	}
}

function normalisePath(p) {
	return p.split(path.sep).join('/')
}

function ensureExtension(candidate) {
	if (JS_EXTENSIONS.includes(path.extname(candidate))) return candidate
	for (const ext of JS_EXTENSIONS) {
		const withExt = candidate + ext
		if (fs.existsSync(withExt)) return withExt
	}
	return null
}

function resolveImport(importer, source) {
	if (!source.startsWith('.')) {
		return { type: 'package', target: source }
	}
	const importerDir = path.dirname(importer)
	const attemptBase = path.resolve(PROJECT_ROOT, importerDir, source)

	const direct = ensureExtension(attemptBase)
	if (direct) {
		const rel = normalisePath(path.relative(PROJECT_ROOT, direct))
		return { type: 'module', target: rel }
	}

	if (fs.existsSync(attemptBase) && fs.statSync(attemptBase).isDirectory()) {
		for (const indexName of INDEX_FILES) {
			const candidate = path.join(attemptBase, indexName)
			if (fs.existsSync(candidate)) {
				const rel = normalisePath(path.relative(PROJECT_ROOT, candidate))
				return { type: 'module', target: rel }
			}
		}
	}

	return { type: 'unresolved', target: source }
}

function createModuleInfo(relPath) {
	return {
		id: `module:${relPath}`,
		path: relPath,
		imports: new Set(),
		importMap: new Map(),
		functions: new Map(),
		functionBindings: new Map(),
		functionNodes: new Map(),
		exports: new Set(),
		hasDefaultExport: false,
		errors: []
	}
}

function ensureFunction(moduleInfo, name, kind, loc, meta = {}) {
	let baseName = name || `anonymous_${++anonymousFunctionCounter}`
	const keyBase = `function:${moduleInfo.path}::${baseName}`
	let key = keyBase
	let attempt = 1
	while (moduleInfo.functions.has(key)) {
		attempt += 1
		key = `${keyBase}#${attempt}`
	}
	const fnInfo = {
		id: key,
		moduleId: moduleInfo.id,
		modulePath: moduleInfo.path,
		name: baseName,
		kind,
		loc,
		exported: false,
		isDefaultExport: false,
		calls: new Set(),
		meta
	}
	moduleInfo.functions.set(key, fnInfo)
	return fnInfo
}

function addCallEdge(moduleInfo, fromId, toId) {
	if (!fromId || !toId) return
	if (!moduleInfo.functions.has(fromId)) return
	const fnInfo = moduleInfo.functions.get(fromId)
	fnInfo.calls.add(toId)
}

function buildGraph() {
	const modules = new Map()
	const packageNodes = new Map()
	const assetNodes = new Map()
	const moduleEdges = new Set()
	const packageEdges = new Set()
	const unresolvedEdges = new Set()

	const files = collectSourceFiles()

	for (const absPath of files) {
		const relPath = normalisePath(path.relative(PROJECT_ROOT, absPath))
		const code = fs.readFileSync(absPath, 'utf8')
		const ast = parseSource(code, relPath)
		const moduleInfo = modules.get(relPath) || createModuleInfo(relPath)
		modules.set(relPath, moduleInfo)
		if (!ast) {
			moduleInfo.errors.push('parse-error')
			continue
		}

		const importLocalNames = new Map()

		traverse(ast, {
			ImportDeclaration(pathNode) {
				const source = pathNode.node.source.value
				const resolved = resolveImport(relPath, source)
				for (const specifier of pathNode.node.specifiers) {
					const localName = specifier.local.name
					const importedName = specifier.type === 'ImportDefaultSpecifier'
						? 'default'
						: specifier.type === 'ImportNamespaceSpecifier'
							? '*'
							: specifier.imported && specifier.imported.name
					importLocalNames.set(localName, { ...resolved, importedName })
					moduleInfo.importMap.set(localName, { ...resolved, importedName })
				}

				if (resolved.type === 'module') {
					moduleInfo.imports.add(resolved.target)
					moduleEdges.add(`${moduleInfo.id}|module:${resolved.target}`)
				} else if (resolved.type === 'package') {
					packageNodes.set(resolved.target, {
						id: `package:${resolved.target}`,
						name: resolved.target,
						type: 'package'
					})
					packageEdges.add(`${moduleInfo.id}|package:${resolved.target}`)
				} else {
					unresolvedEdges.add(`${moduleInfo.id}|${resolved.target}`)
				}

				if (pathNode.node.specifiers.length === 0) {
					// side-effect import
					if (resolved.type === 'module') moduleInfo.imports.add(resolved.target)
				}
			},

			FunctionDeclaration(pathNode) {
				const { id, loc } = pathNode.node
				const name = id ? id.name : null
				const fnInfo = ensureFunction(moduleInfo, name, 'function', loc)
				moduleInfo.functionNodes.set(pathNode.node, fnInfo.id)
				const binding = pathNode.scope.getBinding(name)
				if (binding) {
					moduleInfo.functionBindings.set(binding.path.node, fnInfo.id)
				}
			},

			VariableDeclarator(pathNode) {
				const { id, init } = pathNode.node
				if (!init) return
				const isFunction = init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression'
				if (!isFunction) return
				if (id.type !== 'Identifier') return
				const name = id.name
				const loc = init.loc || pathNode.node.loc
				const fnInfo = ensureFunction(moduleInfo, name, init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function', loc)
				moduleInfo.functionNodes.set(init, fnInfo.id)
				moduleInfo.functionNodes.set(pathNode.node, fnInfo.id)
				const binding = pathNode.scope.getBinding(name)
				if (binding) {
					moduleInfo.functionBindings.set(binding.path.node, fnInfo.id)
				} else {
					moduleInfo.functionBindings.set(pathNode.node, fnInfo.id)
				}
			},

			ExportNamedDeclaration(pathNode) {
				const { declaration, specifiers } = pathNode.node
				if (declaration && declaration.type === 'FunctionDeclaration') {
					const fnNode = declaration
					const fnName = fnNode.id ? fnNode.id.name : null
					const binding = fnName && pathNode.scope.getBinding(fnName)
					let fnId = null
					if (binding && moduleInfo.functionBindings.has(binding.path.node)) {
						fnId = moduleInfo.functionBindings.get(binding.path.node)
					} else if (fnNode && moduleInfo.functionNodes.has(fnNode)) {
						fnId = moduleInfo.functionNodes.get(fnNode)
					}
					if (fnId && moduleInfo.functions.has(fnId)) {
						moduleInfo.functions.get(fnId).exported = true
						moduleInfo.exports.add(moduleInfo.functions.get(fnId).name)
					}
				}
				for (const spec of specifiers) {
					const localName = spec.local.name
					const binding = pathNode.scope.getBinding(localName)
					if (binding && moduleInfo.functionBindings.has(binding.path.node)) {
						const fnId = moduleInfo.functionBindings.get(binding.path.node)
						const fnInfo = moduleInfo.functions.get(fnId)
						if (fnInfo) {
							fnInfo.exported = true
							moduleInfo.exports.add(fnInfo.name)
						}
					}
				}
			},

			ExportDefaultDeclaration(pathNode) {
				const decl = pathNode.node.declaration
				moduleInfo.hasDefaultExport = true
				if (!decl) return
				if (decl.type === 'FunctionDeclaration') {
					const fnName = decl.id ? decl.id.name : 'default'
					const binding = fnName !== 'default' ? pathNode.scope.getBinding(fnName) : null
					let fnId = null
					if (binding && moduleInfo.functionBindings.has(binding.path.node)) {
						fnId = moduleInfo.functionBindings.get(binding.path.node)
					} else if (moduleInfo.functionNodes.has(decl)) {
						fnId = moduleInfo.functionNodes.get(decl)
					} else {
						const created = ensureFunction(moduleInfo, fnName, 'function', decl.loc)
						fnId = created.id
						moduleInfo.functionNodes.set(decl, fnId)
					}
					if (fnId && moduleInfo.functions.has(fnId)) {
						const fnInfo = moduleInfo.functions.get(fnId)
						fnInfo.exported = true
						fnInfo.isDefaultExport = true
						moduleInfo.exports.add(fnInfo.name)
					}
				} else if (decl.type === 'Identifier') {
					const binding = pathNode.scope.getBinding(decl.name)
					if (binding && moduleInfo.functionBindings.has(binding.path.node)) {
						const fnId = moduleInfo.functionBindings.get(binding.path.node)
						const fnInfo = moduleInfo.functions.get(fnId)
						if (fnInfo) {
							fnInfo.exported = true
							fnInfo.isDefaultExport = true
							moduleInfo.exports.add(fnInfo.name)
						}
					}
				}
			},

			CallExpression(pathNode) {
				const calleePath = pathNode.get('callee')
				const funcParent = pathNode.getFunctionParent()
				let fromId = null
				if (funcParent) {
					const targetNode = funcParent.node
					fromId = moduleInfo.functionNodes.get(targetNode)
					if (!fromId && funcParent.isFunctionExpression() && funcParent.parentPath && funcParent.parentPath.isVariableDeclarator()) {
						const parentNode = funcParent.parentPath.node
						fromId = moduleInfo.functionNodes.get(parentNode)
					}
				}

				if (!fromId) {
					fromId = moduleInfo.id
				}

				let targetFunctionId = null
				let targetModuleId = null
				let targetPackageId = null
				let targetUnresolved = null

				if (calleePath.isIdentifier()) {
					const name = calleePath.node.name
					const binding = pathNode.scope.getBinding(name)
					if (binding) {
						if (moduleInfo.functionBindings.has(binding.path.node)) {
							targetFunctionId = moduleInfo.functionBindings.get(binding.path.node)
						} else if (binding.path.isImportSpecifier() || binding.path.isImportDefaultSpecifier() || binding.path.isImportNamespaceSpecifier()) {
							const importInfo = moduleInfo.importMap.get(name)
							if (importInfo) {
								if (importInfo.type === 'module') targetModuleId = `module:${importInfo.target}`
								else if (importInfo.type === 'package') targetPackageId = `package:${importInfo.target}`
								else targetUnresolved = importInfo.target
							}
						}
					} else {
						targetUnresolved = name
					}
				} else if (calleePath.isMemberExpression()) {
					const object = calleePath.get('object')
					if (object.isIdentifier()) {
						const name = object.node.name
						const importInfo = moduleInfo.importMap.get(name)
						if (importInfo) {
							if (importInfo.type === 'module') targetModuleId = `module:${importInfo.target}`
							else if (importInfo.type === 'package') targetPackageId = `package:${importInfo.target}`
							else targetUnresolved = importInfo.target
						}
					}
				}

				if (targetFunctionId) {
					addCallEdge(moduleInfo, fromId, targetFunctionId)
				} else if (targetModuleId) {
					moduleEdges.add(`${fromId}|${targetModuleId}`)
				} else if (targetPackageId) {
					packageEdges.add(`${fromId}|${targetPackageId}`)
				} else if (targetUnresolved) {
					unresolvedEdges.add(`${fromId}|${targetUnresolved}`)
				}
			}
		})
	}

	return { modules, packageNodes, moduleEdges, packageEdges, unresolvedEdges }
}

function buildTransitiveEdges(modules) {
	const direct = new Map()
	for (const [relPath, moduleInfo] of modules) {
		const fromId = moduleInfo.id
		direct.set(fromId, new Set())
		for (const imported of moduleInfo.imports) {
			const targetId = `module:${imported}`
			direct.get(fromId).add(targetId)
		}
	}

	const transitive = []
	for (const [fromId, neighbours] of direct.entries()) {
		const visited = new Set([fromId])
		const queue = Array.from(neighbours).map(target => ({ target, depth: 1 }))
		while (queue.length) {
			const { target, depth } = queue.shift()
			if (visited.has(target)) continue
			visited.add(target)
			if (depth > 1) {
				transitive.push({ source: fromId, target, depth })
			}
			const next = direct.get(target)
			if (next && depth < 4) {
				for (const neighbour of next) {
					queue.push({ target: neighbour, depth: depth + 1 })
				}
			}
		}
	}
	return transitive
}

function emitGraph(data) {
	const { modules, packageNodes } = data
	const nodes = []
	const edges = []

	// Module nodes
	for (const [relPath, moduleInfo] of modules) {
		nodes.push({
			id: moduleInfo.id,
			label: moduleInfo.path,
			type: 'module',
			exports: Array.from(moduleInfo.exports),
			functionCount: moduleInfo.functions.size,
			hasDefaultExport: moduleInfo.hasDefaultExport,
			errors: moduleInfo.errors
		})

		for (const fnInfo of moduleInfo.functions.values()) {
			nodes.push({
				id: fnInfo.id,
				label: fnInfo.name,
				type: 'function',
				module: moduleInfo.id,
				kind: fnInfo.kind,
				exported: fnInfo.exported,
				isDefaultExport: fnInfo.isDefaultExport,
				calls: Array.from(fnInfo.calls)
			})

			for (const toId of fnInfo.calls) {
				edges.push({
					id: `${fnInfo.id}->${toId}`,
					type: 'function-call',
					source: fnInfo.id,
					target: toId,
					pathLength: 1
				})
			}
		}
	}

	// Module import edges
	const importEdgeSet = new Set()
	for (const [relPath, moduleInfo] of modules) {
		for (const imported of moduleInfo.imports) {
			const targetId = `module:${imported}`
			const edgeId = `${moduleInfo.id}->${targetId}`
			if (importEdgeSet.has(edgeId)) continue
			importEdgeSet.add(edgeId)
			edges.push({
				id: edgeId,
				type: 'module-import',
				source: moduleInfo.id,
				target: targetId,
				pathLength: 1
			})
		}
	}

	// Package nodes and edges
	for (const pkg of packageNodes.values()) {
		nodes.push({
			id: pkg.id,
			label: pkg.name,
			type: 'package'
		})
	}

	// Deduce package edges from module import map
	const packageEdgeSet = new Set()
	for (const [relPath, moduleInfo] of modules) {
		for (const [, importInfo] of moduleInfo.importMap.entries()) {
			if (importInfo.type === 'package') {
				const pkgId = `package:${importInfo.target}`
				const edgeId = `${moduleInfo.id}->${pkgId}`
				if (packageEdgeSet.has(edgeId)) continue
				packageEdgeSet.add(edgeId)
				edges.push({
					id: edgeId,
					type: 'package-import',
					source: moduleInfo.id,
					target: pkgId,
					pathLength: 1
				})
			}
		}
	}

	const transitive = buildTransitiveEdges(modules)
	for (const { source, target, depth } of transitive) {
		edges.push({
			id: `${source}->${target}::depth${depth}`,
			type: 'module-import-transitive',
			source,
			target,
			pathLength: depth
		})
	}

	return { nodes, edges }
}

function toTopogramCsv(graph) {
	const header = [
		'id', 'name', 'label', 'description', 'color', 'fillColor', 'weight', 'rawWeight', 'lat', 'lng', 'start', 'end', 'time', 'date', 'source', 'target', 'edgeLabel', 'edgeColor', 'edgeWeight', 'relationship', 'enlightement', 'emoji', 'extra'
	]

	const rows = []

	for (const node of graph.nodes) {
		rows.push({
			id: node.id,
			name: node.label,
			label: node.type === 'function' ? `${node.label}()` : node.label,
			description: node.type,
			color: node.type === 'module' ? '#1f77b4' : node.type === 'function' ? '#2ca02c' : '#7f7f7f',
			fillColor: '',
			weight: '',
			rawWeight: '',
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
			enlightement: node.type,
			emoji: '',
			extra: JSON.stringify(node)
		})
	}

	for (const edge of graph.edges) {
		rows.push({
			id: edge.id,
			name: edge.type,
			label: edge.type,
			description: edge.type,
			color: '#ff7f0e',
			fillColor: '',
			weight: '',
			rawWeight: '',
			lat: '',
			lng: '',
			start: '',
			end: '',
			time: '',
			date: '',
			source: edge.source,
			target: edge.target,
			edgeLabel: edge.type,
			edgeColor: '#ff7f0e',
			edgeWeight: edge.pathLength,
			relationship: edge.type,
			enlightement: edge.type,
			emoji: '',
			extra: JSON.stringify(edge)
		})
	}

	return Papa.unparse({ fields: header, data: rows.map(row => header.map(key => row[key] ?? '')) })
}

function main() {
	const data = buildGraph()
	const graph = emitGraph(data)

	fs.writeFileSync(OUTPUT_JSON, JSON.stringify(graph, null, 2), 'utf8')
	const csv = toTopogramCsv(graph)
	fs.writeFileSync(OUTPUT_CSV, csv, 'utf8')

	console.log(`Graph nodes: ${graph.nodes.length}`)
	console.log(`Graph edges: ${graph.edges.length}`)
	console.log(`JSON written to ${OUTPUT_JSON}`)
	console.log(`CSV written to ${OUTPUT_CSV}`)
}

main()

