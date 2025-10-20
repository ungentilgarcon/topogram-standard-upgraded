import React, { useEffect, useRef } from 'react';
import './sigma/sigma.css';

// Adapters
import SigmaAdapter from './sigma/SigmaAdapter';
// Note: do not statically import the npm-backed reagraph adapter here because
// it may evaluate heavy packages at bundle-time. We'll lazy-load
// `./graphAdapters/reagraphAdapter.js` when requested.
import CytoscapeWrapper from './cy/CytoscapeWrapper';

/**
 * GraphWrapper
 * Props:
 *  - elements: cytoscape-style elements array
 *  - layout: layout descriptor
 *  - stylesheet: cytoscape stylesheet (optional)
 *  - cyCallback: function(adapter) called when adapter is ready
 *  - impl: optional override ('cy'|'sigma'|'reagraph')
 */
export default function GraphWrapper(props) {
  const { elements, layout, stylesheet, cyCallback, impl: implProp } = props;
  const containerRef = useRef(null);
  const adapterRef = useRef(null);

  // Decide implementation from query param or prop (use URLSearchParams to avoid extra dependency)
  const impl = implProp || (typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('graph') || 'cy') : 'cy');

  useEffect(() => {
    let mounted = true;

    async function mount() {
      if (!containerRef.current) return;

      if (impl === 'sigma') {
        adapterRef.current = await SigmaAdapter.mount({
          container: containerRef.current,
          elements,
          layout,
          stylesheet,
        });
      } else if (impl === 'reagraph') {
        // Lazy-load the adapter facade that will import the npm packages only
        // at mount time and delegate to the local shim for the imperative API.
        try {
          const mod = await import(/* webpackChunkName: "adapter-reagraph" */ './graphAdapters/reagraphAdapter');
          const Adapter = mod && (mod.default || mod);
          if (!Adapter || typeof Adapter.mount !== 'function') throw new Error('invalid reagraph adapter');
          adapterRef.current = await Adapter.mount({
            container: containerRef.current,
            elements,
            layout,
            stylesheet,
          });
        } catch (err) {
          console.error('GraphWrapper: failed to load reagraph adapter', err);
          // fallback to local shim directly if lazy adapter fails
          const Shim = (await import('./reagraph/ReagraphAdapter')).default;
          adapterRef.current = await Shim.mount({ container: containerRef.current, elements, layout, stylesheet });
        }
      } else {
        // default to Cytoscape wrapper which expects the same props
        adapterRef.current = await CytoscapeWrapper.mount({
          container: containerRef.current,
          elements,
          layout,
          stylesheet,
        });
      }

      if (mounted && typeof cyCallback === 'function') {
        try { cyCallback(adapterRef.current); } catch (err) { console.error('cyCallback failed', err); }
      }
    }

    mount();

    return () => {
      mounted = false;
      if (adapterRef.current && adapterRef.current.destroy) {
        try { adapterRef.current.destroy(); } catch (err) { console.warn('adapter destroy err', err); }
      }
    };
  }, [containerRef, impl, elements, layout, stylesheet]);

  return (
    <div className="sigma-container" style={{ width: '100%', height: '100%' }} ref={containerRef} />
  );
}
