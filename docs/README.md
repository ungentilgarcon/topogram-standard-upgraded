# Project documentation index

This folder contains the core documentation for the Topogram application (Meteor + React client). The files below explain the architecture, data model, dependency graph, run instructions and contribution guidelines.

Files:

- `ARCHITECTURE.md` — high-level architecture and component responsibilities.
- `DEPENDENCY_GRAPH.md` — mermaid-based dependency graph showing collections, server startup pieces and UI components.
- `DATASET.md` — collection schemas and field descriptions (Topograms, Nodes, Edges).
- `QUICKSTART.md` — how to run the app locally for development.
- `CONTRIBUTING.md` — contribution workflow, PR rules, and a sample pre-push hook.
- `API.md` — where to find server endpoints, publications and methods; includes client adapter API notes.
- `SELECTIONS.md` — adapter contract and how selection flows across GraphWrapper, Charts and GeoMap.
- `../mapappbuilder/README.md` — export bundle workflow, renderer adapters and packaging details living next to the builder sources.
- `../mapappbuilder/README.md` — export bundle workflow, renderer adapters and packaging details living next to the builder sources.

Branch-specific notes:

- `BRANCH_IMPLEMENTING_DEBIAN_GRAPHS.md` — Debian imports, server-driven pagination, and the
	Home page folder ergonomics introduced on that branch. Start here if you pulled that branch.

Start with `QUICKSTART.md` to run the project, then read:

- `ARCHITECTURE.md` for the big picture and adapters
- `SELECTIONS.md` to understand the Cytoscape-like adapter API
- `API.md` if you need publications/methods or adapter event shapes
