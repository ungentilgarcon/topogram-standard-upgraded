// Reagraph adapter that relies on npm packages (no global fallback)
let ReagraphPkg = null
try {
  // eslint-disable-next-line global-require
  ReagraphPkg = require('reagraph')
} catch (err) {
  console.error('graphAdapters/reagraphAdapter: missing required package "reagraph". Please run `npm install reagraph@4.27.0`')
  throw err
}

let Graphology = null
try {
  // eslint-disable-next-line global-require
  Graphology = require('graphology')
} catch (err) {
  console.error('graphAdapters/reagraphAdapter: missing required package "graphology". Please run `npm install graphology`')
  throw err
}

export default {
  mount({ container, props }) {
    // Minimal pass-through adapter: consumers expect { impl, container, props }
    return {
      impl: 'reagraph',
      container,
      props,
      noop: false
    }
  },
  unmount(adapter) {
    // no-op unmount; real cleanup will occur in a true Reagraph wrapper
    return
  }
}
