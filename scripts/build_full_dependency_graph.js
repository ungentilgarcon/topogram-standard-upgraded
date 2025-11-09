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
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'samples')
const SOURCE_ROOTS = ['imports', 'client', 'server', 'mapappbuilder']
const DEFAULT_OUTPUT_BASE = 'dependency_graph_topogram_code'
const DEFAULT_OPTIONS = {
	outputBase: DEFAULT_OUTPUT_BASE,
	outputSuffix: '',
	includeFunctions: true,
	includeTransitive: true,
	transitiveDepth: 4,
	maxFunctions: null,
	targetNodes: null,
	excludeDirs: [],
	excludePackages: [],
	subgraphs: false,
	subgraphDepth: 3,
	subgraphLimit: null
	,
	chunkSize: null,
	chunkOnly: false,
	chunkBy: 'nodes', // 'nodes' (default contiguous) or 'module' (group by module)
	collapseMinified: false,
	minifiedNameMax: 4,
	collapseModules: false,
	collapseUmd: false,
	handleOrphans: 'placeholder', // 'placeholder' (default) | 'drop' | 'keep'
	orphanPrefix: 'missing:'
}

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

function parseArgs(argv) {
	const options = { ...DEFAULT_OPTIONS }
	let helpRequested = false
	const toExclude = []

	const normalized = [...argv]
	for (let i = 0; i < normalized.length; i += 1) {
		const raw = normalized[i]
		if (!raw.startsWith('--')) {
			console.warn(`Ignoring unexpected argument: ${raw}`)
			continue
		}
		if (raw === '--help' || raw === '-h') {
			helpRequested = true
			continue
		}

		const [flag, valueFromEquals] = raw.split('=', 2)
		let value = valueFromEquals
		if (value === undefined && i + 1 < normalized.length && !normalized[i + 1].startsWith('--')) {
			value = normalized[i + 1]
			i += 1
		}

		switch (flag) {
			case '--output-base':
				if (value) options.outputBase = value
				break
			case '--output-suffix':
				options.outputSuffix = value || ''
				break
			case '--exclude-dir':
			case '--exclude-dirs':
				if (value !== undefined) {
					const parts = value.split(',').map(part => part.trim()).filter(Boolean)
					toExclude.push(...parts)
				}
				break
			case '--exclude-packages':
				if (value !== undefined) {
					const parts = value.split(',').map(part => part.trim()).filter(Boolean)
					options.excludePackages.push(...parts)
				}
				break
			case '--subgraphs':
				options.subgraphs = value !== 'false'
				break
			case '--subgraph-depth':
				if (value !== undefined) {
					const pd = Number.parseInt(value, 10)
					if (!Number.isNaN(pd) && pd >= 0) options.subgraphDepth = pd
				}
				break
			case '--subgraph-limit':
				if (value !== undefined) {
					const pl = Number.parseInt(value, 10)
					if (!Number.isNaN(pl) && pl >= 0) options.subgraphLimit = pl
				}
				break
			case '--include-functions':
				options.includeFunctions = value !== 'false'
				break
			case '--no-functions':
				options.includeFunctions = false
				break
			case '--max-functions':
				if (value !== undefined) {
					const parsed = Number.parseInt(value, 10)
					if (!Number.isNaN(parsed)) options.maxFunctions = Math.max(parsed, 0)
				}
				break
			case '--target-nodes':
				if (value !== undefined) {
					const parsedTarget = Number.parseInt(value, 10)
					if (!Number.isNaN(parsedTarget)) options.targetNodes = Math.max(parsedTarget, 0)
				}
				break
			case '--include-transitive':
				options.includeTransitive = value !== 'false'
				break
			case '--no-transitive':
				options.includeTransitive = false
				break
			case '--transitive-depth':
				if (value !== undefined) {
					const parsedDepth = Number.parseInt(value, 10)
					if (!Number.isNaN(parsedDepth) && parsedDepth >= 1) options.transitiveDepth = parsedDepth
				}
				break
			case '--chunk-size':
				if (value !== undefined) {
					const parsed = Number.parseInt(value, 10)
					if (!Number.isNaN(parsed) && parsed > 0) options.chunkSize = parsed
				}
				break
			case '--chunk-by':
				if (value !== undefined) {
					const v = String(value).toLowerCase()
					if (v === 'nodes' || v === 'module') options.chunkBy = v
				}
				break
			case '--collapse-minified':
				options.collapseMinified = value !== 'false'
				break
			case '--minified-name-max':
				if (value !== undefined) {
					const parsed = Number.parseInt(value, 10)
					if (!Number.isNaN(parsed) && parsed >= 0) options.minifiedNameMax = parsed
				}
				break
			case '--collapse-umd':
				options.collapseUmd = value !== 'false'
				break
			case '--collapse-modules':
				options.collapseModules = value !== 'false'
				break
			case '--chunk-only':
				// boolean flag, accept --chunk-only or --chunk-only=false
				options.chunkOnly = value !== 'false'
				break
			case '--handle-orphans':
				if (value) {
					const v = String(value).toLowerCase()
					if (v === 'drop' || v === 'placeholder' || v === 'keep') options.handleOrphans = v
				}
				break
			case '--orphan-prefix':
				if (value !== undefined) options.orphanPrefix = String(value)
				break
			default:
				console.warn(`Ignoring unknown flag: ${flag}`)
		}
	}

	if (toExclude.length) {
		const unique = new Set()
		for (const rel of toExclude) {
			const abs = path.resolve(PROJECT_ROOT, rel)
			const withinProject = abs === PROJECT_ROOT || abs.startsWith(`${PROJECT_ROOT}${path.sep}`)
			if (!withinProject) {
				console.warn(`Skipping exclusion outside project root: ${rel}`)
				continue
			}
			unique.add(abs)
		}
		options.excludeDirs = Array.from(unique)
	}

	return { options, helpRequested }
}

