const fs = require('fs')
const path = require('path')
const Papa = require('papaparse')

const samplesDir = path.join(__dirname, '..', 'samples')
const files = fs.readdirSync(samplesDir).filter(f => f.toLowerCase().endsWith('.csv'))

function isBlank(v) { return v === null || v === undefined || String(v).trim() === '' }

files.forEach(fname => {
  const filePath = path.join(samplesDir, fname)
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r\n|\n|\r/)
  const commentLines = []
  let bodyStart = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#')) { commentLines.push(lines[i]); bodyStart = i + 1; } else break
  }
  const body = lines.slice(bodyStart).join('\n')
  const parsed = Papa.parse(body, { header: true, comments: '#', skipEmptyLines: true })
  const header = parsed.meta && parsed.meta.fields ? parsed.meta.fields : []
  if (!header.length) return

  let changed = false
  const outRows = []
  parsed.data.forEach((row, idx) => {
    const idVal = row['id'] || row[header[0]] || ''
    const src = row['source'] || row['Source'] || row['from'] || row['src'] || ''
    const tgt = row['target'] || row['Target'] || row['to'] || row['dst'] || ''
    const hasId = !isBlank(idVal)
    const hasEdge = !isBlank(src) || !isBlank(tgt)
    if (hasId && hasEdge) {
      changed = true
      // node row: keep node-like fields, clear edge fields
      const nodeRow = Object.assign({}, row)
    // clear common edge fields if present
    const edgeKeys = ['source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','extra']
    edgeKeys.forEach(k => { if (k in nodeRow) nodeRow[k] = '' })
      outRows.push(nodeRow)
      // edge row: clear node fields
      const edgeRow = {}
      header.forEach(h => edgeRow[h] = '')
      // fill edge-specific fields from original row
      if (!isBlank(src)) edgeRow['source'] = src
      if (!isBlank(tgt)) edgeRow['target'] = tgt
    const edgeFillKeys = ['edgeLabel','edgeColor','edgeWeight','relationship','enlightement','extra']
    edgeFillKeys.forEach(k => { if (k in row) edgeRow[k] = row[k] })
      outRows.push(edgeRow)
    } else {
      outRows.push(row)
    }
  })

  if (changed) {
    const csv = Papa.unparse(outRows, { quotes: true })
    const final = (commentLines.length ? commentLines.join('\n') + '\n' : '') + csv + '\n'
    fs.writeFileSync(filePath, final, 'utf8')
    console.log('Fixed mixed rows in', fname)
  }
})

console.log('fix_mixed_rows completed')
