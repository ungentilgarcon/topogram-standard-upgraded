import * as reagraphModule from 'reagraph';
import * as graphologyModule from 'graphology';

// Expose to global for the presentation template to consume
(function(root){
  try{
    // expose the imported module namespaces directly (avoid referencing .default which may not exist)
    root.reagraph = reagraphModule || null;
    root.graphology = graphologyModule || null;
    // Do not attempt to read internal version properties at build-time - access them at runtime via globals if needed.
  }catch(e){
    // ignore
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {})));
