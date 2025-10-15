import React, { useEffect, useRef } from 'react';
import './sigma/sigma.css';

// Adapters
import SigmaAdapter from './sigma/SigmaAdapter';
import ReagraphAdapter from './reagraph/ReagraphAdapter';
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
        adapterRef.current = await ReagraphAdapter.mount({
          container: containerRef.current,
          elements,
          layout,
          stylesheet,
        });
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
