import React from 'react'
import PropTypes from 'prop-types'
// Charts receives `ui` (with cy) from its parent TopogramDetail
import { CardCompat as Card, CardTitleCompat as CardTitle, CardActionsCompat as CardActions } from '/imports/startup/client/muiCompat'
import RechartsDonutChart from './RechartsDonutChart.jsx'
import { DEFAULT_COLORS } from '/imports/client/helpers/colors.js'
import { buildSparklinePath } from './sparkline'
import Button from '@mui/material/Button'
import Popup from '/imports/client/ui/components/common/Popup.jsx'
// Stats: replace deprecated statistical-js with simple-statistics
import { mean as ssMean, sampleStandardDeviation as ssStdev, tTest as ssTTest } from 'simple-statistics'
import jStat from 'jstat'

// Robust percentile helper (0..1). Returns NaN for empty arrays.
function percentile(arr, p) {
  if (!Array.isArray(arr) || arr.length === 0) return NaN
  const a = arr.slice().sort((x,y) => x - y)
  const pos = (a.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return a[lo]
  const h = pos - lo
  return a[lo] * (1 - h) + a[hi] * h
}

class Charts extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      alpha: 0.05,
      showT: true,
      showChi2: true
    }
  }

  componentDidMount() {
    const fire = () => { try { window.dispatchEvent(new Event('resize')) } catch (e) {} }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire)
    setTimeout(fire, 80)
  }

  static propTypes = {
    selectElement: PropTypes.func,
    unselectElement: PropTypes.func
  }

  selectElement = (el) => {
    if (!el) return
    el.data.selected = true
    const { cy } = this.props.ui
    const filter = `${el.group.slice(0,-1)}[id='${el.data.id}']`
    cy.filter(filter).data('selected', true)
    this.props.updateUI('selectedElements', [...this.props.ui.selectedElements, el])
  }

  unselectElement = (el) => {
    if (!el) return
    el.data.selected = false
    const { cy, isolateMode } = this.props.ui
    const filter = `${el.group.slice(0,-1)}[id='${el.data.id}']`
    cy.filter(filter).data('selected', false)
    const remainingElements = this.props.ui.selectedElements.filter(n => !(n.data.id === el.data.id && n.group === el.group))
    this.props.updateUI('selectedElements', remainingElements)
    if (!remainingElements.length && isolateMode) this.handleExitIsolateMode && this.handleExitIsolateMode()
  }

  unselectAllElements = () => {
    const { cy, selectedElements } = this.props.ui
    cy.elements().data('selected', false)
    selectedElements.forEach(el => el.data.selected = false)
    this.props.updateUI('selectedElements', [])
  }

  handleClickChartNodeElement = (payload) => {
    try {
      const id = payload && (payload.id != null ? payload.id : payload.name)
      const target = String(id)
      const { cy } = this.props.ui
      const cyNodes = cy.filter('node')
      const matches = []
      for (let i = 0; i < cyNodes.length; i++) {
        const cyEl = cyNodes[i]
        const w = Number(cyEl && cyEl.data && cyEl.data('weight'))
        if (!isFinite(w)) continue
        const bin = String(Math.round(Math.pow(w, 2)))
        if (bin === target) matches.push(cyEl.json())
      }
      this._toggleBatch(matches)
    } catch (_) {}
  }

  handleClickChartEdgeElement = (payload) => {
    try {
      const id = payload && (payload.id != null ? payload.id : payload.name)
      const target = String(id)
      const { cy } = this.props.ui
      const cyEdges = cy.filter('edge')
      const matches = []
      for (let i = 0; i < cyEdges.length; i++) {
        const cyEl = cyEdges[i]
        const w = String(cyEl && cyEl.data && cyEl.data('weight'))
        if (w === target) matches.push(cyEl.json())
      }
      this._toggleBatch(matches)
    } catch (_) {}
  }

  // Toggle a batch of elements in a single state update so all chips appear
  _toggleBatch = (elements) => {
    if (!Array.isArray(elements) || elements.length === 0) return
    const { cy } = this.props.ui
    const curr = Array.isArray(this.props.ui.selectedElements) ? this.props.ui.selectedElements.slice() : []
    const key = (e) => `${e.group}|${e.data && e.data.id}`
    const currKeys = new Set(curr.map(key))
    const matchKeys = elements.map(key)
    const allSelected = matchKeys.length > 0 && matchKeys.every(k => currKeys.has(k))

    if (allSelected) {
      // Unselect all matches
      const next = curr.filter(e => !matchKeys.includes(key(e)))
      elements.forEach(el => {
        try {
          // ensure group exists on provided element JSON
          if (!el.group) el.group = (el.data && (el.data.source != null || el.data.target != null)) ? 'edges' : 'nodes'
          const sel = `${el.group.slice(0,-1)}[id='${el.data.id}']`
          try { cy.filter(sel).unselect() } catch (_) { try { cy.filter(sel).data('selected', false) } catch (_) {} }
        } catch (_) {}
      })
      this.props.updateUI('selectedElements', next)
    } else {
      // Select union without duplicates
      const map = new Map(curr.map(e => [key(e), e]))
      elements.forEach(el => {
        try {
          if (!el.group) el.group = (el.data && (el.data.source != null || el.data.target != null)) ? 'edges' : 'nodes'
          map.set(key(el), el)
          const sel = `${el.group.slice(0,-1)}[id='${el.data.id}']`
          try { cy.filter(sel).select() } catch (_) { try { cy.filter(sel).data('selected', true) } catch (_) {} }
        } catch (_) {
          map.set(key(el), el)
        }
      })
      this.props.updateUI('selectedElements', Array.from(map.values()))
    }
  }

  render() {
    const { cy } = this.props.ui

    // Compute donut data and stats
    let nodesDonutData = []
    let edgesDonutData = []
    let resweig = []
    let resweigEdges = []
    try {
      // In Cytoscape v3, internal _private.initrender may not exist; compute whenever cy is available
      if (cy && typeof cy.nodes === 'function' && typeof cy.filter === 'function') {
        const cyNodes = cy.filter('node')
        const cyEdges = cy.filter('edge')
        for (let i = 0; i < cyNodes.length; i++) {
          const el = cyNodes[i]
          const rawW = (el && typeof el.data === 'function') ? el.data('weight') : (el && el.json && el.json().data && el.json().data.weight)
          const w = Number(rawW)
          if (isFinite(w)) {
            const val = Math.round(Math.pow(w, 2))
            if (isFinite(val)) resweig.push(val)
          }
        }
        for (let i = 0; i < cyEdges.length; i++) {
          const el = cyEdges[i]
          const rawW = (el && typeof el.data === 'function') ? el.data('weight') : (el && el.json && el.json().data && el.json().data.weight)
          const w = Number(rawW)
          // If no numeric weight is present, treat the edge as weight 1 (count)
          if (isFinite(w)) {
            resweigEdges.push(w)
          } else {
            resweigEdges.push(1)
          }
        }
        const nodesMap = {}
        resweig.forEach(v => { const k = String(v); nodesMap[k] = (nodesMap[k] || 0) + 1 })
        const edgesMap = {}
        resweigEdges.forEach(v => { const k = String(v); edgesMap[k] = (edgesMap[k] || 0) + 1 })
        const nodesEntries = Object.keys(nodesMap).map(k => [Number(k), nodesMap[k]]).sort((a,b)=>a[0]-b[0])
        const edgesEntries = Object.keys(edgesMap).map(k => [Number(k), edgesMap[k]]).sort((a,b)=>a[0]-b[0])
        nodesDonutData = nodesEntries.map(([name, value]) => ({ name: String(name), value: Number(value) }))
        edgesDonutData = edgesEntries.map(([name, value]) => ({ name: String(name), value: Number(value) }))

        // Helper: safe arrays
        const safe = (arr) => Array.isArray(arr) && arr.length > 0 ? arr : [0]
        const nodesArr = safe(resweig)
        const edgesArr = safe(resweigEdges)

        // Summary stats using simple-statistics
        const summaryNodes = {
          mean: ssMean(nodesArr),
          standardDeviation: ssStdev(nodesArr),
          count: nodesArr.length
        }
        const summaryEdges = {
          mean: ssMean(edgesArr),
          standardDeviation: ssStdev(edgesArr),
          count: edgesArr.length
        }

        // One-sample t-test (t statistic only; p-value omitted)
        let ttestN = null, ttestE = null
        let pvalN = undefined, pvalE = undefined
        try {
          ttestN = ssTTest(nodesArr, 4)
          const dfN = Math.max(1, nodesArr.length - 1)
          // two-sided p-value from t distribution
          pvalN = 2 * (1 - jStat.studentt.cdf(Math.abs(ttestN), dfN))
        } catch (_) {}
        try {
          ttestE = ssTTest(edgesArr, 4)
          const dfE = Math.max(1, edgesArr.length - 1)
          pvalE = 2 * (1 - jStat.studentt.cdf(Math.abs(ttestE), dfE))
        } catch (_) {}

        // Chi-squared goodness-of-fit against Poisson(lambda = sample mean)
        const poissonPMF = (k, lambda) => {
          if (lambda <= 0) return 0
          if (k < 0) return 0
          // naive factorial for small k
          let fact = 1
          for (let i = 2; i <= k; i++) fact *= i
          return Math.exp(-lambda) * Math.pow(lambda, k) / fact
        }
        const chi2Poisson = (bins, lambda) => {
          try {
            const N = bins.reduce((acc, d) => acc + (Number(d.value) || 0), 0)
            if (!isFinite(N) || N <= 0 || !isFinite(lambda) || lambda <= 0) return null
            let chi2 = 0
            let df = 0
            bins.forEach((d) => {
              const k = Number(d.name)
              const obs = Number(d.value)
              if (!isFinite(k) || !isFinite(obs)) return
              const expected = N * poissonPMF(Math.max(0, Math.round(k)), lambda)
              if (expected > 0) {
                chi2 += Math.pow(obs - expected, 2) / expected
                df += 1
              }
            })
            // subtract 1 for sum constraint, 1 for estimated lambda
            df = Math.max(1, df - 2)
            let p = undefined
            try { p = 1 - jStat.chisquare.cdf(chi2, df) } catch (_) {}
            return { chi2, df, lambda, p }
          } catch (_) { return null }
        }

        const chi2Nodes = nodesDonutData.length ? chi2Poisson(nodesDonutData, summaryNodes.mean) : null
        const chi2Edges = edgesDonutData.length ? chi2Poisson(edgesDonutData, summaryEdges.mean) : null
        this._stats = {
          nodes: {
            mean: summaryNodes.mean,
            median: Array.isArray(nodesArr) ? nodesArr.slice().sort((a,b)=>a-b)[Math.floor(nodesArr.length/2)] : undefined,
            p25: Array.isArray(nodesArr) ? percentile(nodesArr, 0.25) : undefined,
            p75: Array.isArray(nodesArr) ? percentile(nodesArr, 0.75) : undefined,
            stdev: summaryNodes.standardDeviation,
            n: summaryNodes.count,
            t: (typeof ttestN === 'number') ? ttestN : undefined,
            p: (typeof pvalN === 'number') ? pvalN : undefined
          },
          edges: {
            mean: summaryEdges.mean,
            median: Array.isArray(edgesArr) ? edgesArr.slice().sort((a,b)=>a-b)[Math.floor(edgesArr.length/2)] : undefined,
            p25: Array.isArray(edgesArr) ? percentile(edgesArr, 0.25) : undefined,
            p75: Array.isArray(edgesArr) ? percentile(edgesArr, 0.75) : undefined,
            stdev: summaryEdges.standardDeviation,
            n: summaryEdges.count,
            t: (typeof ttestE === 'number') ? ttestE : undefined,
            p: (typeof pvalE === 'number') ? pvalE : undefined
          },
          chi2: { nodes: chi2Nodes, edges: chi2Edges }
        }
        this._resweigRaw = Array.isArray(resweig) ? resweig.slice() : []
        this._resweigEdgesRaw = Array.isArray(resweigEdges) ? resweigEdges.slice() : []
        this._debug = {
          cyNodes: (cy && typeof cy.nodes === 'function') ? cy.nodes().length : 0,
          cyEdges: (cy && typeof cy.edges === 'function') ? cy.edges().length : 0,
          resweigLen: Array.isArray(resweig) ? resweig.length : 0,
          resweigEdgesLen: Array.isArray(resweigEdges) ? resweigEdges.length : 0,
          nodesDonutDataLen: Array.isArray(nodesDonutData) ? nodesDonutData.length : 0,
          edgesDonutDataLen: Array.isArray(edgesDonutData) ? edgesDonutData.length : 0,
          sampleNode: (cyNodes && cyNodes.length && cyNodes[0] && cyNodes[0].json) ? JSON.stringify(cyNodes[0].json().data) : null,
          sampleEdge: (cyEdges && cyEdges.length && cyEdges[0] && cyEdges[0].json) ? JSON.stringify(cyEdges[0].json().data) : null
        }
      }
    } catch (_) {}

    // Selected bins
    let selectedNodeNames = new Set()
    let selectedEdgeNames = new Set()
    try {
      const selected = (this.props.ui && this.props.ui.selectedElements) ? this.props.ui.selectedElements : []
      selectedNodeNames = new Set(
        selected
          .filter(el => el && el.group === 'nodes' && el.data && el.data.weight != null)
          .map(el => String(Math.round(Math.pow(el.data.weight, 2))))
      )
      selectedEdgeNames = new Set(
        selected
          .filter(el => el && el.group === 'edges' && el.data && el.data.weight != null)
          .map(el => String(el.data.weight))
      )
      this._nodesBinsKey = Array.from(selectedNodeNames).sort().join(',')
      this._edgesBinsKey = Array.from(selectedEdgeNames).sort().join(',')
    } catch (_) {}

    // Popup size
    const vw = (typeof window !== 'undefined') ? window.innerWidth : 1200
    const vh = (typeof window !== 'undefined') ? window.innerHeight : 800
    const popupWidth = Math.min(900, Math.max(600, Math.round(vw * 0.7)))
    const popupHeight = Math.min(900, Math.max(560, Math.round(vh * 0.8)))

    const palette = Array.isArray(DEFAULT_COLORS) && DEFAULT_COLORS.length ? DEFAULT_COLORS : ['#1976D2','#FB8C00','#43A047','#E53935','#8E24AA','#00897B','#FDD835','#78909C']
    const { showT, showChi2 } = this.state
  const light = !!this.props.light
  const textColor = '#222' 
  const subtitleColor =  '#444' 
  const buttonSx = { color: textColor, borderColor:'#ccc', height: 40 }

    return (
      <Popup
        light={true}
        show
        title={'Charts'}
        onClose={() => {
          try { console.log('[Charts] Popup onClose called - calling updateUI(chartsVisible,false)') } catch (e) {}
          try { this.props.updateUI('chartsVisible', false) } catch (e) { console.error('[Charts] updateUI threw', e) }
        }}
        onPopOut={() => {
          try { console.log('[Charts] Popup onPopOut called') } catch (e) {}
          this.setState({ poppedOut: true })
        }}
        width={popupWidth}
        height={popupHeight}
      >
        <div>
          <CardTitle
            title='Charts'
            titleStyle={{ fontSize : '12pt', lineHeight : '1em', color: textColor }}
            subtitle='Nodes repartition'
            subtitleStyle={{ fontSize : '9pt', lineHeight : '1.2em', color: subtitleColor }}
          />
          <RechartsDonutChart
            data={nodesDonutData}
            colors={palette}
            selectedNames={selectedNodeNames}
            onItemClick={(name) => this.handleClickChartNodeElement({ name })}
            title={'nodes'}
            onContainer={(el) => { this._nodesContainer = el }}
            style={{ marginBottom: 8 }}
            key={`nodes-${this._nodesBinsKey || 'none'}`}
          />
          {this._stats && this._stats.nodes ? (
            <div style={{ color:textColor, fontSize:'9pt', marginTop: 8 }}>
              <strong>Nodes stats:</strong>
              <span style={{ marginLeft: 8 }}>n={this._stats.nodes.n}</span>
              <span style={{ marginLeft: 8 }}>mean={Number(this._stats.nodes.mean).toFixed(3)}</span>
              <span style={{ marginLeft: 8 }}>sd={Number(this._stats.nodes.stdev || 0).toFixed(3)}</span>
              <span style={{ marginLeft: 8 }}>p25={this._stats.nodes.p25 != null ? Number(this._stats.nodes.p25).toFixed(2) : '—'}</span>
              <span style={{ marginLeft: 8 }}>p50={this._stats.nodes.median != null ? Number(this._stats.nodes.median).toFixed(2) : '—'}</span>
              <span style={{ marginLeft: 8 }}>p75={this._stats.nodes.p75 != null ? Number(this._stats.nodes.p75).toFixed(2) : '—'}</span>
              {showT ? (
                <>
                  <span style={{ marginLeft: 8 }}>t≈{this._stats.nodes.t != null ? Number(this._stats.nodes.t).toFixed(3) : '—'}</span>
                  <span style={{ marginLeft: 8 }}>p≈{this._stats.nodes.p != null ? Number(this._stats.nodes.p).toExponential(2) : '—'}</span>
                </>
              ) : null}
              {showChi2 && this._stats.chi2 && this._stats.chi2.nodes ? (
                <span style={{ marginLeft: 8 }}>chi2={JSON.stringify(this._stats.chi2.nodes)}</span>
              ) : null}
              {Array.isArray(this._resweigRaw) && this._resweigRaw.length > 0 ? (() => {
                const numeric = this._resweigRaw.filter(v => typeof v === 'number' && isFinite(v))
                const s = buildSparklinePath(numeric)
                return (
                  <svg width={s.width} height={s.height} style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                    <path d={s.path} stroke="#80CBC4" strokeWidth="1.5" fill="none" />
                  </svg>
                )
              })() : null}
            </div>
          ) : null}
        </div>

        <div>
          <CardTitle
            subtitle='Edges repartition'
            subtitleStyle={{ fontSize : '9pt', lineHeight : '1.2em', color: subtitleColor }}
          />
          {Array.isArray(edgesDonutData) && edgesDonutData.length > 0 ? (
            <RechartsDonutChart
              data={edgesDonutData}
              colors={palette}
              selectedNames={selectedEdgeNames}
              onItemClick={(name) => this.handleClickChartEdgeElement({ name })}
              title={'edges'}
              onContainer={(el) => { this._edgesContainer = el }}
              style={{ marginBottom: 8 }}
              key={`edges-${this._edgesBinsKey || 'none'}`}
            />
          ) : (
            <div style={{ color:textColor, fontSize:'9pt', marginTop: 8 }}>
              No edges data to display
              <div style={{ marginTop: 6, opacity: 0.85 }}>
                <div>cy nodes: {this._debug && this._debug.cyNodes}</div>
                <div>cy edges: {this._debug && this._debug.cyEdges}</div>
                <div>resweig (nodes) count: {this._debug && this._debug.resweigLen}</div>
                <div>resweigEdges (edges) count: {this._debug && this._debug.resweigEdgesLen}</div>
                <div>nodes bins: {this._debug && this._debug.nodesDonutDataLen}</div>
                <div>edges bins: {this._debug && this._debug.edgesDonutDataLen}</div>
                {this._debug && this._debug.sampleNode ? (<div style={{ marginTop: 6, wordBreak: 'break-all', color: subtitleColor }}>sample node: {this._debug.sampleNode}</div>) : null}
                {this._debug && this._debug.sampleEdge ? (<div style={{ marginTop: 6, wordBreak: 'break-all', color: subtitleColor }}>sample edge: {this._debug.sampleEdge}</div>) : null}
              </div>
            </div>
          )}
          {this._stats && this._stats.edges ? (
            <div style={{ color:textColor, fontSize:'9pt', marginTop: 8 }}>
              <strong>Edges stats:</strong>
              <span style={{ marginLeft: 8 }}>n={this._stats.edges.n}</span>
              <span style={{ marginLeft: 8 }}>mean={Number(this._stats.edges.mean).toFixed(3)}</span>
              <span style={{ marginLeft: 8 }}>sd={Number(this._stats.edges.stdev || 0).toFixed(3)}</span>
              <span style={{ marginLeft: 8 }}>p25={this._stats.edges.p25 != null ? Number(this._stats.edges.p25).toFixed(2) : '—'}</span>
              <span style={{ marginLeft: 8 }}>p50={this._stats.edges.median != null ? Number(this._stats.edges.median).toFixed(2) : '—'}</span>
              <span style={{ marginLeft: 8 }}>p75={this._stats.edges.p75 != null ? Number(this._stats.edges.p75).toFixed(2) : '—'}</span>
              {showT ? (
                <>
                  <span style={{ marginLeft: 8 }}>t≈{this._stats.edges.t != null ? Number(this._stats.edges.t).toFixed(3) : '—'}</span>
                  <span style={{ marginLeft: 8 }}>p≈{this._stats.edges.p != null ? Number(this._stats.edges.p).toExponential(2) : '—'}</span>
                </>
              ) : null}
              {showChi2 && this._stats.chi2 && this._stats.chi2.edges ? (
                <span style={{ marginLeft: 8 }}>chi2={JSON.stringify(this._stats.chi2.edges)}</span>
              ) : null}
              {Array.isArray(this._resweigEdgesRaw) && this._resweigEdgesRaw.length > 0 ? (() => {
                const numeric = this._resweigEdgesRaw.filter(v => typeof v === 'number' && isFinite(v))
                const s = buildSparklinePath(numeric)
                return (
                  <svg width={s.width} height={s.height} style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                    <path d={s.path} stroke="#FFCC80" strokeWidth="1.5" fill="none" />
                  </svg>
                )
              })() : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, margin: '18px 0 46px', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            onClick={this.unselectAllElements}
            sx={buttonSx}
          >
            Reset selection
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              try {
                const container = this._nodesContainer
                if (!container) return
                const svg = container.querySelector('svg')
                if (!svg) return
                const clone = svg.cloneNode(true)
                const xml = new XMLSerializer().serializeToString(clone)
                const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
                const url = URL.createObjectURL(svgBlob)
                const img = new Image()
                img.onload = () => {
                  const canvas = document.createElement('canvas')
                  canvas.width = img.width
                  canvas.height = img.height
                  const ctx = canvas.getContext('2d')
                  ctx.drawImage(img, 0, 0)
                  URL.revokeObjectURL(url)
                  canvas.toBlob((blob) => {
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = 'nodes-chart.png'
                    a.click()
                  }, 'image/png')
                }
                img.src = url
              } catch (_) {}
            }}
            sx={buttonSx}
          >
            Export PNG
          </Button>
        </div>
      </Popup>
    )
  }
}

export default Charts