function printHelp() {
	console.log(`Usage: node scripts/build_full_dependency_graph.js [options]\n\nOptions:\n  --output-base <name>        Base filename (default: ${DEFAULT_OUTPUT_BASE})\n  --output-suffix <suffix>    Suffix appended to the base name before extension\n  --exclude-dir <path>       Relative directory to exclude (repeat or comma-separate)\n  --max-functions <n>         Limit the number of function nodes included\n  --target-nodes <n>          Aim for at most N nodes (modules + packages + functions)\n  --no-functions              Exclude function nodes entirely\n  --include-functions=<bool>  Explicitly toggle function inclusion\n  --no-transitive             Skip transitive module edges\n  --include-transitive=<bool> Explicitly toggle transitive edges\n  --transitive-depth <n>      BFS depth for transitive module imports (default: 4)\n  --chunk-size <n>           Split output into parts of at most N nodes (optional)\n  --chunk-by <nodes|module>  Chunking strategy (default: nodes)\n  --chunk-only               Only write chunked part files and skip full combined output\n  --collapse-minified        Collapse short/minified function names (useful for vendor libs)\n  --minified-name-max <n>    Max length for a name to be considered minified (default: 4)\n  --collapse-modules         Collapse whole modules (vendor bundles) into single module node\n  --collapse-umd             Treat UMD bundles as vendor/minified and collapse them when enabled\n  --handle-orphans <mode>    What to do with edges to missing nodes: placeholder (default), drop, keep\n  --orphan-prefix <text>     Prefix label for placeholder nodes (default: 'missing:')\n  -h, --help                  Show this help message\n`)
}

function collectSourceFiles(options) {
	const files = []
	const excludedExact = new Set(options.excludeDirs || [])
	const excludedPrefixes = new Set((options.excludeDirs || []).map(abs => abs.endsWith(path.sep) ? abs : `${abs}${path.sep}`))

	const isExcluded = (absPath) => {
		if (excludedExact.has(absPath)) return true
		for (const prefix of excludedPrefixes) {
			if (absPath.startsWith(prefix)) return true
		}
		return false
	}

	for (const root of SOURCE_ROOTS) {
		const abs = path.join(PROJECT_ROOT, root)
		if (!fs.existsSync(abs)) continue
		if (isExcluded(abs)) continue
		walk(abs, filePath => {
			const ext = path.extname(filePath)
			if (JS_EXTENSIONS.includes(ext)) {
				files.push(filePath)
			}
		}, isExcluded)
	}
	return files
}

function walk(dir, onFile, isExcluded) {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	for (const entry of entries) {
		if (IGNORED_DIRS.has(entry.name)) continue
		const abs = path.join(dir, entry.name)
		if (isExcluded(abs)) continue
		if (entry.isDirectory()) {
			walk(abs, onFile, isExcluded)
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

function addCallEdge(moduleInfo, fromId, targetId) {
	if (!fromId || !targetId) return
	// fromId is usually a function id like 'function:...'; if it's a module id we skip
	try {
		if (moduleInfo.functions.has(fromId)) {
			const fn = moduleInfo.functions.get(fromId)
			fn.calls.add(targetId)
		} else {
			// fallback: attempt to find any function with matching id
			for (const fn of moduleInfo.functions.values()) {
				if (fn.id === fromId) {
					fn.calls.add(targetId)
					return
				}
			}
		}
	} catch (err) {
		// ignore
	}
}

function buildGraph(options) {
	const modules = new Map()
	const packageNodes = new Map()

	const files = collectSourceFiles(options)

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
				} else if (resolved.type === 'package') {
					// respect excludePackages option: do not create package nodes for excluded packages
					if (!(options && Array.isArray(options.excludePackages) && options.excludePackages.includes(resolved.target))) {
						packageNodes.set(resolved.target, {
							id: `package:${resolved.target}`,
							name: resolved.target,
							type: 'package'
						})
					}
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
				}
			}
		})
	}

	return { modules, packageNodes }
}

