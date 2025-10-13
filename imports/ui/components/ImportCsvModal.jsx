import React, { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Papa from 'papaparse'

export default function ImportCsvModal({ open, onClose, onEnqueue }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')

  // A useful sample CSV demonstrating nodes (no source/target) and
  // edges (with source/target). 3 nodes, 6 edges, with a variety of fields
  // commonly used by the import worker (id, name, color, lat/lng, time/date,
  // weight, and edge-specific fields).
  // Build a strictly well-formed CSV programmatically to avoid field-count
  // mismatches when opened in spreadsheet apps. Every row will have the
  // same number of fields (20) and all fields are quoted and double-quote
  // escaped where necessary.
  const _quote = (v) => {
    if (v === null || typeof v === 'undefined') return '""'
    const s = String(v)
    return '"' + s.replace(/"/g, '""') + '"'
  }

  // Add 'enlightement' as a flexible edge-level field (can contain many things, including "arrow")
  // Also include an optional 'emoji' field for node visualization (single emoji or short string).
  const sampleHeaderArr = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','extra']
  const sampleRowsArr = [
    ['1','Alice','Alice A','Node with geo & time','#ff5722','#ffccbc','10','10','40.7128','-74.0060','2020-01-01','2020-12-31','2020-06-15','2020-06-15','','','','','','','','','notes for alice'],
  ['2','Bob','Bob B','Another node','#3f51b5','#c5cae9','5','5','34.0522','-118.2437','2019-05-01','2019-12-31','2019-09-10','2019-09-10','','','','','','','','🎸 🎤','preferred contact'],
  ['3','Carol','Carol C','Third node','#2e7d32','#c8e6c9','8','8','51.5074','-0.1278','2021-03-10','2021-10-10','2021-06-20','2021-06-20','','','','','','','','🎤','imported'],
  ['', '','', '','','','','','','','','','','','1','2','friendship','#9c27b0','2','friendship','arrow','','note about edge'],
  ['', '','', '','','','','','','','','','','','2','3','collab','#607d8b','1','collab','','🎸 🎤','notes'],
  ['', '','', '','','','','','','','','','','','3','1','support','#ff9800','3','support','arrow','','notes'],
    ['', '','', '','','','','','','','','','','','1','3','mentions','#4caf50','1','mentions','','','notes'],
    ['', '','', '','','','','','','','','','','','2','1','replies','#795548','1','replies','arrow','','notes'],
    ['', '','', '','','','','','','','','','','','3','2','links','#616161','1','links','','','notes']
  ]

  const sampleCsv = ['# Topogram: Sample Topogram', sampleHeaderArr.map(_quote).join(',')].concat(sampleRowsArr.map(r => r.map(_quote).join(','))).join('\n')

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0]
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!file) return
    const text = await file.text()
    // simple validation
    let parsed = Papa.parse(text, { header: true, preview: 5, comments: '#', skipEmptyLines: true })
    // If FieldMismatch errors occur (too few fields), try a tolerant fallback:
    const hasFieldMismatch = parsed && parsed.errors && parsed.errors.some(e => e && e.code === 'TooFewFields')
    if (hasFieldMismatch) {
      try {
        // Re-parse without header, pad rows to header length, then rebuild objects
        const raw = Papa.parse(text, { header: false, comments: '#', skipEmptyLines: true })
        const rows = raw && raw.data ? raw.data : []
        if (rows.length >= 2) {
          const header = rows[0].map(h => (h == null ? '' : String(h)))
          const dataRows = rows.slice(1).map(r => {
            const row = Array.isArray(r) ? r.slice() : []
            while (row.length < header.length) row.push('')
            const obj = {}
            for (let i = 0; i < header.length; i++) obj[header[i]] = row[i]
            return obj
          })
          parsed = { data: dataRows, errors: [] }
        }
      } catch (e) {
        // fall through to error below
      }
    }
    if (parsed && parsed.errors && parsed.errors.length) {
      alert('CSV parse errors: ' + JSON.stringify(parsed.errors.slice(0,3)))
      return
    }
    // Base64 encode and send to server via method
    const b64 = btoa(unescape(encodeURIComponent(text)))
    try {
      const res = await new Promise((resolve, reject) => {
        try {
          Meteor.call('topogram.enqueueCsvImport', { filename: file.name, contentBase64: b64, mapping: {}, options: { topogramTitle: title } }, (err, result) => {
            if (err) return reject(err)
            resolve(result)
          })
        } catch (e) { reject(e) }
      })
      onEnqueue && onEnqueue(res && res.jobId)
      onClose && onClose()
    } catch (err) {
      console.error('enqueueCsvImport error', err)
      const msg = (err && (err.error || err.message)) ? (err.error ? `${err.error}: ${err.message}` : err.message) : String(err)
      alert('Failed to enqueue import: ' + msg)
    }
  }

  const downloadSample = () => {
    try {
  // Prefix with a UTF-8 BOM so spreadsheet apps (LibreOffice, Excel)
  // reliably detect UTF-8 encoding and render emoji characters.
  const blob = new Blob(["\uFEFF" + sampleCsv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'topogram-sample.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.warn('downloadSample failed', e)
      alert('Failed to download sample CSV')
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Import CSV</DialogTitle>
      <DialogContent>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <input type="file" accept="text/csv" onChange={handleFile} />
          <Button onClick={downloadSample} variant="outlined">Download sample CSV</Button>
        </div>
        <TextField label="Topogram title (optional)" value={title} onChange={e => setTitle(e.target.value)} fullWidth />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Upload</Button>
      </DialogActions>
    </Dialog>
  )
}
