import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import { useTracker } from 'meteor/react-meteor-data'
import { Meteor } from 'meteor/meteor'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

// Minimal builder page: accepts CSV or JSON, shows two simple editable tables
// for nodes and edges, allows setting topogram title and enqueues existing
// server import method by synthesizing a CSV (header + rows) compatible with
// the server-side worker (header row + rows where edges have source/target)

export default function Builder() {
  const [rawRows, setRawRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [mapping, setMapping] = useState({})
  const [mappingOpen, setMappingOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [pendingNodes, setPendingNodes] = useState([])
  const [pendingEdges, setPendingEdges] = useState([])
  const [pendingRawRows, setPendingRawRows] = useState([])
  const [pendingHeaders, setPendingHeaders] = useState([])
  const [title, setTitle] = useState('')
  const [fileName, setFileName] = useState('')
  const [waitlistInfo, setWaitlistInfo] = useState(null)
  const [polling, setPolling] = useState(false)
  const navigate = useNavigate()

  const { userId } = useTracker(() => {
    let uid = null
    try { uid = (typeof Meteor.userId === 'function') ? Meteor.userId() : (Meteor.userId ?? null) } catch (e) { uid = null }
    return { userId: uid }
  })

  // If not logged in, short-circuit and only show the login prompt
  if (!userId) {
    return (
      <Box sx={{ p: 2 }}>
        <div style={{ padding: 24 }}>
          <h3>Login required</h3>
          <p>You must be logged in to use the Builder. Please sign in to continue.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button component="a" href="/" variant="outlined">Go to Home / Sign in</Button>
          </div>
        </div>
      </Box>
    )
  }

  const canonicalFields = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','notes','extra']

  const handleFile = async (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setFileName(f.name)
    const text = await f.text()
    if (f.type === 'application/json' || f.name.match(/\.json$/i)) {
      try {
        const obj = JSON.parse(text)
        // accept array of nodes/edges or graph-like {nodes:[], edges:[]}
        if (Array.isArray(obj)) {
          // treat as generic row objects
          const keys = Array.from(new Set(obj.flatMap(r => Object.keys(r || {}))))
          // classify into nodes/edges
          const ns = []
          const es = []
          obj.forEach(r => {
            const hasEdge = (r.source || r.target || r.from || r.to)
            if (hasEdge) es.push(r)
            else ns.push(r)
          })
          if ((nodes && nodes.length) || (edges && edges.length)) {
            // prompt user to merge or replace
            setPendingNodes(ns)
            setPendingEdges(es)
            setPendingRawRows(obj)
            setPendingHeaders(keys)
            setMergeOpen(true)
          } else {
            setHeaders(keys)
            setRawRows(obj)
            setNodes(ns)
            setEdges(es)
            tryAutoMap(obj)
          }
        } else if (obj && typeof obj === 'object') {
          const rows = []
          if (Array.isArray(obj.nodes)) rows.push(...obj.nodes)
          if (Array.isArray(obj.edges)) rows.push(...obj.edges)
          const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))))
          const ns = Array.isArray(obj.nodes) ? obj.nodes : []
          const es = Array.isArray(obj.edges) ? obj.edges : []
          if ((nodes && nodes.length) || (edges && edges.length)) {
            setPendingNodes(ns)
            setPendingEdges(es)
            setPendingRawRows(rows)
            setPendingHeaders(keys)
            setMergeOpen(true)
          } else {
            setHeaders(keys)
            setRawRows(rows)
            if (Array.isArray(obj.nodes)) setNodes(obj.nodes)
            if (Array.isArray(obj.edges)) setEdges(obj.edges)
            tryAutoMap(rows)
          }
        }
      } catch (e) {
        alert('Invalid JSON: ' + e.message)
      }
    } else {
      // parse CSV
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, comments: '#' })
      if (parsed && parsed.errors && parsed.errors.length) {
        const hasMismatch = parsed.errors.some(err => err && err.code === 'TooFewFields')
        if (hasMismatch) {
          // fallback: parse without header then reconstruct
          const raw = Papa.parse(text, { header: false, skipEmptyLines: true, comments: '#' })
          const rows = raw && raw.data ? raw.data : []
          if (rows.length >= 1) {
            const h = rows[0].map(String)
            const dataRows = rows.slice(1).map(r => {
              const obj = {}
              for (let i = 0; i < h.length; i++) obj[h[i]] = (r && r[i] != null) ? r[i] : ''
              return obj
            })
            setHeaders(h)
            setRawRows(dataRows)
            classifyRows(dataRows)
            return
          }
        }
      }
      const rows = parsed && parsed.data ? parsed.data : []
      const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))))
      // classify into nodes/edges
      const ns = []
      const es = []
      rows.forEach(r => {
        const hasEdge = (r.source || r.target || r.from || r.to)
        if (hasEdge) es.push(r)
        else ns.push(r)
      })
      if ((nodes && nodes.length) || (edges && edges.length)) {
        setPendingNodes(ns)
        setPendingEdges(es)
        setPendingRawRows(rows)
        setPendingHeaders(keys)
        setMergeOpen(true)
      } else {
        setHeaders(keys)
        setRawRows(rows)
        classifyRows(rows)
        tryAutoMap(rows)
      }
    }
  }

  const doMergeReplace = () => {
    setNodes(pendingNodes)
    setEdges(pendingEdges)
    setRawRows(pendingRawRows)
    setHeaders(pendingHeaders)
    tryAutoMap(pendingRawRows)
    setPendingNodes([])
    setPendingEdges([])
    setPendingRawRows([])
    setPendingHeaders([])
    setMergeOpen(false)
  }

  const doMergeAdd = () => {
    const combinedRaw = [...(rawRows || []), ...(pendingRawRows || [])]
    const combinedHeaders = Array.from(new Set([...(headers || []), ...(pendingHeaders || [])]))
    setNodes([...(nodes || []), ...(pendingNodes || [])])
    setEdges([...(edges || []), ...(pendingEdges || [])])
    setRawRows(combinedRaw)
    setHeaders(combinedHeaders)
    tryAutoMap(combinedRaw)
    setPendingNodes([])
    setPendingEdges([])
    setPendingRawRows([])
    setPendingHeaders([])
    setMergeOpen(false)
  }

  const tryAutoMap = (rows) => {
    const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))))
    setHeaders(keys)
    // auto mapping: try exact match or case-insensitive match
    const map = {}
    canonicalFields.forEach(f => {
      // exact
      if (keys.includes(f)) map[f] = f
      else {
        // case-insensitive
        const found = keys.find(k => k.toLowerCase() === f.toLowerCase())
        if (found) map[f] = found
        else {
          // some aliases
          const aliases = {
            source: ['from','src'],
            target: ['to','dst','tgt'],
            id: ['_id','uid','identifier'],
            name: ['title','label','node','nodeName'],
            emoji: ['em','icon']
          }
          const al = aliases[f]
          if (al) {
            const found2 = keys.find(k => al.includes(k.toLowerCase()))
            if (found2) map[f] = found2
          }
        }
      }
    })
    setMapping(map)
    // determine if data is exactly structured as topogram: all canonical fields present
    const exact = canonicalFields.every(f => keys.includes(f))
    setMappingOpen(!exact)
  }

  const classifyRows = (rows) => {
    const ns = []
    const es = []
    rows.forEach(r => {
      const hasEdge = (r.source || r.target || r.from || r.to)
      if (hasEdge) es.push(r)
      else ns.push(r)
    })
    setNodes(ns)
    setEdges(es)
  }

  const updateRow = (type, idx, key, value) => {
    const arr = type === 'node' ? nodes.slice() : edges.slice()
    arr[idx] = { ...(arr[idx] || {}), [key]: value }
    if (type === 'node') setNodes(arr)
    else setEdges(arr)
  }

  const addEmptyRow = (type) => {
    if (type === 'node') setNodes([...nodes, {}])
    else setEdges([...edges, {}])
  }

  const removeRow = (type, idx) => {
    if (type === 'node') setNodes(nodes.filter((_,i)=>i!==idx))
    else setEdges(edges.filter((_,i)=>i!==idx))
  }

  // Build a CSV compatible with server import: header then rows. We'll use the union of headers from nodes and edges.
  const buildCsvText = () => {
    const allKeys = Array.from(new Set([...headers, ...nodes.flatMap(n=>Object.keys(n||{})), ...edges.flatMap(e=>Object.keys(e||{}))]))
    // ensure commonly used keys exist so server worker detects fields
    const prefer = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','notes','extra']
    prefer.forEach(k=>{ if (!allKeys.includes(k)) allKeys.push(k) })
    const esc = (v) => {
      if (v == null) return ''
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      if (s.indexOf(',') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('"') !== -1) {
        return '"' + s.replace(/"/g,'""') + '"'
      }
      return s
    }
    const lines = []
    lines.push(allKeys.join(','))
    // write nodes then edges (server worker expects nodes without source/target)
    nodes.forEach(n => {
      const row = allKeys.map(k => esc(n[k]))
      lines.push(row.join(','))
    })
    edges.forEach(e => {
      const row = allKeys.map(k => esc(e[k]))
      lines.push(row.join(','))
    })
    return lines.join('\n')
  }

  const applyMappingToRows = () => {
    if (!mapping || Object.keys(mapping).length === 0) return
    // map nodes and edges based on mapping object
    const mapRow = (r) => {
      const out = {}
      // apply mapping: for each canonical field, take mapped header or existing field
      canonicalFields.forEach(f => {
        const src = mapping[f]
        if (src && r && Object.prototype.hasOwnProperty.call(r, src)) out[f] = r[src]
        else if (r && Object.prototype.hasOwnProperty.call(r, f)) out[f] = r[f]
      })
      // keep other fields under extra
      const extra = {}
      Object.keys(r || {}).forEach(k => { if (!canonicalFields.includes(k) && !Object.values(mapping).includes(k)) extra[k] = r[k] })
      if (Object.keys(extra).length) out.extra = JSON.stringify(extra)
      return out
    }
    setNodes(nodes.map(n => ({ ...(mapRow(n) || {} ) })))
    setEdges(edges.map(e => ({ ...(mapRow(e) || {} ) })))
    setMappingOpen(false)
  }

  const enqueueImport = async () => {
    // build CSV text with BOM
    const csv = '\uFEFF' + buildCsvText()
    const b64 = btoa(unescape(encodeURIComponent(csv)))
    try {
      const res = await new Promise((resolve, reject) => {
        try {
          Meteor.call('topogram.enqueueCsvImport', { filename: fileName || (title ? title.replace(/\s+/g,'_') + '.csv' : 'builder_import.csv'), contentBase64: b64, mapping: {}, options: { topogramTitle: title } }, (err, result) => {
            if (err) return reject(err)
            resolve(result)
          })
        } catch (e) { reject(e) }
      })
      if (res && res.queued && res.waitlistId) {
        // start polling for waitlist position and auto-promote
        setWaitlistInfo({ waitlistId: res.waitlistId, position: null })
        setPolling(true)
        pollWaitlist(res.waitlistId)
      } else {
        alert('Import enqueued: ' + (res && res.jobId))
        navigate('/')
      }
    } catch (err) {
      console.error('enqueue error', err)
      alert('Failed to enqueue import: ' + (err && err.message ? err.message : String(err)))
    }
  }

  const pollWaitlist = async (waitlistId) => {
    let cancelled = false
    const check = async () => {
      try {
        const info = await new Promise((resolve, reject) => {
          Meteor.call('waitlist.position', (err, r) => { if (err) return reject(err); resolve(r) })
        })
        if (!info || !info.inWaitlist) {
          setWaitlistInfo(null)
          setPolling(false)
          return
        }
        setWaitlistInfo({ waitlistId: info.waitlistId, position: info.position })
        if (info.position === 1) {
          // try to promote
          const promoted = await new Promise((resolve, reject) => {
            Meteor.call('waitlist.tryPromote', { waitlistId }, (err, r) => { if (err) return reject(err); resolve(r) })
          })
          if (promoted && promoted.promoted) {
            setWaitlistInfo(null)
            setPolling(false)
            alert('Your import has been promoted to processing (job ' + promoted.jobId + ')')
            navigate('/')
            return
          }
        }
      } catch (e) {
        console.debug && console.debug('poll error', e)
      }
      if (!cancelled) setTimeout(check, 5000)
    }
    check()
    return () => { cancelled = true }
  }

  const downloadCsv = () => {
    const csv = '\uFEFF' + buildCsvText()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (title ? title.replace(/\s+/g,'_') : 'topogram') + '-export.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Box sx={{ p: 2 }}>
      {!userId ? (
        <div style={{ padding: 24 }}>
          <h3>Login required</h3>
          <p>You must be logged in to use the Builder. Please sign in to continue.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button component="a" href="/" variant="outlined">Go to Home / Sign in</Button>
          </div>
        </div>
      ) : null}
      <h2>Topogram Builder</h2>
      <div style={{ marginBottom: 12 }}>
        <Link to="/">← Back</Link>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <input type="file" accept="text/csv,application/json" onChange={handleFile} />
        <TextField label="Topogram title" value={title} onChange={e=>setTitle(e.target.value)} size="small" />
        <Button variant="outlined" onClick={downloadCsv}>Download CSV</Button>
        <Button variant="contained" color="primary" onClick={enqueueImport}>Import to server</Button>
        <Button variant="outlined" onClick={()=>setMappingOpen(true)}>Map fields</Button>
      </div>

      {/* Preview of imported raw rows */}
      {rawRows && rawRows.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <h3>Imported data preview (first 10 rows) — fields detected: {headers.join(', ')}</h3>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #eee', padding: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #ccc' }}>#</th>
                  {headers.map(h => <th key={h} style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0,10).map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>{idx+1}</td>
                    {headers.map(h => (
                      <td key={h} style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>{typeof r[h] === 'object' ? JSON.stringify(r[h]) : String(r[h] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Mapping modal */}
      <Dialog open={mappingOpen} onClose={() => setMappingOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Field mapping</DialogTitle>
        <DialogContent>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            {canonicalFields.map(cf => (
              <React.Fragment key={cf}>
                <div style={{ alignSelf: 'center', fontWeight: 600 }}>{cf}</div>
                <FormControl fullWidth size="small">
                  <InputLabel>Source column</InputLabel>
                  <Select
                    value={mapping[cf] || ''}
                    label="Source column"
                    onChange={e => setMapping({ ...mapping, [cf]: e.target.value })}
                  >
                    <MenuItem value="">(none)</MenuItem>
                    {headers.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                  </Select>
                </FormControl>
              </React.Fragment>
            ))}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMappingOpen(false)}>Cancel</Button>
          <Button onClick={applyMappingToRows} variant="contained">Apply mapping</Button>
        </DialogActions>
      </Dialog>

      {/* Merge modal: show when importing while existing data present */}
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import data conflict</DialogTitle>
        <DialogContent>
          <div style={{ marginBottom: 8 }}>There is already data loaded in the builder. Do you want to replace the current nodes/edges with the newly imported file, or add the new rows to the existing data?</div>
          <div style={{ fontSize: 12, color: '#555' }}>
            <div><strong>New rows:</strong> nodes {pendingNodes.length}, edges {pendingEdges.length}</div>
            <div><strong>Current rows:</strong> nodes {nodes.length}, edges {edges.length}</div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setMergeOpen(false); setPendingNodes([]); setPendingEdges([]); setPendingRawRows([]); setPendingHeaders([]) }}>Cancel</Button>
          <Button onClick={doMergeAdd}>Add</Button>
          <Button onClick={doMergeReplace} variant="contained">Replace</Button>
        </DialogActions>
      </Dialog>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h3>Nodes ({nodes.length})</h3>
          <Button size="small" onClick={()=>addEmptyRow('node')}>Add node</Button>
          <div style={{ maxHeight: 400, overflow: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>#</th>
                  {/** show a few preferred columns */}
                  {['id','name','label','color','lat','lng','weight','emoji'].map(c=> <th key={c} style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>{c}</th>)}
                  <th style={{ borderBottom: '1px solid #ccc' }}>actions</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>{i+1}</td>
                    {['id','name','label','color','lat','lng','weight','emoji'].map(c => (
                      <td key={c} style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>
                        <input value={(n && n[c]) || ''} onChange={e=>updateRow('node', i, c, e.target.value)} style={{ width: '100%' }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>
                      <Button size="small" color="error" onClick={()=>removeRow('node', i)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Edges ({edges.length})</h3>
          <Button size="small" onClick={()=>addEmptyRow('edge')}>Add edge</Button>
          <div style={{ maxHeight: 400, overflow: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>#</th>
                  {['source','target','name','edgeColor','edgeWeight','relationship','enlightement','emoji'].map(c=> <th key={c} style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>{c}</th>)}
                  <th style={{ borderBottom: '1px solid #ccc' }}>actions</th>
                </tr>
              </thead>
              <tbody>
                {edges.map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>{i+1}</td>
                    {['source','target','name','edgeColor','edgeWeight','relationship','enlightement','emoji'].map(c => (
                      <td key={c} style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>
                        <input value={(e && e[c]) || ''} onChange={ev=>updateRow('edge', i, c, ev.target.value)} style={{ width: '100%' }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>
                      <Button size="small" color="error" onClick={()=>removeRow('edge', i)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Box>
  )
}
