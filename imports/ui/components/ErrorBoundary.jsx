import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    try { console.error('ErrorBoundary caught', error, info); } catch (e) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12, background: '#400', color: 'white' }}>
          <h3>Something went wrong rendering this view.</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error && this.state.error.message)}</pre>
          <div style={{ marginTop: 8 }}>Check the developer console for full diagnostics.</div>
        </div>
      )
    }
    return this.props.children
  }
}
