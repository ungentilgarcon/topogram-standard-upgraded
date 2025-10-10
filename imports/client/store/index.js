import { createStore, applyMiddleware, compose } from 'redux'
import thunkImport, { thunk as namedThunk } from 'redux-thunk'

// Minimal root reducer with ui slice; projects can extend this reducer
function rootReducer(state = {}, action) {
  // Keep ui slice if already present
  if (action && action.type && action.type.startsWith('ui/')) {
    switch (action.type) {
      case 'ui/merge': return { ...state, ui: { ...(state.ui || {}), ...(action.payload || {}) } }
      case 'ui/set': return { ...state, ui: { ...(state.ui || {}), [action.key]: action.value } }
      case 'ui/init': {
        const init = action.payload || {}
        const nextUi = { ...(state.ui || {}) }
        Object.keys(init).forEach((k) => { if (typeof nextUi[k] === 'undefined') nextUi[k] = init[k] })
        return { ...state, ui: nextUi }
      }
      default: return state
    }
  }
  return state
}


// Resolve redux-thunk export shape across module systems
const resolvedThunk = (typeof namedThunk === 'function')
  ? namedThunk
  : (typeof thunkImport === 'function'
      ? thunkImport
      : (thunkImport && typeof thunkImport.default === 'function' ? thunkImport.default : null))

// Only keep valid middleware functions
const middlewares = [resolvedThunk].filter((mw) => typeof mw === 'function')

const composeEnhancers = (typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) || compose

const store = createStore(rootReducer, composeEnhancers(applyMiddleware(...middlewares)))

try {
  if (typeof window !== 'undefined') {
    window.__TOPOGRAM_STORE__ = store
    try { window.TOPOGRAM_STORE = store } catch (e) {}
    if (typeof console !== 'undefined' && console.info) console.info('TOPOGRAM-M3-APP: store created and exposed on window.__TOPOGRAM_STORE__')
  }
} catch (e) {}

export default store
