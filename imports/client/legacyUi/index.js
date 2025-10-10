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

  // Prefer an explicitly passed `ui` prop from the parent (ownProps) over the
  // Redux `state.ui` value. This keeps components that pass a local `ui`
  // (like TopogramDetail's timelineUI) working without being overridden by
  // the connected store value.
    const mapState = (state, ownProps) => {
      // If the parent explicitly passed a `ui` prop, do not inject `ui` from
      // Redux state. Returning an empty object here prevents the connected
      // component from overwriting the parent's `ui` prop.
      if (typeof ownProps.ui !== 'undefined') return {}
      return { ui: state.ui || {} }
    }

    const mapDispatch = (dispatch, ownProps) => {
      // If the parent already provides an `updateUI` prop, do not inject a
      // different one from Redux; this preserves parent-local handlers (e.g.
      // TopogramDetail's updateUI) so they continue to work.
      const out = {
        __initUI: (defaultsObj) => dispatch({ type: UI_INIT, payload: defaultsObj || {} })
      }
      if (typeof ownProps.updateUI === 'undefined') {
        out.updateUI = (arg1, arg2) => {
          // Supports updateUI({ a: 1 }) and updateUI('a', 1)
          if (arg1 && typeof arg1 === 'object') {
            dispatch({ type: UI_MERGE, payload: arg1 })
          } else if (typeof arg1 === 'string') {
            dispatch({ type: UI_SET, key: arg1, value: arg2 })
          }
        }
      }
      return out
    }

    return connect(mapState, mapDispatch)(UICompat)
  }
}
