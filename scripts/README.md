Scripts for building Topogram-compatible datasets

build_debian_topogram.py
- Fetches Debian Packages.gz for a suite/component (default: stable/main)
- Builds a BFS-limited dependency graph for a package
- Emits a Topogram-compatible CSV (nodes + edges) suitable for import into Topogram

build_full_dependency_graph.js
- Parses the Topogram codebase (imports/, client/, server/, mapappbuilder/) with Babel
- Extracts module-level imports, function declarations, call relationships and module↦function membership edges
- Emits JSON/CSV under samples/ (dependency_graph_topogram_code*.{json,csv}) and supports CLI flags such as --target-nodes, --max-functions, --exclude-dir, --no-transitive, --output-suffix

Usage examples:

```bash
# build a depth-2 graph for 'bash' and write to samples/
./scripts/build_debian_topogram.py bash -d 2 -o samples/bash_topogram.csv

# generate the code dependency graph and write samples/dependency_graph_topogram_code.{json,csv}
node scripts/build_full_dependency_graph.js

# generate a trimmed (~1k nodes) version alongside the default output
node scripts/build_full_dependency_graph.js --target-nodes 1000 --output-suffix _1000

# export a folder of .topogram.csv to Mongo (dry-run)
./scripts/import_topograms_folder.py --dir ./samples/topograms --mongo-url mongodb://localhost:27017/meteor

# verify a packaged presentation zip
./scripts/verify_bundle.sh /path/to/export.zip
```

Notes:
- The script is a lightweight parser and does not resolve virtual packages or
  alternative providers. It strips version constraints from dependency expressions.
- For large graphs, increase depth carefully or filter component/section.
- See also: `scripts/README_EXPORT.md` for end-to-end export+verify.
