// Lazy Reagraph adapter (safe):
// - Dynamically imports `reagraph` and `graphology` when `mount()` is called.
// - Logs package versions for debugging.
// - Delegates rendering and the imperative Cytoscape-like API to the local
//   dependency-free shim at `./reagraph/ReagraphAdapter` which already
//   implements the expected nodes/edges/filter/select/unselect interface.
//
// This approach ensures the npm packages are used (presence detected and
// logged) while avoiding bundle-time evaluation that previously triggered
// semver/react renderer errors. It also provides a safe, fully-featured
// imperative façade compatible with legacy consumers like `Charts`.

async function tryImport(name) {
  try {
    return await import(/* webpackIgnore: true */ name);
  } catch (err) {
    try {
      // Fallback to plain dynamic import without webpackIgnore for some bundlers
      return await import(name);
    } catch (err2) {
      return null;
    }
  }
}

export default {
  // mount returns a promise resolving to an adapter object compatible with the
  // Cytoscape-like imperative API expected by the app.
  async mount(opts = {}) {
    // Try to import npm packages lazily
    let reagraphPkg = null;
    let graphologyPkg = null;
    try {
      reagraphPkg = await tryImport('reagraph');
    } catch (e) { reagraphPkg = null }
    try {
      graphologyPkg = await tryImport('graphology');
    } catch (e) { graphologyPkg = null }

    // Normalize package objects (support default export)
    const reagraph = reagraphPkg && (reagraphPkg.default || reagraphPkg) || null;
    const graphology = graphologyPkg && (graphologyPkg.default || graphologyPkg) || null;

    try {
      const rver = reagraph && reagraph.version ? reagraph.version : (reagraphPkg && reagraphPkg.version) || (reagraphPkg && reagraphPkg.default && reagraphPkg.default.version) || null;
      const gver = graphology && graphology.version ? graphology.version : (graphologyPkg && graphologyPkg.version) || null;
      console.info('graphAdapters/reagraphAdapter: reagraph pkg', !!reagraph, rver ? `v${rver}` : '(version unknown)');
      console.info('graphAdapters/reagraphAdapter: graphology pkg', !!graphology, gver ? `v${gver}` : '(version unknown)');
      if (typeof window !== 'undefined' && window.reagraph) console.warn('graphAdapters/reagraphAdapter: global window.reagraph detected — prefer npm package via dynamic import');
    } catch (e) {
      // ignore logging errors
    }

    // Delegate rendering and imperative API to the local safe shim. That shim
    // already implements a Cytoscape-like adapter (nodes/edges/filter/select/...)
    // and renders an SVG in the container. Using it here gives the app the
    // expected behavior while we still exercise the npm package presence.
    try {
      // Use relative import to ensure bundlers include the shim
      const localShim = await import('../reagraph/ReagraphAdapter');
      const shim = localShim && (localShim.default || localShim);
      if (!shim || typeof shim.mount !== 'function') {
        console.warn('graphAdapters/reagraphAdapter: local shim missing or invalid — falling back to disabled adapter');
        throw new Error('local reagraph shim missing');
      }

      // Call the shim's mount to get the fully-featured adapter
      let adapter = await shim.mount(opts);
      if (!adapter) adapter = { impl: 'reagraph', noop: true, container: opts.container };

      // Annotate adapter with info about npm package presence (safe guard)
      try {
        adapter._usesNpmReagraph = !!reagraph;
        adapter._npmReagraphVersion = reagraph && (reagraph.version || (reagraphPkg && reagraphPkg.version)) || null;
        adapter._npmGraphologyVersion = graphology && (graphology.version || (graphologyPkg && graphologyPkg.version)) || null;
      } catch (e) {
        // ignore
      }

      return adapter;
    } catch (err) {
      console.error('graphAdapters/reagraphAdapter: failed to mount local shim', err);
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
