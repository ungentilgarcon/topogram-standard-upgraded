// Minimal Reagraph adapter stub
// TODO: implement full adapter mapping to the app's cy API

export default {
  mount({ container, props }) {
    console.warn('ReagraphAdapter.mount: stub called - not implemented')
    // return a minimal adapter object so callers can call methods safely
    return {
      impl: 'reagraph',
      container,
      props
    }
  },
  unmount(adapter) {
    console.warn('ReagraphAdapter.unmount: stub called')
    return
  }
}
