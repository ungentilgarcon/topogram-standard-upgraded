import { Meteor } from 'meteor/meteor'
import { Jobs } from '/imports/api/Jobs'
import fs from 'fs'
import Papa from 'papaparse'
import XLSX from 'xlsx'
import { Topograms, Nodes, Edges } from '/imports/api/collections'

// Small helper to decode UTF-7 sequences (e.g. LibreOffice CSV exports
// non-ASCII as +...- sequences). This decoder finds +...- segments and
// base64-decodes them into UTF-16BE bytes, converting into JS strings.
const decodeUtf7Segments = (s) => {
  if (!s || typeof s !== 'string') return s
  // quick heuristic: if there's no '+' then likely not UTF-7 encoded
  if (s.indexOf('+') === -1) return s
  try {
    return s.replace(/\+([A-Za-z0-9+/=,]+)-/g, (match, b64) => {
      const norm = b64.replace(/,/g, '/')
      let buf
      try { buf = Buffer.from(norm, 'base64') } catch (e) { return match }

      // candidate1: interpret as UTF-16BE
      let cand16 = ''
      for (let i = 0; i < buf.length; i += 2) {
        const hi = buf[i]
        const lo = (i + 1 < buf.length) ? buf[i + 1] : 0
        const code = (hi << 8) | lo
        cand16 += String.fromCharCode(code)
      }

      // candidate2: interpret as UTF-8
      let cand8 = ''
      try { cand8 = buf.toString('utf8') } catch (e) { cand8 = '' }

      // prefer the candidate containing emoji codepoints
      const emojiRe = /\p{Emoji}/u
      if (emojiRe.test(cand8) && !emojiRe.test(cand16)) return cand8
      if (emojiRe.test(cand16) && !emojiRe.test(cand8)) return cand16

      // otherwise pick the candidate with higher printable character ratio
      const score = (str) => {
        if (!str) return 0
        let printable = 0
        for (let ch of str) {
          const code = ch.charCodeAt(0)
          if (code >= 32 && code !== 127) printable++
        }
        return printable / Math.max(1, str.length)
      }
      return (score(cand8) >= score(cand16)) ? cand8 : cand16
    }).replace(/\+-/g, '+')
  } catch (e) {
    return s
  }
}

// Simple worker: poll queued jobs every few seconds and process them
const POLL_INTERVAL = 2000

