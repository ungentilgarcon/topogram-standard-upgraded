// Tiny helper to build a sparkline SVG path from an array of numbers
// Returns { path, width, height } for convenience
function buildSparklinePath(values, width = 120, height = 24, pad = 2) {
  if (!Array.isArray(values) || values.length === 0) {
    return { path: '', width, height }
  }
  const n = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = Math.max(width, 10)
  const h = Math.max(height, 10)
  const innerW = w - pad * 2
  const innerH = h - pad * 2

  const x = (i) => pad + (i / (n - 1)) * innerW
  const y = (v) => pad + innerH - ((v - min) / span) * innerH

  const pts = values.map((v, i) => [x(i), y(v)])
  const d = pts.reduce((acc, [px, py], i) => acc + (i === 0 ? `M${px},${py}` : `L${px},${py}`), '')
  return { path: d, width: w, height: h }
}

module.exports = { buildSparklinePath }
