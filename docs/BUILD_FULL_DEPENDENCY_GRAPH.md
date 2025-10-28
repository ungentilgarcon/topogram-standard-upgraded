# build_full_dependency_graph.js — Documentation

This document describes the `scripts/build_full_dependency_graph.js` tool: what it does, prerequisites, command-line options, outputs, and developer notes for modifying or extending it.

## Purpose

`build_full_dependency_graph.js` traverses the Topogram codebase (JS/JSX/TS/TSX files under `imports`, `client`, `server`, `mapappbuilder` by default), extracts modules, packages and function declarations, inspects call expressions to record call relationships, and builds a graph of nodes and edges.

It emits:
- a Topogram-style JSON file: `{ nodes: [...], edges: [...] }`
- a Topogram-compatible CSV (header `id,name,label,description,color,fillColor,weight,rawWeight,lat,lng,start,end,time,date,source,target,edgeLabel,edgeColor,edgeWeight,relationship,enlightement,emoji,extra`)

The project also includes helper tooling to generate inspection CSVs that map original node/edge objects to CSV columns: `scripts/generate_node_edge_mappings.py`.

## Prerequisites

- Node.js (tested with Node 16+)
- The script uses these npm packages (install in the repo root):
  - `@babel/parser`
  - `@babel/traverse`
  - `papaparse`

Install them (if needed):

```bash
npm install @babel/parser @babel/traverse papaparse
```

You also need Python 3 for the provided mapping generator script (`scripts/generate_node_edge_mappings.py`).

## Invocation & Options

Usage (basic):

```bash
node scripts/build_full_dependency_graph.js [options]
```

Available options:

- `--output-base <name>`  (default: `dependency_graph_topogram_code`)  — base filename used for JSON/CSV output in `samples/`.
- `--output-suffix <suffix>` — append a suffix to the base name.
- `--exclude-dir <path>` or `--exclude-dirs <path1,path2>` — relative directories to exclude from source traversal.
- `--exclude-packages <pkg1,pkg2>` — package names (npm imports) to exclude from package nodes and package-import edges (useful to skip large external libs such as `maplibre-gl`).
- `--include-functions` / `--no-functions` — include or exclude function nodes entirely.
- `--max-functions <n>` — limit the number of function nodes selected (if included).
- `--target-nodes <n>` — aim for at most N nodes (modules + packages + functions); used to cap functions selected.
- `--include-transitive` / `--no-transitive` — include or skip transitive module import edges.
- `--transitive-depth <n>` — BFS depth for transitive module imports (default 4).
- `--subgraphs` — boolean flag to enable exporting per-function subgraphs (writes additional JSON/CSV files in `samples/`).
- `--subgraph-depth <n>` — BFS depth for subgraph function-call traversal (default 3).
- `--subgraph-limit <n>` — limit the number of subgraphs generated; useful to avoid huge output sets.
- `-h` / `--help` — show help text.

Example: generate a graph while excluding `maplibre-gl` and export 5 subgraphs of depth 2:

```bash
node scripts/build_full_dependency_graph.js --output-base dependency_graph_topogram_code_subs \ 
  --no-transitive --subgraphs --subgraph-depth=2 --subgraph-limit=5 --exclude-packages=maplibre-gl,maplibre
```

## Output format

Primary outputs are written to the `samples/` folder by default:

- JSON: `samples/<outputBase><outputSuffix>.json` — an object with `nodes` and `edges` arrays. After recent changes the JSON node objects are kept minimal to better match the CSV schema (fields include `id`, `label`, `type` for nodes; edges include `id`, `type`, `source`, `target`, `pathLength`).
- CSV: `samples/<outputBase><outputSuffix>.csv` — a Topogram-style CSV (header below).
- If `--subgraphs` is used, additional files are written: `samples/<outputBase>_subgraph_<functionname>.json` and `.csv` for each exported subgraph.

CSV header used by the exporter (and replicated by the mapping generator):

```
id,name,label,description,color,fillColor,weight,rawWeight,lat,lng,start,end,time,date,source,target,edgeLabel,edgeColor,edgeWeight,relationship,enlightement,emoji,extra
```

Mapping of CSV columns (as implemented in `toTopogramCsv`):

- For nodes:
  - `id` → `node.id`
  - `name` → `node.label`
  - `label` → `node.type === 'function' ? `${node.label}()` : node.label`
  - `description` → `node.type`
  - `color` → module:'#1f77b4', function:'#2ca02c', else:'#7f7f7f'
  - `fillColor` → same as `color`
  - `weight`, `rawWeight` → number of outgoing edges from the node (or blank if zero)
  - `enlightement` → empty (cleared by recent change)
  - `extra` → compact JSON; for functions it contains `{ module, score }`, for modules `{ exports, functionCount, errors }`, otherwise the full node object serialized

