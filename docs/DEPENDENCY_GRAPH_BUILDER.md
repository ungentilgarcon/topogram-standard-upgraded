# Topogram Code Dependency Graph Builder

This guide explains how to generate fine-grained dependency graphs for the Topogram codebase using the script at `scripts/build_full_dependency_graph.js`. The graphs are suitable for exploration inside Topogram (via CSV import) or for downstream analysis in JSON form.

## Overview

The builder traverses the source directories (`imports/`, `client/`, `server/`, `mapappbuilder/`) and extracts:

- Module-to-module import links
- Module to NPM package dependencies
- Function declarations (named, default exports, arrows, function expressions)
- Module → function membership edges
- Function → function call edges (within a module)
- Optional transitive import edges computed by breadth-first search

The output is saved under `samples/` as Topogram-compatible datasets (`dependency_graph_topogram_code*.json` and `.csv`).

## Requirements

- Node.js 18+ (the project already pins a compatible version for Meteor development)
- Local install of project dependencies (`npm install`)

The script relies on dev dependencies declared in `package.json`: `@babel/parser`, `@babel/traverse`, and `papaparse`.

## Running the Builder

From the repository root:

```bash
node scripts/build_full_dependency_graph.js
```

This command generates two files:

- `samples/dependency_graph_topogram_code.json`
- `samples/dependency_graph_topogram_code.csv`

The default run keeps every discovered function node (10k+) and includes transitive module edges up to depth 4.

## CLI Options

| Flag | Description |
| ---- | ----------- |
| `--output-base <name>` | Override the base filename (default `dependency_graph_topogram_code`). |
| `--output-suffix <suffix>` | Append a suffix before the file extension (e.g. `_1000`). |
| `--max-functions <n>` | Hard cap the number of function nodes kept; highest-scoring functions (exports, call hubs) stay first. |
| `--exclude-dir <path>` | Skip a directory (relative to the repo root). Repeat or provide a comma-separated list, e.g. `--exclude-dir mapappbuilder/libs`. |
| `--target-nodes <n>` | Aim for a total node budget (modules + packages + functions). Useful for producing inspectable subsets. |
| `--no-functions` / `--include-functions=false` | Skip function nodes entirely (module/package graph only). |
| `--no-transitive` / `--include-transitive=false` | Exclude transitive module edges. |
| `--transitive-depth <n>` | Custom BFS depth for transitive import edges (default `4`). |
| `--help` | Display usage information. |

Options can be combined. For example, to build a ~1,000 node slice and tuck it under a custom suffix:

```bash
node scripts/build_full_dependency_graph.js --target-nodes 1000 --output-suffix _1000
```

This creates `samples/dependency_graph_topogram_code_1000.json` and `.csv` that focus on the most influential functions.

## Output Schema

Both JSON and CSV follow the Topogram conventions:

- **Nodes**: Objects with `id`, `label`, `type` (`module`, `function`, `package`) and metadata such as `exports`, `functionCount`, `kind`, `inDegree`, `outDegree`, `score`.
- **Edges**: Objects with `id`, `source`, `target`, `type` (`module-import`, `module-import-transitive`, `module-has-function`, `package-import`, `function-call`), and `pathLength` (distance or hop count).

The CSV uses the standard column order expected by the Builder (`id,name,label,...,extra`) with the JSON payload mirrored in the `extra` column for debugging.

## Typical Workflow

1. Run the builder with the desired options.
2. Import the generated CSV into the Builder or the sandbox app to explore the graph visually.
3. Use the JSON output for scripted analysis (e.g., centrality, clustering) or to seed automated tests.

## Troubleshooting

- **Parsing errors**: The script logs files that fail to parse (usually due to unsupported syntax). Update `PARSER_PLUGINS` if a newer syntax feature appears.
- **Large outputs**: Set `--target-nodes` or `--max-functions` to keep datasets manageable.
- **Missing packages/modules**: Non-relative imports are treated as NPM packages; if a local alias is used, ensure a resolvable path exists or extend `resolveImport`.

For quick validation, run:

```bash
node scripts/quick_parse_test.js
```

This checks that the key sample CSV/JSON files, including the generated dependency graphs, parse without errors.
