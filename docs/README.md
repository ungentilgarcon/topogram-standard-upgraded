# Documentation index

The `docs/` directory groups the canonical documentation for Topogram’s Meteor 3 stack, renderer adapters, data model, and workflows. Start with `QUICKSTART.md`, then drill into architecture and feature-specific guides as needed.

## Core guides
- [`QUICKSTART.md`](QUICKSTART.md) – install dependencies, run the development server, and import your first dataset.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) – system overview, renderer adapter contract, and the relationship between network, map, charts, and timeline surfaces.
- [`DATASET.md`](DATASET.md) – Topograms/Nodes/Edges schema reference, denormalised `nodeCount`/`edgeCount`, and folder metadata fields.
- [`API.md`](API.md) – publications, methods (including the new folder administration helpers), and adapter helper APIs.
- [`SELECTIONS.md`](SELECTIONS.md) – how selection propagates across Cytoscape, Sigma, Reagraph, MapLibre, Leaflet, and Cesium.
- [`RECENT_PROGRESS.md`](RECENT_PROGRESS.md) – rolling summary of the latest week’s work.

## Dependency and tooling references
- [`DEPENDENCY_GRAPH.md`](DEPENDENCY_GRAPH.md) – high-level dependency diagram for the Meteor app.
- [`DEPENDENCY_GRAPH_BUILDER.md`](DEPENDENCY_GRAPH_BUILDER.md) – scripts/assets for generating code dependency graphs.
- [`BRANCH_IMPLEMENTING_DEBIAN_GRAPHS.md`](BRANCH_IMPLEMENTING_DEBIAN_GRAPHS.md) – pagination, folder counts, and Debian import workflow background.

## Builder & exports
- [`../mapappbuilder/README.md`](../mapappbuilder/README.md) – MapApp Builder workflow for packaging a single Topogram into a static bundle.
- [`docs/mapappbuilder/README.md`](mapappbuilder/README.md) – supporting notes, dependency graphs, and sandbox instructions for MapApp Builder.

## Project process
- [`CONTRIBUTING.md`](CONTRIBUTING.md) – contribution workflow, branch naming, pre-push hook.
- [`CHANGELOG_FULL.md`](CHANGELOG_FULL.md) – machine-generated log of every commit (including merged branches) since the project’s creation.

Looking for something else? Browse the remaining Markdown files in this folder or raise a documentation issue in the repository tracker.
