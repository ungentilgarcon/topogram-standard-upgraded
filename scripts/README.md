Scripts for building Topogram-compatible datasets

build_debian_topogram.py
- Fetches Debian Packages.gz for a suite/component (default: stable/main)
- Builds a BFS-limited dependency graph for a package
- Emits a Topogram-compatible CSV (nodes + edges) suitable for import into Topogram

Usage examples:

```bash
# build a depth-2 graph for 'bash' and write to samples/
./scripts/build_debian_topogram.py bash -d 2 -o samples/bash_topogram.csv
```

Notes:
- The script is a lightweight parser and does not resolve virtual packages or
  alternative providers. It strips version constraints from dependency expressions.
- For large graphs, increase depth carefully or filter component/section.
