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
  const sampleCsv = `# Topogram: Sample Topogram
id,name,label,description,color,fillColor,weight,rawWeight,lat,lng,start,end,time,date,source,target,edgeLabel,edgeColor,edgeWeight,extra
1,Alice,Alice A,"Node with geo & time",#ff5722,#ffccbc,10,10,40.7128,-74.0060,2020-01-01,2020-12-31,2020-06-15,2020-06-15,,,,,,notes for alice
2,Bob,Bob B,"Another node",#3f51b5,#c5cae9,5,5,34.0522,-118.2437,2019-05-01,2019-12-31,2019-09-10,2019-09-10,,,,,,preferred contact
3,Carol,Carol C,"Third node",#2e7d32,#c8e6c9,8,8,51.5074,-0.1278,2021-03-10,2021-10-10,2021-06-20,2021-06-20,,,,,,imported
"","","","","","","","","","","","","",1,2,friendship,#9c27b0,2,""
"","","","","","","","","","","","","",2,3,collab,#607d8b,1,""
"","","","","","","","","","","","","",3,1,support,#ff9800,3,""
"","","","","","","","","","","","","",1,3,mentions,#4caf50,1,""
"","","","","","","","","","","","","",2,1,replies,#795548,1,""
"","","","","","","","","","","","","",3,2,links,#616161,1,""
`

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0]
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!file) return
    const text = await file.text()
    // simple validation
  const parsed = Papa.parse(text, { header: true, preview: 5, comments: '#', skipEmptyLines: true })
    if (parsed && parsed.errors && parsed.errors.length) {
      alert('CSV parse errors: ' + JSON.stringify(parsed.errors.slice(0,3)))
      return
    }
    // Base64 encode and send to server via method
    const b64 = btoa(unescape(encodeURIComponent(text)))
    try {
      const res = await Meteor.callPromise('topogram.enqueueCsvImport', { filename: file.name, contentBase64: b64, mapping: {}, options: { topogramTitle: title } })
      onEnqueue && onEnqueue(res && res.jobId)
      onClose && onClose()
    } catch (err) {
      alert('Failed to enqueue import: ' + (err && err.message))
    }
  }

  const downloadSample = () => {
    try {
      const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' })
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