const processJob = async (job) => {
  if (!job || !job.payload || job.status !== 'queued') return
  const { tmpPath, filename, mapping = {}, options = {} } = job.payload
  await Jobs.updateAsync(job._id, { $set: { status: 'running', startedAt: new Date() } })

  try {
    const ext = (filename && filename.includes('.')) ? filename.split('.').pop().toLowerCase() : ''
    const isSpreadsheet = ['xlsx','xls','ods'].includes(ext)
    const fileBuf = fs.readFileSync(tmpPath)
    let rows = []

    if (isSpreadsheet) {
      // Parse with SheetJS; prefer dedicated nodes/edges sheets if present
      const wb = XLSX.read(fileBuf, { type: 'buffer' })
      const names = wb.SheetNames || []
      const lower = names.map(n => (n || '').toString())
      const idxNodes = lower.findIndex(n => n.toLowerCase() === 'nodes')
      const idxEdges = lower.findIndex(n => n.toLowerCase() === 'edges')
      if (idxNodes !== -1 || idxEdges !== -1) {
        if (idxNodes !== -1) {
          const sh = wb.Sheets[names[idxNodes]]
          const data = XLSX.utils.sheet_to_json(sh, { defval: '' })
          rows.push(...data)
        }
        if (idxEdges !== -1) {
          const sh = wb.Sheets[names[idxEdges]]
          const data = XLSX.utils.sheet_to_json(sh, { defval: '' })
          rows.push(...data.map(r => ({ ...r, __forceEdge: true })))
        }
      } else if (names.length) {
        const sh = wb.Sheets[names[0]]
        const data = XLSX.utils.sheet_to_json(sh, { defval: '' })
        rows = data
      }
    } else {
      // CSV / text path
      const fileText = fileBuf.toString('utf8')
      let parsed = Papa.parse(fileText, { header: true, skipEmptyLines: true, comments: '#' })
      // tolerate 'TooFewFields' by reparsing and padding rows
      const hasFieldMismatch = parsed && parsed.errors && parsed.errors.some(e => e && e.code === 'TooFewFields')
      if (hasFieldMismatch) {
        const raw = Papa.parse(fileText, { header: false, skipEmptyLines: true, comments: '#' })
        const rowsAll = raw && raw.data ? raw.data : []
        if (rowsAll.length >= 2) {
          const header = rowsAll[0]
          const dataRows = rowsAll.slice(1).map(r => {
            const row = Array.isArray(r) ? r.slice() : []
            while (row.length < header.length) row.push('')
            const obj = {}
            for (let i = 0; i < header.length; i++) obj[header[i]] = row[i]
            return obj
          })
          parsed = { data: dataRows, errors: [] }
        }
      }
      rows = parsed.data || []
    }
    // If LibreOffice exported modified UTF-7 like +...- sequences in any cell,
    // decode those segments across all fields so subsequent normalization
    // (emoji extraction, etc.) sees proper Unicode.
    try {
      rows = rows.map(r => {
        const out = {}
        Object.keys(r || {}).forEach(k => {
          const v = r[k]
          if (v && typeof v === 'string' && v.indexOf('+') !== -1 && /\+[A-Za-z0-9+,/]+=*-/.test(v)) {
            out[k] = decodeUtf7Segments(v)
          } else out[k] = v
        })
        return out
      })
    } catch (e) { /* ignore decode failures, keep original rows */ }
  await Jobs.updateAsync(job._id, { $set: { total: rows.length } })

    // Two pass approach: collect nodes and edges separately
    const nodes = []
    const edges = []
    rows.forEach((r, idx) => {
      const hasEdge = r.__forceEdge || r.source || r.target || r.from || r.to
      if (hasEdge) {
        edges.push(r)
      } else {
        nodes.push(r)
      }
    })

    // Create topogram
    const topogramTitle = options.topogramTitle || `Imported ${filename} ${new Date().toISOString()}`
  const topogramId = await Topograms.insertAsync({ title: topogramTitle, userId: job.userId, createdAt: new Date(), importMeta: { filename } })

    // Insert nodes in batches
    const BATCH = 500
    let inserted = 0
    for (let i = 0; i < nodes.length; i += BATCH) {
      const batch = nodes.slice(i, i + BATCH).map(r => {
        // Normalize emoji field for node visualization: keep up to N grapheme clusters
        let emojiVal = null
        try {
          let raw = r.emoji || r.em || r.icon || null
          if (raw && typeof raw === 'string') {
            raw = decodeUtf7Segments(raw)
            // Extract up to N grapheme clusters (preserves multi-emoji like "🎸🎤")
            const N = 3
            if (typeof Intl !== 'undefined' && Intl.Segmenter) {
              try {
                const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
                const parts = Array.from(seg.segment(raw)).map(s => s.segment).filter(Boolean)
                if (parts.length) emojiVal = parts.slice(0, N).join('')
                else emojiVal = raw.trim()
              } catch (e) { emojiVal = raw.trim() }
            } else {
              const parts = Array.from(raw.trim())
              if (parts.length) emojiVal = parts.slice(0, N).join('')
              else emojiVal = raw.trim()
            }
            if (emojiVal === '') emojiVal = null
          }
        } catch (e) { emojiVal = null }
        const data = { ...r }
        if (emojiVal) data.emoji = emojiVal
        return ({ topogramId, data, createdAt: new Date() })
      })
      const res = await Nodes.rawCollection().insertMany(batch)
      const batchInserted = (res && res.insertedCount) || batch.length
      inserted += batchInserted
      await Jobs.updateAsync(job._id, { $inc: { processed: batch.length, inserted: batchInserted } })
    }

    // Build a quick lookup for node vizIds (the id used by the client visualization).
    // Viz id is node.data.id when present, otherwise the Mongo _id. Map several
    // common candidate keys (data.id, _id, id, data.name, name) -> vizId so
    // incoming edge endpoint values from CSV can be resolved against any of
    // these forms.
  // Use the rawCollection cursor and toArray() which returns a Promise
  // (the Meteor collection doesn't expose findAsync on all collection objects).
  const nodeDocs = await Nodes.rawCollection().find({ topogramId }).toArray()
    const idMap = new Map()
    nodeDocs.forEach(nd => {
      const vizId = (nd.data && nd.data.id) ? String(nd.data.id) : String(nd._id)
      const candidates = new Set()
      candidates.add(String(vizId))
      candidates.add(String(nd._id))
      if (nd.id) candidates.add(String(nd.id))
      if (nd.data && nd.data.id) candidates.add(String(nd.data.id))
      if (nd.data && nd.data.name) candidates.add(String(nd.data.name))
      if (nd.name) candidates.add(String(nd.name))
      candidates.forEach(k => idMap.set(k, vizId))
    })

    // Insert edges, resolving endpoints
    let edgeInserted = 0
    for (let i = 0; i < edges.length; i += BATCH) {
      const slice = edges.slice(i, i + BATCH)
      const originalCount = slice.length
      const batch = slice.map(r => {
        const rawSrc = r.source || r.from
        const rawTgt = r.target || r.to
        const src = rawSrc ? idMap.get(String(rawSrc)) : null
        const tgt = rawTgt ? idMap.get(String(rawTgt)) : null
  if (!src || !tgt) return null
  // Derive a human-friendly edge label from common CSV fields so the
  // client can display a name if present (legacy datasets often use
  // 'name' or 'type' for edge labels).
  const ename = r.name || r.type || r.label || r.relation || r.edge || r.edgeType || r.edgeLabel || null
  const ecolor = r.color || r.strokeColor || r.lineColor || null
  // store source/target as the vizId so client-side node ids match
  const ed = { source: String(src), target: String(tgt) }
  if (ename) ed.name = String(ename)
  if (ecolor) ed.color = String(ecolor)
  // optional relationship field (human-readable qualifier for the edge)
  const erel = r.relationship || r.relationType || r.rel || null
  if (erel) ed.relationship = String(erel)
  // flexible 'enlightement' field: for now we only accept the canonical
  // value 'arrow' (case-insensitive). Future formats may include other
  // metadata, but keep import behavior strict: set ed.enlightement === 'arrow'
  // only when the CSV value is exactly 'arrow' (ignoring surrounding space
  // and case). Accept common alias spellings for the column name.
  const rawEel = r.enlightement || r.enlightenment || r.enlight || null
  if (rawEel && typeof rawEel === 'string') {
    const norm = rawEel.trim().toLowerCase()
    if (norm === 'arrow') {
      ed.enlightement = 'arrow'
    }
    // otherwise ignore unrecognized values for now
  }
  // Normalize an optional emoji field that may be used to decorate the edge relationship.
  // Accept the same column candidates used for node emoji (emoji, em, icon).
  try {
    let rawEdgeEmoji = r.emoji || r.em || r.icon || null
    if (rawEdgeEmoji && typeof rawEdgeEmoji === 'string') {
      rawEdgeEmoji = decodeUtf7Segments(rawEdgeEmoji)
      const N = 3
      let edgeEmojiVal = null
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        try {
          const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          const parts = Array.from(seg.segment(rawEdgeEmoji)).map(s => s.segment).filter(Boolean)
          if (parts.length) edgeEmojiVal = parts.slice(0, N).join('')
          else edgeEmojiVal = rawEdgeEmoji.trim()
        } catch (e) { edgeEmojiVal = rawEdgeEmoji.trim() }
      } else {
  const parts = Array.from(rawEdgeEmoji.trim())
  edgeEmojiVal = parts.length ? parts.slice(0, N).join('') : rawEdgeEmoji.trim()
      }
      if (edgeEmojiVal && edgeEmojiVal !== '') ed.relationshipEmoji = edgeEmojiVal
    }
  } catch (e) {}
  return { topogramId, data: { ...ed, raw: r }, createdAt: new Date() }
      }).filter(Boolean)
      if (!batch.length) {
        // still account for processed rows even if none produced valid edges
          // capture a few unresolved rows for debugging
          try {
            const unresolvedSamples = slice.map(r => ({
              src: r.source || r.from || null,
              tgt: r.target || r.to || null,
              row: r
            })).slice(0, 5)
            await Jobs.updateAsync(job._id, { $inc: { processed: originalCount, skipped: originalCount }, $push: { errors: { $each: unresolvedSamples } } })
          } catch (e) {
            // don't let logging failures block the worker
            await Jobs.updateAsync(job._id, { $inc: { processed: originalCount, skipped: originalCount } })
          }
        continue
      }
      const res = await Edges.rawCollection().insertMany(batch)
      const batchInserted = (res && res.insertedCount) || batch.length
      edgeInserted += batchInserted
      // processed should reflect the number of rows consumed from the CSV (original slice size)
      await Jobs.updateAsync(job._id, { $inc: { processed: originalCount, inserted: batchInserted } })
    }

  await Jobs.updateAsync(job._id, { $set: { status: 'done', finishedAt: new Date(), inserted: inserted + edgeInserted } })

    // cleanup
    try { fs.unlinkSync(tmpPath) } catch (e) {}
  } catch (err) {
  await Jobs.updateAsync(job._id, { $set: { status: 'failed', error: err && err.message } })
  }
}

Meteor.startup(() => {
  // Poll for jobs
  setInterval(() => {
    (async () => {
      try {
        const job = await Jobs.findOneAsync({ status: 'queued', type: 'csv-import' })
        if (job) await processJob(job)
      } catch (e) {
        console.warn('csvImportJob polling error', e)
      }
    })()
  }, POLL_INTERVAL)
})
