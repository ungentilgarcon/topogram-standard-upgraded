// Lazy Reagraph adapter (npm-backed):
// - Dynamically imports `reagraph` and `graphology` when `mount()` is called.
// - Logs package versions for debugging.
// - Delegates rendering and the imperative Cytoscape-like API to the full
//   React-based adapter at `./reagraph/RealReagraphAdapter`.
//
// This ensures npm packages are used while avoiding bundle-time evaluation.
// The returned adapter remains compatible with legacy consumers (Charts, etc.).

import loadReagraphModule from '../reagraph/loadReagraph.js';

async function tryImport(name, extraSpecs = []) {
  const attempts = [name, ...extraSpecs];
  for (let i = 0; i < attempts.length; i += 1) {
    const spec = attempts[i];
    if (!spec) continue;
    try {
      return await import(spec);
    } catch (errImport) {
      try {
        if (typeof module !== 'undefined' && module && typeof module.dynamicImport === 'function') {
          // Meteor exposes module.dynamicImport for runtime loading
          return await module.dynamicImport(spec);
        }
      } catch (errDyn) {
        // ignore
      }
      try {
        if (typeof require === 'function') {
          // eslint-disable-next-line global-require, import/no-dynamic-require
          return require(spec);
        }
      } catch (errRequire) {
        // ignore and try next specifier
      }
    }
  }
  return null;
}

export default {
  // mount returns a promise resolving to an adapter object compatible with the
  // Cytoscape-like imperative API expected by the app.
  async mount(opts = {}) {
    // Try to import npm packages lazily
    const reagraph = await loadReagraphModule();
    const graphologyPkg = await tryImport('graphology', ['graphology/dist/graphology.cjs', 'graphology/dist/graphology.min.js']);

    // Normalize package objects (support default export)
    const graphology = graphologyPkg && (graphologyPkg.default || graphologyPkg) || null;

    try {
      const rver = reagraph && reagraph.version ? reagraph.version : null;
      const gver = graphology && graphology.version ? graphology.version : (graphologyPkg && graphologyPkg.version) || null;
      console.info('graphAdapters/reagraphAdapter: reagraph pkg', !!reagraph, rver ? `v${rver}` : '(version unknown)');
      console.info('graphAdapters/reagraphAdapter: graphology pkg', !!graphology, gver ? `v${gver}` : '(version unknown)');
      if (typeof window !== 'undefined' && window.reagraph) console.warn('graphAdapters/reagraphAdapter: global window.reagraph detected — prefer npm package via dynamic import');
    } catch (e) {
      // ignore logging errors
    }

    // Delegate rendering and imperative API to the full React-based adapter.
    try {
      // Load the real adapter only
      const shimModule = await import('../reagraph/RealReagraphAdapter');

      const shim = shimModule && (shimModule.default || shimModule);
      if (!shim || typeof shim.mount !== 'function') {
        console.error('graphAdapters/reagraphAdapter: RealReagraphAdapter missing or invalid');
        throw new Error('RealReagraphAdapter missing');
      }

  // Call the shim's mount to get the fully-featured adapter
  let adapter = await shim.mount(opts, { reagraph, graphology });
      if (!adapter) adapter = { impl: 'reagraph', noop: true, container: opts.container };

      // Annotate adapter with info about npm package presence (safe guard)
      try {
        adapter._usesNpmReagraph = !!reagraph;
  adapter._npmReagraphVersion = reagraph && reagraph.version ? reagraph.version : null;
        adapter._npmGraphologyVersion = graphology && (graphology.version || (graphologyPkg && graphologyPkg.version)) || null;
      } catch (e) {
        // ignore
      }

      return adapter;
    } catch (err) {
      console.error('graphAdapters/reagraphAdapter: failed to mount RealReagraphAdapter', err);
      // Return a no-op adapter to avoid crashing the caller
      return { impl: 'reagraph', noop: true };
    }
  },

  async unmount(adapter) {
    try {
      if (!adapter) return;
      if (typeof adapter.destroy === 'function') { adapter.destroy(); return; }
      if (typeof adapter.unmount === 'function') { adapter.unmount(adapter); return; }
      // best-effort cleanup: if adapter.container holds a React root, attempt to unmount
      try {
        if (adapter && adapter.container) {
          // try react-dom/client unmount
          try {
            const rdom = await tryImport('react-dom/client');
            const createRoot = rdom && (rdom.createRoot || (rdom.default && rdom.default.createRoot));
            if (createRoot && adapter._root) {
              try { adapter._root.unmount(); } catch (e) {}
            }
          } catch (e) {}
        }
      } catch (e) {}
    } catch (e) { /* swallow */ }
  }
}
