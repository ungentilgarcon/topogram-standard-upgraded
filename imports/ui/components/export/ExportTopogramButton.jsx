import React from 'react'

// Lightweight CSV exporter: creates two CSV files (nodes, edges) and triggers downloads
function toCSV(rows, headers) {
  const esc = (v) => {
    if (v == null) return ''
    if (typeof v === 'object') return '"' + JSON.stringify(v).replace(/"/g, '""') + '"'
    const s = String(v)
    if (s.indexOf(',') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('"') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const headerLine = headers.join(',')
  const lines = rows.map(r => headers.map(h => esc(r[h])).join(','))
  return [headerLine].concat(lines).join('\n')
}

function downloadBlob(filename, content, mime='text/csv;charset=utf-8'){
  try {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('downloadBlob failed', e)
  }
}

export default function ExportTopogramButton({ nodes = [], edges = [], top = null }){
  const handleExport = () => {
    try {
      // Nodes CSV: id,label,weight,topogramId,rawData,color,pos_x,pos_y,extra(json)
      const nodeHeaders = ['id','label','weight','topogramId','rawWeight','color','pos_x','pos_y','data']
      const nodeRows = nodes.map(n => {
        const data = (n && n.data) ? n.data : {}
        return {
          id: (data && data.id) || n._id || '',
          label: data && (data.name || data.label) || n.name || '',
          weight: data && (data.weight != null ? data.weight : (data.rawWeight != null ? data.rawWeight : '')),
          topogramId: data && data.topogramId || n.topogramId || (top && top._id) || '',
          rawWeight: data && data.rawWeight || '',
          color: data && (data.color || data.fillColor || data.bg) || '',
          pos_x: n.position && typeof n.position.x === 'number' ? n.position.x : '',
          pos_y: n.position && typeof n.position.y === 'number' ? n.position.y : '',
          data: data
        }
      })
      const nodesCsv = toCSV(nodeRows, nodeHeaders)
      downloadBlob(`${(top && (top.title || top.name)) ? (String(top.title || top.name).replace(/\s+/g,'_')) : 'topogram'}-nodes.csv`, nodesCsv)

      // Edges CSV: id,source,target,color,data
      const edgeHeaders = ['id','source','target','color','data']
      const edgeRows = edges.map(e => {
        const data = (e && e.data) ? e.data : {}
        return {
          id: e._id || (data && data.id) || '',
          source: data && (data.source || data.from) || e.source || '',
          target: data && (data.target || data.to) || e.target || '',
          color: data && (data.color || data.strokeColor) || '',
          data: data
        }
      })
      const edgesCsv = toCSV(edgeRows, edgeHeaders)
      downloadBlob(`${(top && (top.title || top.name)) ? (String(top.title || top.name).replace(/\s+/g,'_')) : 'topogram'}-edges.csv`, edgesCsv)
    } catch (e) {
      console.error('ExportTopogramButton export failed', e)
      alert('Export failed: ' + (e && e.message))
    }
  }

  return (
    <button
      title="Export topogram nodes and edges as CSV"
      onClick={handleExport}
      style={{ marginLeft: 12, padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', background: '#fff' }}
    >
      Export CSV
    </button>
  )
}
