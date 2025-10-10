import React from 'react'
import { connect } from 'react-redux'

// Action types
const UI_MERGE = 'ui/merge'
const UI_SET = 'ui/set'
const UI_INIT = 'ui/init'

// Reducer: a simple flat UI state bag compatible with existing usage
export function uiReducer(state = {}, action) {
  switch (action.type) {
    case UI_MERGE: {
      const payload = action.payload || {}
      return { ...state, ...payload }
    }
    case UI_SET: {
      const { key, value } = action
      if (typeof key !== 'string') return state
      return { ...state, [key]: value }
    }
    case UI_INIT: {
      const init = action.payload || {}
      // Only set defaults for keys that are currently undefined
      const next = { ...state }
      Object.keys(init).forEach((k) => {
        if (typeof next[k] === 'undefined') {
          const def = init[k]
          next[k] = typeof def === 'function' ? def() : def
        }
      })
      return next
    }
    default:
      return state
  }
}

// HOC decorator compatible with `@ui({ state: {...} })`
// - Injects props.ui (from state.ui) and props.updateUI
// - Applies optional default state once on mount
export default function ui(options = {}) {
  return function wrap(WrappedComponent) {
    class UICompat extends React.Component {
      componentDidMount() {
        if (options && options.state) {
          // Only dispatch init if at least one key is missing in current UI
          const defaults = options.state
          const current = this.props.ui || {}
          const needsInit = Object.keys(defaults).some((k) => typeof current[k] === 'undefined')
          if (needsInit) {
            this.props.__initUI(defaults)
          }
        }
      }
      render() {
        // Overlay defaults on first render so consumers don't see undefined
        const defaults = (options && options.state) || {}
        const current = this.props.ui || {}
        const safeUi = { ...current }
        Object.keys(defaults).forEach((k) => {
          if (typeof safeUi[k] === 'undefined') {
            const def = defaults[k]
            safeUi[k] = typeof def === 'function' ? def() : def
          }
        })
        return <WrappedComponent {...this.props} ui={safeUi} />
      }
    }

    const mapState = (state) => ({ ui: state.ui || {} })

    const mapDispatch = (dispatch) => ({
      updateUI: (arg1, arg2) => {
        // Supports updateUI({ a: 1 }) and updateUI('a', 1)
        if (arg1 && typeof arg1 === 'object') {
          dispatch({ type: UI_MERGE, payload: arg1 })
        } else if (typeof arg1 === 'string') {
          dispatch({ type: UI_SET, key: arg1, value: arg2 })
        }
      },
      __initUI: (defaultsObj) => dispatch({ type: UI_INIT, payload: defaultsObj || {} }),
    })

    return connect(mapState, mapDispatch)(UICompat)
  }
}
