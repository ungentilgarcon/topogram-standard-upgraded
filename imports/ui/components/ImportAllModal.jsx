import React, { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Papa from 'papaparse'

// Lazy-load SheetJS only when needed (XLSX/ODS)
let _xlsxPromise = null
const getXLSX = () => {
  if (!_xlsxPromise) {
    _xlsxPromise = import('xlsx')
  }
  return _xlsxPromise
}

export default function ImportAllModal({ open, onClose, onEnqueue }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')

  const _quote = (v) => {
    if (v === null || typeof v === 'undefined') return '""'
    const s = String(v)
    return '"' + s.replace(/"/g, '""') + '"'
  }

  // Same sample header as the importer expects.
  // Updated order to include absolute canvas positions (positionx, positiony)
  // id,name,label,description,color,fillColor,weight,rawWeight,lat,lng,positionx,positiony,start,end,time,date,source,target,edgeLabel,edgeColor,edgeWeight,relationship,enlightement,emoji,extra
  const sampleHeaderArr = [
    'id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','positionx','positiony','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','extra'
  ]
  const sampleRowsArr = [
    // Example node row: includes geo (lat,lng) and normalized absolute position (positionx,positiony in [0,1])
    ['1','Alice','Alice A','Node with geo & time','#ff5722','#ffccbc','10','10','40.7128','-74.0060','0.42','0.66','2020-01-01','2020-12-31','2020-06-15','2020-06-15','','','','','','','','','## Alice — **Data node**. Location: NYC. [Profile](https://example.com/alice)'],
    ['2','Bob','Bob B','Connector node','#2196f3','#bbdefb','5','5','37.7749','-122.4194','0.58','0.47','','','','','','','','','','','','','## Bob — **Connector**. Useful for bridging clusters.'],
    ['3','Carol','Carol C','Peripheral node','#4caf50','#c8e6c9','3','3','51.5074','-0.1278','0.12','0.78','','','','','','','','','','','','','## Carol — _Peripheral_. Research subject; see notes.'],
    ['4','Dave','Dave D','Hub node','#9c27b0','#e1bee7','12','12','48.8566','2.3522','0.72','0.33','','','','','','','','','','','','','## Dave — **Hub**. Main hub node. `hub-id:4`'],
    ['5','Eve','Eve E','Geo node','#ff9800','#ffe0b2','8','8','34.0522','-118.2437','0.61','0.52','','','','','','','','','','','','','## Eve — Geo data source (LA).'],
    ['6','Frank','Frank F','Timeline node','#795548','#d7ccc8','6','6','52.52','13.4050','0.33','0.21','2019-05-01','2020-05-01','2019-11-11','2019-11-11','','','','','','','','','## Frank — Timeline node. Range: 2019-05-01 → 2020-05-01'],
    ['7','Grace','Grace G','Emoji node','#e91e63','#f8bbd0','4','4','35.6895','139.6917','0.88','0.44','','','','','','','','','','','','','## Grace — Visual marker: 🌟'],
    ['8','Heidi','Heidi H','Low weight','#607d8b','#cfd8dc','1','1','-33.8688','151.2093','0.25','0.85','','','','','','','','','','','','','## Heidi — Low-weight sample entry.'],
    ['9','Ivan','Ivan I','Bridge','#8bc34a','#f1f8e9','7','7','41.9028','12.4964','0.52','0.12','','','','','','','','','','','','','## Ivan — Bridge node between clusters.'],
    ['10','Judy','Judy J','Isolated','#03a9f4','#b3e5fc','2','2','55.7558','37.6173','0.15','0.35','','','','','','','','','','','','','## Judy — Isolated node. Short note.'],
    // edges (empty node columns, then source,target,edgeLabel,edgeColor,edgeWeight,relationship,enlightement,emoji,extra)
    ['','','','','','','','','','','','','','','','','1','2','friend','#9e9e9e','1','undirected','','','', '*Edge:* **friend**'],
    ['','','','','','','','','','','','','','','','','1','3','colleague','#ffab00','2','directed','arrow','','', '*Edge:* **colleague** — works on `project-x`'],
    ['','','','','','','','','','','','','','','','','2','3','follows','#4caf50','1','directed','','','', ''],
    ['','','','','','','','','','','','','','','','','2','4','reports','#2196f3','3','directed','arrow','','', ''],
    ['','','','','','','','','','','','','','','','','3','5','mentions','#ff5722','1','undirected','','','', ''],
    ['','','','','','','','','','','','','','','','','4','5','links','#607d8b','2','undirected','','','', ''],
    ['','','','','','','','','','','','','','','','','4','6','relates','#9c27b0','2','directed','arrow','','', ''],
    ['','','','','','','','','','','','','','','','','5','7','observes','#795548','1','directed','','','', ''],
    ['','','','','','','','','','','','','','','','','6','7','connects','#8bc34a','2','undirected','','','', ''],
    ['','','','','','','','','','','','','','','','','7','8','supports','#e91e63','1','directed','','','', ''],
    ['','','','','','','','','','','','','','','','','8','9','transfers','#03a9f4','3','directed','arrow','','', ''],
    ['','','','','','','','','','','','','','','','','9','10','assists','#ff9800','1','undirected','','','', ''],
    ['','','','','','','','','','','','','','','','','10','1','references','#4caf50','2','directed','','','', ''],
    ['','','','','','','','','','','','','','','','','3','9','mentions','#9e9e9e','1','undirected','','','', ''],
    ['','','','','','','','','','','','','','','','','2','9','follows','#2196f3','2','directed','','','', ''],
    ['','','','','','','','','','','','','','','','','5','10','links','#607d8b','2','undirected','','','', ''],
    ['','','','','','','','','','','','','','','','','6','10','cites','#9c27b0','3','directed','arrow','','', '']
  ]
  const sampleCsv = ['# Topogram: Sample Topogram', sampleHeaderArr.map(_quote).join(',')].concat(sampleRowsArr.map(r => r.map(_quote).join(','))).join('\n')

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0]
    setFile(f)
  }

  const toBase64 = async (fileLike) => {
    const buf = await fileLike.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  const handleSubmit = async () => {
    if (!file) return
    const lower = (file.name || '').toLowerCase()
    const isCsvLike = lower.endsWith('.csv') || lower.endsWith('.txt')
    const isJsonLike = lower.endsWith('.json')

    // Helper: sanitize CSV text to reduce malformed-quote errors.
    // Strategy:
    // 1. Split into physical lines.
    // 2. Recombine lines that are part of the same quoted record by
    //    detecting odd-numbered quote counts (i.e. an open quote not closed on the line).
    // 3. As a last resort, remove a trailing unmatched quote in a record.
    const sanitizeCsvText = (rawText) => {
      try {
        const nl = rawText.split(/\r\n|\n|\r/)
        const records = []
        let buffer = ''
        const quoteCount = (s) => (s.match(/"/g) || []).length
        for (let i = 0; i < nl.length; i++) {
          const line = nl[i]
          if (buffer.length === 0) buffer = line
          else buffer = buffer + '\n' + line
          // if buffer has even number of quotes, it's a complete record
          if ((quoteCount(buffer) % 2) === 0) {
            records.push(buffer)
            buffer = ''
          } else {
            // otherwise continue merging with next line
            continue
          }
        }
        // if we ended with a dangling buffer (odd quotes), attempt to fix by removing last unmatched quote
        if (buffer && buffer.length) {
          // remove the last double quote in the buffer (heuristic)
          buffer = buffer.replace(/"(?=[^\"]*$)/, '')
          records.push(buffer)
        }
        return records.join('\n')
      } catch (e) {
        console.debug && console.debug('sanitizeCsvText failed', e)
        return rawText
      }
    }

    // Optional lightweight validation/parsing for CSV only
    if (isCsvLike) {
      const rawText = await file.text()
      // first try a quick sanitize pass to handle common malformed-quote cases
      const text = sanitizeCsvText(rawText)
      let parsed = Papa.parse(text, { header: true, preview: 5, comments: '#', skipEmptyLines: true })
      const hasFieldMismatch = parsed && parsed.errors && parsed.errors.some(e => e && e.code === 'TooFewFields')
      if (hasFieldMismatch) {
        try {
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
          // fall through
        }
      }
      if (parsed && parsed.errors && parsed.errors.length) {
        // If errors include invalid quotes, try a stronger repair and reparse once.
        const hasInvalidQuotes = parsed.errors.some(e => e && e.code === 'InvalidQuotes')
        if (hasInvalidQuotes) {
          try {
            const reparsedText = sanitizeCsvText(rawText || '')
            const reparsed = Papa.parse(reparsedText, { header: true, comments: '#', skipEmptyLines: true })
            if (reparsed && (!reparsed.errors || reparsed.errors.length === 0)) {
              // create a new File-like blob so the rest of the flow uploads reparsed CSV
              file = new Blob(["\uFEFF" + reparsedText], { type: 'text/csv;charset=utf-8;' })
            } else {
              alert('CSV parse errors: ' + JSON.stringify(parsed.errors.slice(0,3)))
              return
            }
          } catch (e) {
            alert('CSV parse errors: ' + JSON.stringify(parsed.errors.slice(0,3)))
            return
          }
        } else {
          alert('CSV parse errors: ' + JSON.stringify(parsed.errors.slice(0,3)))
          return
        }
      }
    }

    // If JSON, convert to the CSV layout expected by the server importer
    let fileToUpload = file
    let uploadFilename = file.name
    if (isJsonLike) {
      try {
        const txt = await file.text()
        const parsed = JSON.parse(txt)
        const headerArr = sampleHeaderArr
        const rows = []
        if (Array.isArray(parsed.nodes)) {
          parsed.nodes.forEach(n => {
            const r = headerArr.map(h => '')
            if (n.id != null) r[0] = String(n.id)
            if (n.name != null) r[1] = String(n.name)
            if (n.label != null) r[2] = String(n.label)
            if (n.description != null) r[3] = String(n.description)
            if (n.color != null) r[4] = String(n.color)
            if (n.fillColor != null) r[5] = String(n.fillColor)
            if (n.weight != null) r[6] = String(n.weight)
            if (n.rawWeight != null) r[7] = String(n.rawWeight)
            if (n.lat != null) r[8] = String(n.lat)
            if (n.lng != null) r[9] = String(n.lng)
            if (n.positionx != null) r[10] = String(n.positionx)
            if (n.positiony != null) r[11] = String(n.positiony)
            if (n.start != null) r[12] = String(n.start)
            if (n.end != null) r[13] = String(n.end)
            if (n.time != null) r[14] = String(n.time)
            if (n.date != null) r[15] = String(n.date)
            if (n.emoji != null) r[23] = String(n.emoji)
            if (n.extra != null) r[24] = typeof n.extra === 'string' ? n.extra : JSON.stringify(n.extra)
            rows.push(r)
          })
        }
        if (Array.isArray(parsed.edges)) {
          parsed.edges.forEach(e => {
            const r = headerArr.map(h => '')
            if (e.source != null) r[16] = String(e.source)
            if (e.target != null) r[17] = String(e.target)
            if (e.edgeLabel != null) r[18] = String(e.edgeLabel)
            if (e.edgeColor != null) r[19] = String(e.edgeColor)
            if (e.edgeWeight != null) r[20] = String(e.edgeWeight)
            if (e.relationship != null) r[21] = String(e.relationship)
            if (e.enlightement != null) r[22] = String(e.enlightement)
            if (e.extra != null) r[24] = typeof e.extra === 'string' ? e.extra : JSON.stringify(e.extra)
            rows.push(r)
          })
        }
        const csvLines = []
        csvLines.push('# Topogram: converted from JSON')
        csvLines.push(headerArr.map(h => _quote(h)).join(','))
        rows.forEach(r => csvLines.push(r.map(c => _quote(c)).join(',')))
        const csvText = '\uFEFF' + csvLines.join('\n')
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
        fileToUpload = blob
        uploadFilename = uploadFilename.replace(/\.json$/i, '.csv')
      } catch (e) {
        console.error('Failed to convert JSON to CSV', e)
        alert('Failed to parse JSON file for import: ' + (e && e.message ? e.message : String(e)))
        return
      }
    }

    // Convert to base64 for upload
    const b64 = await toBase64(fileToUpload)
    try {
      const res = await new Promise((resolve, reject) => {
        try {
          Meteor.call('topogram.enqueueCsvImport', { filename: uploadFilename, contentBase64: b64, mapping: {}, options: { topogramTitle: title } }, (err, result) => {
            if (err) return reject(err)
            resolve(result)
          })
        } catch (e) { reject(e) }
      })
      if (res && res.queued && res.waitlistId) {
        alert('Server is busy — you are on the import waitlist. We will promote your job automatically when a slot is free.')
        const poll = async () => {
          try {
            const info = await new Promise((resolve, reject) => {
              Meteor.call('waitlist.position', (err, r) => { if (err) return reject(err); resolve(r) })
            })
            if (info && info.inWaitlist && info.position === 1) {
              const promoted = await new Promise((resolve, reject) => {
                Meteor.call('waitlist.tryPromote', { waitlistId: res.waitlistId }, (err, r) => { if (err) return reject(err); resolve(r) })
              })
              if (promoted && promoted.promoted) {
                onEnqueue && onEnqueue(promoted.jobId)
                onClose && onClose()
                return
              }
            }
          } catch (e) { console.debug && console.debug('waitlist poll error', e) }
          setTimeout(poll, 5000)
        }
        poll()
      } else {
        onEnqueue && onEnqueue(res && res.jobId)
        onClose && onClose()
      }
    } catch (err) {
      console.error('enqueueCsvImport error', err)
      const msg = (err && (err.error || err.message)) ? (err.error ? `${err.error}: ${err.message}` : err.message) : String(err)
      alert('Failed to enqueue import: ' + msg)
    }
  }

  const downloadSample = () => {
    try {
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
      <DialogTitle>Import data (CSV, XLSX, ODS, JSON)</DialogTitle>
      <DialogContent>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <input type="file" accept=".csv,.xlsx,.ods,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet" onChange={handleFile} />
          <Button onClick={downloadSample} variant="outlined">Download sample CSV</Button>
        </div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
          <div><strong>Note:</strong> The sample CSV is saved with a UTF-8 byte-order mark (BOM) to help spreadsheet apps (LibreOffice, Excel) detect UTF-8 and display emoji correctly.</div>
          <div>If you still see garbled characters after opening in LibreOffice, try File → Open and explicitly choose UTF-8 as the file encoding.</div>
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
