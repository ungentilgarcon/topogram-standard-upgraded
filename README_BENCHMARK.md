# Graph renderer benchmark & A/B test

This repository includes a simple `GraphWrapper` that can mount three implementations behind a query param.

Usage
- Run the app as usual (Meteor or your dev server) from the project root.
- Open the Topogram detail page and append a query param `?graph=cy` (Cytoscape), `?graph=sigma` (Sigma.js + Graphology), or `?graph=reagraph` (Reagraph adapter).

Files added
- `imports/client/ui/components/network/GraphWrapper.jsx` - wrapper that chooses impl from `?graph=` param or `impl` prop.
- `imports/client/ui/components/network/sigma/SigmaAdapter.js` - minimal Sigma adapter.
- `imports/client/ui/components/network/reagraph/ReagraphAdapter.js` - stub adapter for Reagraph.
- `imports/client/ui/components/network/cy/CytoscapeWrapper.js` - shim to mount existing Cytoscape component.
- `imports/client/ui/components/network/utils/cyElementsToGraphology.js` - translator for elements.
- `imports/client/ui/components/network/benchmark/benchmark.js` - simple FPS sampler and logger.

How to toggle
- Example: http://localhost:3000/topogram/123?graph=sigma

Benchmarking
- The `createBenchmarkLogger` utility provides:
  - `start()` to begin sampling FPS (1s buckets).
  - `mark(name)` to log a timestamp (e.g., 'mount', 'first-paint', 'layout-done').
  - `stop()` and `dump()` to retrieve samples.

Next steps
- Hook the benchmark logger into `TopogramDetail.jsx` lifecycle (mark mount, first render, layout completion), then compare samples across `graph` implementations.
- For production-scale testing, prepare representative dumps (1k/5k nodes) and measure interactive FPS and time-to-first-paint.