function buildTransitiveEdges(modules, maxDepth) {
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
			if (next && depth < maxDepth) {
				for (const neighbour of next) {
					queue.push({ target: neighbour, depth: depth + 1 })
				}
			}
		}
	}
	return transitive
}
function emitGraph(data, options) {
	const { modules, packageNodes } = data
	const moduleInfos = Array.from(modules.values())
	const packageInfos = Array.from(packageNodes.values())
	const functionInfos = []
	const functionInfoMap = new Map()

	for (const moduleInfo of moduleInfos) {
		for (const fnInfo of moduleInfo.functions.values()) {
			const entry = {
				moduleInfo,
				fnInfo,
				inDegree: 0,
				outDegree: fnInfo.calls.size,
				score: 0
			}
			functionInfos.push(entry)
			functionInfoMap.set(fnInfo.id, entry)
		}
	}

	for (const entry of functionInfos) {
		for (const targetId of entry.fnInfo.calls) {
			const targetEntry = functionInfoMap.get(targetId)
			if (targetEntry) targetEntry.inDegree += 1
		}
	}

	for (const entry of functionInfos) {
		const { fnInfo, inDegree, outDegree } = entry
		const exportedBoost = fnInfo.exported ? 5 : 0
		const defaultBoost = fnInfo.isDefaultExport ? 2 : 0
		entry.score = (outDegree * 2) + (inDegree * 1.5) + exportedBoost + defaultBoost
	}

	let selectedFunctionInfos = []
	let appliedMaxFunctions = options.maxFunctions
	if (options.includeFunctions) {
		if (options.maxFunctions !== null) {
			scopedSort(functionInfos)
			selectedFunctionInfos = functionInfos.slice(0, options.maxFunctions)
		} else {
			selectedFunctionInfos = [...functionInfos]
		}
	} else {
		selectedFunctionInfos = []
		appliedMaxFunctions = 0
	}

	const baseNodeCount = moduleInfos.length + packageInfos.length
	if (options.targetNodes !== null) {
		const budget = Math.max(0, options.targetNodes - baseNodeCount)
		if (appliedMaxFunctions === null) {
			scopedSort(functionInfos)
			selectedFunctionInfos = functionInfos.slice(0, budget)
			appliedMaxFunctions = budget
		} else {
			const limit = Math.min(appliedMaxFunctions, budget)
			selectedFunctionInfos = selectedFunctionInfos.slice(0, limit)
			appliedMaxFunctions = limit
		}
	}

	// Optionally collapse entire modules (vendor/minified) by removing their functions
	const collapsedModuleIds = new Set()
	if (options && options.collapseModules) {
		for (const m of moduleInfos) {
			if (isCollapsedModule(m, options)) collapsedModuleIds.add(m.id)
		}
		if (collapsedModuleIds.size) {
			selectedFunctionInfos = selectedFunctionInfos.filter(e => !collapsedModuleIds.has(e.moduleInfo.id))
		}
	}

	// Optionally collapse/minify noisy short-named functions from vendor/minified files
	const minifiedFunctionIds = new Set()
	if (options && options.collapseMinified) {
		for (const entry of selectedFunctionInfos) {
			if (isMinifiedFunction(entry.fnInfo, entry.moduleInfo, options)) {
				minifiedFunctionIds.add(entry.fnInfo.id)
			}
		}
		if (minifiedFunctionIds.size) {
			selectedFunctionInfos = selectedFunctionInfos.filter(e => !minifiedFunctionIds.has(e.fnInfo.id))
		}
	}

	const selectedFunctionIds = new Set(selectedFunctionInfos.map(entry => entry.fnInfo.id))

	let nodes = []
	let edges = []

	for (const moduleInfo of moduleInfos) {
		nodes.push({
			id: moduleInfo.id,
			label: moduleInfo.path,
			type: 'module',
			exports: Array.from(moduleInfo.exports),
			functionCount: moduleInfo.functions.size,
			hasDefaultExport: moduleInfo.hasDefaultExport,
			errors: moduleInfo.errors
		})
	}

	for (const pkg of packageInfos) {
		nodes.push({
			id: pkg.id,
			label: pkg.name,
			type: 'package'
		})
	}

	for (const entry of selectedFunctionInfos) {
		const { fnInfo, moduleInfo, inDegree, outDegree, score } = entry
		nodes.push({
			id: fnInfo.id,
			label: fnInfo.name,
			type: 'function',
			module: moduleInfo.id,
			kind: fnInfo.kind,
			exported: fnInfo.exported,
			isDefaultExport: fnInfo.isDefaultExport,
			inDegree,
			outDegree,
			score
		})
	}

	const moduleHasFunctionEdgeSet = new Set()
	for (const entry of selectedFunctionInfos) {
		const { fnInfo, moduleInfo } = entry
		const edgeId = `${moduleInfo.id}->${fnInfo.id}::contains`
		if (moduleHasFunctionEdgeSet.has(edgeId)) continue
		moduleHasFunctionEdgeSet.add(edgeId)
		edges.push({
			id: edgeId,
			type: 'module-has-function',
			source: moduleInfo.id,
			target: fnInfo.id,
			pathLength: 1
		})
	}

	// Add normal function-call edges between included functions. If a call target
	// is excluded (e.g., collapsed minified function), create an external-call
	// edge from the caller function to the target's module node instead.
	const externalEdgeSet = new Set()
	for (const entry of selectedFunctionInfos) {
		const { fnInfo } = entry
		for (const toId of fnInfo.calls) {
			if (selectedFunctionIds.has(toId)) {
				const edgeId = `${fnInfo.id}->${toId}`
				edges.push({ id: edgeId, type: 'function-call', source: fnInfo.id, target: toId, pathLength: 1 })
			} else {
				// if target exists in functionInfoMap, link to its module instead
				const targetEntry = functionInfoMap.get(toId)
				if (targetEntry) {
					const targetModuleId = targetEntry.moduleInfo.id
					const edgeId = `${fnInfo.id}->${targetModuleId}::externalCall`
					if (!externalEdgeSet.has(edgeId)) {
						externalEdgeSet.add(edgeId)
						edges.push({ id: edgeId, type: 'function-call-external', source: fnInfo.id, target: targetModuleId, pathLength: 1 })
					}
				}
			}
		}
	}

	// For minified functions that were collapsed (excluded), surface their calls
	// as module -> function edges when they call included functions.
	if (minifiedFunctionIds.size) {
		for (const entry of functionInfos) {
			if (selectedFunctionIds.has(entry.fnInfo.id)) continue
			if (!isMinifiedFunction(entry.fnInfo, entry.moduleInfo, options)) continue
			const srcModuleId = entry.moduleInfo.id
			for (const toId of entry.fnInfo.calls) {
				if (!selectedFunctionIds.has(toId)) continue
				const edgeId = `${srcModuleId}->${toId}::externalFromMin`
				if (!externalEdgeSet.has(edgeId)) {
					externalEdgeSet.add(edgeId)
					edges.push({ id: edgeId, type: 'function-call-external', source: srcModuleId, target: toId, pathLength: 1 })
				}
			}
		}
	}

	// For functions in collapsed modules, surface their calls as module -> function or module->module edges
	if (collapsedModuleIds.size) {
		for (const entry of functionInfos) {
			if (selectedFunctionIds.has(entry.fnInfo.id)) continue
			if (!collapsedModuleIds.has(entry.moduleInfo.id)) continue
			const srcModuleId = entry.moduleInfo.id
			for (const toId of entry.fnInfo.calls) {
				// if the target is an included function, create module -> function edge
				if (selectedFunctionIds.has(toId)) {
					const edgeId = `${srcModuleId}->${toId}::externalFromCollapsed`
					if (!externalEdgeSet.has(edgeId)) {
						externalEdgeSet.add(edgeId)
						edges.push({ id: edgeId, type: 'function-call-external', source: srcModuleId, target: toId, pathLength: 1 })
					}
				} else {
					// if the target is also in a collapsed module, create module->module edge
					const targetEntry = functionInfoMap.get(toId)
					if (targetEntry && collapsedModuleIds.has(targetEntry.moduleInfo.id) && targetEntry.moduleInfo.id !== srcModuleId) {
						const tgtModule = targetEntry.moduleInfo.id
						const edgeId = `${srcModuleId}->${tgtModule}::collapsedModuleCall`
						if (!externalEdgeSet.has(edgeId)) {
							externalEdgeSet.add(edgeId)
							edges.push({ id: edgeId, type: 'function-call-external', source: srcModuleId, target: tgtModule, pathLength: 1 })
						}
					}
				}
			}
		}
	}

	const importEdgeSet = new Set()
	for (const moduleInfo of moduleInfos) {
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

	const packageEdgeSet = new Set()
	for (const moduleInfo of moduleInfos) {
		for (const [, importInfo] of moduleInfo.importMap.entries()) {
			if (importInfo.type !== 'package') continue
			// skip package edges for excluded packages
			if (options && Array.isArray(options.excludePackages) && options.excludePackages.includes(importInfo.target)) continue
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

	if (options.includeTransitive) {
		const transitive = buildTransitiveEdges(modules, options.transitiveDepth)
		for (const { source, target, depth } of transitive) {
			edges.push({
				id: `${source}->${target}::depth${depth}`,
				type: 'module-import-transitive',
				source,
				target,
				pathLength: depth
			})
		}
	}

	// Orphan handling: ensure edges always point to existing nodes
	const nodeIds = new Set(nodes.map(n => n.id))
	const placeholdersCreated = new Map() // id -> node
	const orphanStats = { dropped: 0, fixed: 0 }

	function ensurePlaceholder(id) {
		if (nodeIds.has(id)) return
		if (placeholdersCreated.has(id)) return
		let type = 'placeholder'
		let label = id
		if (id.startsWith('module:')) {
			type = 'module'
			label = `${options.orphanPrefix}${id.replace(/^module:/, '')}`
		} else if (id.startsWith('package:')) {
			type = 'package'
			label = `${options.orphanPrefix}${id.replace(/^package:/, '')}`
		}
		const node = { id, label, type }
		placeholdersCreated.set(id, node)
	}

	if (options.handleOrphans !== 'keep') {
		const nextEdges = []
		for (const e of edges) {
			const srcExists = nodeIds.has(e.source)
			const tgtExists = nodeIds.has(e.target)
			if (srcExists && tgtExists) {
				nextEdges.push(e)
				continue
			}
			if (options.handleOrphans === 'drop') {
				orphanStats.dropped += 1
				continue
			}
			if (options.handleOrphans === 'placeholder') {
				if (!srcExists) ensurePlaceholder(e.source)
				if (!tgtExists) ensurePlaceholder(e.target)
				nextEdges.push(e)
				orphanStats.fixed += 1
			}
		}
		if (placeholdersCreated.size) {
			for (const n of placeholdersCreated.values()) { nodes.push(n) }
			for (const n of placeholdersCreated.values()) { nodeIds.add(n.id) }
		}
		edges = nextEdges
	}

	return {
		graph: { nodes, edges },
		stats: {
			modules: moduleInfos.length,
			packages: packageInfos.length,
			functionsTotal: functionInfos.length,
			functionsSelected: selectedFunctionInfos.length,
			targetNodes: options.targetNodes,
			maxFunctions: appliedMaxFunctions,
			includeFunctions: options.includeFunctions,
			includeTransitive: options.includeTransitive,
			orphanEdgesDropped: orphanStats.dropped,
			orphanEdgesFixed: orphanStats.fixed,
			placeholders: placeholdersCreated.size
		}
	}
}

function isMinifiedFunction(fnInfo, moduleInfo, options) {
	if (!options || !options.collapseMinified) return false
	const maxLen = Number.isFinite(options.minifiedNameMax) ? options.minifiedNameMax : 4
	const name = fnInfo && fnInfo.name ? String(fnInfo.name) : ''
	if (!name || name.length > maxLen) return false
	const p = moduleInfo && moduleInfo.path ? moduleInfo.path : ''
	const low = p.toLowerCase()
	if (low.includes('.min.') || low.includes('node_modules') || low.includes('/vendor/') ) return true
	// treat UMD bundles as noisy if configured
	if (options.collapseUmd && (low.includes('.umd.') || low.includes('/umd/') || low.includes('umd.min'))) return true
	// allow explicit package name hints (e.g., maplibre)
	if (low.includes('maplibre') || low.includes('mapbox') ) return true
	return false
}

function isCollapsedModule(moduleInfo, options) {
	if (!options || !options.collapseModules) return false
	const p = moduleInfo && moduleInfo.path ? moduleInfo.path : ''
	const low = String(p).toLowerCase()
	if (low.includes('.min.') || low.includes('node_modules') || low.includes('/vendor/')) return true
	// treat UMD bundles as vendors if configured
	if (options.collapseUmd && (low.includes('.umd.') || low.includes('/umd/') || low.includes('umd.min'))) return true
	if (low.includes('maplibre') || low.includes('mapbox')) return true
	return false
}

function scopedSort(functionInfos) {
	functionInfos.sort((a, b) => b.score - a.score)
}

function toTopogramCsv(graph) {
	const header = [
		'id', 'name', 'label', 'description', 'color', 'fillColor', 'weight', 'rawWeight', 'lat', 'lng', 'start', 'end', 'time', 'date', 'source', 'target', 'edgeLabel', 'edgeColor', 'edgeWeight', 'relationship', 'enlightement', 'emoji', 'extra'
	]

	const rows = []

	// Build quick lookup maps to compute outgoing counts and node metadata
	const nodeById = new Map()
	for (const n of graph.nodes) nodeById.set(n.id, n)

	const outgoingCount = new Map()
	for (const n of graph.nodes) outgoingCount.set(n.id, 0)
	for (const e of graph.edges) {
		if (outgoingCount.has(e.source)) outgoingCount.set(e.source, outgoingCount.get(e.source) + 1)
		else outgoingCount.set(e.source, 1)
	}

	function nodeColor(n) {
		return n.type === 'module' ? '#1f77b4' : n.type === 'function' ? '#2ca02c' : '#7f7f7f'
	}

	function edgeColorByFile(edge) {
		// Try to pick a file-based color: prefer module path from source or target
		let modPath = null
		const pickModuleFromId = id => {
			if (!id) return null
			if (id.startsWith('module:')) return id.replace(/^module:/, '')
			if (id.startsWith('function:')) {
				const node = nodeById.get(id)
				if (node && node.module) return node.module.replace(/^module:/, '')
			}
			return null
		}
		modPath = pickModuleFromId(edge.source) || pickModuleFromId(edge.target)
		if (!modPath) return ''
		if (modPath.endsWith('.jsx') || modPath.includes('.jsx')) return '#9467bd'
		if (modPath.endsWith('.tsx') || modPath.includes('.tsx')) return '#8c564b'
		if (modPath.endsWith('.ts') || modPath.includes('.ts')) return '#8c564b'
		if (modPath.endsWith('.js') || modPath.includes('.js')) return '#1f77b4'
		return '#ff7f0e'
	}

	const RELATIONSHIP_MAP = {
		'function-call': 'calls',
		'function-call-external': 'calls',
		'module-import': 'imports',
		'package-import': 'imports',
		'module-has-function': 'contains',
		'module-import-transitive': 'imports'
	}

	for (const node of graph.nodes) {
		const color = nodeColor(node)
		const count = outgoingCount.get(node.id) || 0
		let extraVal = JSON.stringify(node)
		if (node.type === 'function') {
			// include module and score for functions as a compact extra
			extraVal = JSON.stringify({ module: node.module, score: node.score })
		} else if (node.type === 'module') {
			extraVal = JSON.stringify({ exports: node.exports, functionCount: node.functionCount, errors: node.errors })
		}

		rows.push({
			id: node.id,
			name: node.label,
			label: node.type === 'function' ? `${node.label}()` : node.label,
			description: node.type,
			color: color,
			fillColor: color,
			weight: count || '',
			rawWeight: count || '',
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
			enlightement: '',
			emoji: '',
			extra: extraVal
		})
	}

	for (const edge of graph.edges) {
		// Per your desired mapping: keep name/label/description empty and map relationship to friendly labels
		const eColor = edgeColorByFile(edge)
		rows.push({
			id: edge.id,
			name: '',
			label: '',
			description: '',
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
			source: edge.source,
			target: edge.target,
			edgeLabel: '',
			edgeColor: eColor,
			edgeWeight: edge.pathLength,
			relationship: RELATIONSHIP_MAP[edge.type] || edge.type,
			enlightement: '',
			emoji: '',
			extra: JSON.stringify(edge)
		})
	}

	return Papa.unparse({ fields: header, data: rows.map(row => header.map(key => row[key] ?? '')) })
}

function splitGraphIntoChunks(graph, chunkSize) {
	const chunks = []
	if (!Array.isArray(graph.nodes)) return chunks
	for (let i = 0; i < graph.nodes.length; i += chunkSize) {
		const chunkNodes = graph.nodes.slice(i, i + chunkSize)
		const ids = new Set(chunkNodes.map(n => n.id))
		const chunkEdges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target))
		chunks.push({ nodes: chunkNodes, edges: chunkEdges })
	}
	return chunks
}

function splitGraphByModule(graph, chunkSize) {
	const nodesById = new Map(graph.nodes.map(n => [n.id, n]))

	// collect module nodes and their functions
	const functionNodes = graph.nodes.filter(n => n.type === 'function')
	const functionsByModule = new Map()
	for (const fn of functionNodes) {
		if (!fn.module) continue
		const moduleId = fn.module
		if (!functionsByModule.has(moduleId)) functionsByModule.set(moduleId, [])
		functionsByModule.get(moduleId).push(fn)
	}

	// build groups: each group is { moduleId, moduleNode, fnNodes, size, packages }
	const groups = []
	for (const n of graph.nodes) {
		if (n.type === 'module') {
			const fnNodes = functionsByModule.get(n.id) || []
			const groupNodes = [n, ...fnNodes]
			// collect package deps for this module
			const pkgs = new Set()
			for (const e of graph.edges) {
				if (e.type === 'package-import' && e.source === n.id) pkgs.add(e.target)
			}
			groups.push({ moduleId: n.id, moduleNode: n, fnNodes, size: groupNodes.length, nodes: groupNodes, packages: pkgs })
		}
	}

	// first-fit-decreasing: sort groups by size descending
	const sorted = groups.slice().sort((a, b) => {
		if (b.size !== a.size) return b.size - a.size
		return a.moduleId.localeCompare(b.moduleId)
	})

	// bins: array of { groups: [group], count }
	const bins = []
	for (const g of sorted) {
		// try to place into first bin that fits (considering package nodes)
		let placed = false
		for (const bin of bins) {
			// estimate additional packages introduced by adding this group
			const combinedPkgs = new Set(bin.packages)
			for (const p of g.packages) combinedPkgs.add(p)
			const pkgIncrease = combinedPkgs.size - bin.packages.size
			if (bin.count + g.size + pkgIncrease <= chunkSize) {
				bin.groups.push(g)
				bin.count += g.size
				for (const p of g.packages) bin.packages.add(p)
				placed = true
				break
			}
		}
		if (!placed) {
			// create new bin; allow oversized group to occupy its own bin
			const newBin = { groups: [g], count: g.size, packages: new Set(g.packages) }
			bins.push(newBin)
		}
	}

	// construct chunks from bins
	const chunks = []
	for (const bin of bins) {
		const currentIds = new Set()
		const partNodes = []
		// order groups in bin by moduleId for determinism
		const ordered = bin.groups.slice().sort((a, b) => a.moduleId.localeCompare(b.moduleId))
		for (const grp of ordered) {
			// push module then its functions
			partNodes.push(grp.moduleNode)
			currentIds.add(grp.moduleNode.id)
			for (const fn of grp.fnNodes) {
				partNodes.push(fn)
				currentIds.add(fn.id)
			}
		}

		// include package nodes referenced by modules in this chunk
		const packageIdsToInclude = new Set()
		for (const e of graph.edges) {
			if (e.type === 'package-import' && currentIds.has(e.source)) {
				packageIdsToInclude.add(e.target)
			}
		}
		for (const pid of packageIdsToInclude) {
			const pn = nodesById.get(pid)
			if (pn) { partNodes.push(pn); currentIds.add(pid) }
		}

		const partEdges = graph.edges.filter(e => currentIds.has(e.source) && currentIds.has(e.target))
		chunks.push({ nodes: partNodes, edges: partEdges })
	}

	return chunks
}

function sanitizeName(name) {
	return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
}

function createSubgraphs(graph, options) {
	// graph: { nodes, edges }
	const nodesById = new Map(graph.nodes.map(n => [n.id, n]))
	const edgesBySource = new Map()
	for (const e of graph.edges) {
		if (!edgesBySource.has(e.source)) edgesBySource.set(e.source, [])
		edgesBySource.get(e.source).push(e)
	}

	// identify function nodes
	const functionNodes = graph.nodes.filter(n => n.type === 'function')

	const limit = options.subgraphLimit && Number.isFinite(options.subgraphLimit) ? options.subgraphLimit : functionNodes.length

	let count = 0
	for (const fn of functionNodes) {
		if (count >= limit) break
		const rootId = fn.id
		const rootName = fn.label || rootId
		// BFS over function-call edges
		const maxDepth = options.subgraphDepth || 3
		const visited = new Set([rootId])
		const q = [{ id: rootId, depth: 0 }]
		while (q.length) {
			const { id, depth } = q.shift()
			if (depth >= maxDepth) continue
			const outs = edgesBySource.get(id) || []
			for (const e of outs) {
				// follow only function-call edges to other function nodes
				if (e.type !== 'function-call') continue
				const tgt = e.target
				if (!visited.has(tgt)) {
					visited.add(tgt)
					q.push({ id: tgt, depth: depth + 1 })
				}
			}
		}

		// collect nodes: functions visited + their containing modules + package nodes if linked
		const subNodes = []
		const subNodeIds = new Set()
		// include function nodes
		for (const id of visited) {
			const n = nodesById.get(id)
			if (n) { subNodes.push(n); subNodeIds.add(id) }
		}

		// include module nodes that contain these functions (module-has-function edges have id like moduleId->functionId::contains)
		for (const e of graph.edges) {
			if (e.type === 'module-has-function' && subNodeIds.has(e.target)) {
				if (!subNodeIds.has(e.source)) {
					const mn = nodesById.get(e.source)
					if (mn) { subNodes.push(mn); subNodeIds.add(e.source) }
				}
			}
		}

		// include inter-module import edges where both modules included
		const subEdges = []
		for (const e of graph.edges) {
			if (e.type === 'function-call') {
				if (subNodeIds.has(e.source) && subNodeIds.has(e.target)) subEdges.push(e)
			} else if (e.type === 'module-has-function') {
				if (subNodeIds.has(e.source) && subNodeIds.has(e.target)) subEdges.push(e)
			} else if (e.type === 'module-import' || e.type === 'package-import' || e.type === 'module-import-transitive') {
				if (subNodeIds.has(e.source) && subNodeIds.has(e.target)) subEdges.push(e)
			}
		}

		const subgraph = { nodes: subNodes, edges: subEdges }
		const safe = sanitizeName(rootName)
		const base = `${options.outputBase}_subgraph_${safe || sanitizeName(fn.id)}`
		const outJson = path.join(OUTPUT_DIR, `${base}.json`)
		const outCsv = path.join(OUTPUT_DIR, `${base}.csv`)
		fs.writeFileSync(outJson, JSON.stringify(subgraph, null, 2), 'utf8')
		const csv = toTopogramCsv(subgraph)
		fs.writeFileSync(outCsv, csv, 'utf8')
		console.log(`Wrote subgraph ${base}: nodes=${subNodes.length} edges=${subEdges.length}`)

		count += 1
	}
}

function main() {
	const { options, helpRequested } = parseArgs(process.argv.slice(2))
	if (helpRequested) {
		printHelp()
		return
	}

	// Force analysis roots to only the requested subtrees per user instruction
	// Exclude the entire mapappbuilder folder as requested; analyze only imports, server, client
	options.sourceRoots = ['imports', 'server', 'client']
	// Also ensure mapappbuilder is excluded if present
	const mbPath = path.join(PROJECT_ROOT, 'mapappbuilder')
	if (fs.existsSync(mbPath)) {
		options.excludeDirs = Array.from(new Set([...(options.excludeDirs || []), mbPath]))
	}

	const data = buildGraph(options)
	const { graph, stats } = emitGraph(data, options)
	const outputBaseName = `${options.outputBase}${options.outputSuffix}`
	const outputJsonPath = path.join(OUTPUT_DIR, `${outputBaseName}.json`)
	const outputCsvPath = path.join(OUTPUT_DIR, `${outputBaseName}.csv`)

	// If chunking is requested, produce per-part JSON/CSV files.
	if (options && Number.isFinite(options.chunkSize) && options.chunkSize > 0) {
		let parts = []
		if (options.chunkBy === 'module') {
			parts = splitGraphByModule(graph, options.chunkSize)
		} else {
			parts = splitGraphIntoChunks(graph, options.chunkSize)
		}
		for (let i = 0; i < parts.length; i += 1) {
			const part = parts[i]
			const idx = String(i + 1).padStart(3, '0')
			const base = `${outputBaseName}_part${idx}`
			const outJson = path.join(OUTPUT_DIR, `${base}.json`)
			const outCsv = path.join(OUTPUT_DIR, `${base}.csv`)
			fs.writeFileSync(outJson, JSON.stringify(part, null, 2), 'utf8')
			fs.writeFileSync(outCsv, toTopogramCsv(part), 'utf8')
			console.log(`Wrote chunk ${base}: nodes=${part.nodes.length} edges=${part.edges.length}`)
		}
		if (options.chunkOnly) {
			console.log('Chunk-only flag set — skipping combined full output.')
			return
		}
	}

	// Write combined full graph JSON and CSV
	fs.writeFileSync(outputJsonPath, JSON.stringify(graph, null, 2), 'utf8')
	const csv = toTopogramCsv(graph)
	fs.writeFileSync(outputCsvPath, csv, 'utf8')

	if (options && options.subgraphs) {
		console.log('Exporting subgraphs...')
		createSubgraphs(graph, options)
	}

	console.log(`Graph nodes: ${graph.nodes.length}`)
	console.log(`Graph edges: ${graph.edges.length}`)
	console.log(`Modules: ${stats.modules}, Packages: ${stats.packages}, Functions selected: ${stats.functionsSelected}/${stats.functionsTotal}`)
	if (stats.targetNodes !== null) console.log(`Target nodes: ${stats.targetNodes}`)
	if (stats.maxFunctions !== null) console.log(`Applied max functions: ${stats.maxFunctions}`)
	if (Number.isFinite(stats.orphanEdgesDropped) || Number.isFinite(stats.orphanEdgesFixed)) {
		console.log(`Orphans: dropped=${stats.orphanEdgesDropped||0} fixed=${stats.orphanEdgesFixed||0} placeholders=${stats.placeholders||0}`)
	}
	console.log(`JSON written to ${outputJsonPath}`)
	console.log(`CSV written to ${outputCsvPath}`)
}

main()