- For edges:
  - `id` → `edge.id`
  - `name`, `label`, `description` → intentionally left blank (recent change)
  - `color` / `edgeColor` → heuristically chosen by inspecting module file extension where possible (js/jsx/ts/tsx) — fallback color is used
  - `edgeWeight` → `edge.pathLength`
  - `source`, `target` → `edge.source`, `edge.target`
  - `relationship` → friendly label mapped from `edge.type` (e.g., `function-call` → `calls`, `module-import`/`package-import` → `imports`, `module-has-function` → `contains`)
  - `extra` → `JSON.stringify(edge)`

Note: the above mapping is intentionally conservative to make the CSVs easy to import into Topogram while providing helpful metadata in `extra`.

## Subgraphs

When `--subgraphs` is enabled the tool creates individual subgraph files per function root. Behavior:

- For each function node (optionally limited by `--subgraph-limit`) the script performs a BFS across `function-call` edges up to `--subgraph-depth`.
- The subgraph includes all visited function nodes, plus the module nodes that contain those functions (via `module-has-function` edges), and any inter-node edges (function-call, module-has-function, module-import, package-import, module-import-transitive) where both endpoints are included.
- Output: `samples/<outputBase>_subgraph_<sanitizedRootName>.json` and `.csv`.

If you prefer subgraphs to be generated only for exported functions or only for top-scoring functions, modify the selection in `createSubgraphs` in the script — it currently iterates over all function nodes in source order.

## Excluding packages

Use `--exclude-packages` with a comma-separated list of package names to exclude from the graph. Excluded packages will not generate package nodes and package-import edges will be skipped. This is useful to avoid huge noisy external libs such as `maplibre-gl`.

Example:

```bash
node scripts/build_full_dependency_graph.js --exclude-packages=maplibre-gl,maplibre
```

## Mapping CSV generator

`scripts/generate_node_edge_mappings.py` is a small Python utility that reads a graph JSON and writes two CSVs:

- `samples/nodes_mapping_<json-base>.csv`
- `samples/edges_mapping_<json-base>.csv`

Each row contains an `original` column (JSON serialized original node/edge) followed by the Topogram CSV columns so you can trace exactly how node/edge fields are mapped to CSV values.

Usage example:

```bash
python3 scripts/generate_node_edge_mappings.py samples/dependency_graph_topogram_code_test2.json
```

## Developer notes — where to change mappings

- `toTopogramCsv(graph)` — the main mapping from node/edge objects to CSV rows. If you want to change what goes into `name`, `label`, `color`, `edgeColor`, `relationship`, or `extra`, update this function.
- `RELATIONSHIP_MAP` near `toTopogramCsv` maps raw `edge.type` values to friendly labels. Add or change mappings to represent relationships differently (e.g., distinguish transitive imports).
- `createSubgraphs(graph, options)` — controls how subgraphs are selected and what nodes/edges are included.
- `resolveImport` — resolves import sources into module/package targets; `--exclude-packages` interacts with package node creation in the `ImportDeclaration` handler and in `emitGraph` where package-import edges are assembled.

## Performance & tips

- For faster runs during iteration, use `--no-transitive` and/or a smaller `--max-functions` or `--target-nodes` value.
- Generating subgraphs can create many files; use `--subgraph-limit` to keep output small when testing.
- Generated sample JSON/CSV files can be large. Consider removing or moving them out of the repo if you don't want large blobs checked in. The repository currently contains samples; if you prefer not to commit generated output, add them to `.gitignore` and keep only scripts under source control.

## Example workflow

1. Produce a quick graph (no transitive edges):

```bash
node scripts/build_full_dependency_graph.js --output-base dependency_graph_topogram_code_quick --no-transitive
```

2. Generate mapping CSVs for inspection:

```bash
python3 scripts/generate_node_edge_mappings.py samples/dependency_graph_topogram_code_quick.json
```

3. Export a few subgraphs while excluding maplibre packages:

```bash
node scripts/build_full_dependency_graph.js --output-base dep_subs --subgraphs --subgraph-depth=2 --subgraph-limit=10 --exclude-packages=maplibre-gl,maplibre
```

## Contact / next steps

If you want changes to the mapping (for example: prefer `node.name` over `node.label`, include function `score` or `module` into explicit CSV columns instead of inside `extra`, or change the `relationship` wording), tell me which exact column mappings you want and I will update `toTopogramCsv` and regenerate outputs.

If you want a shorter README under `scripts/` instead of `docs/`, or a CONTRIBUTING note describing how to regenerate artifacts, I can add that as well.

---
Generated on: 28 Oct 2025
