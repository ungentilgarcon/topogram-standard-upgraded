import { Meteor } from 'meteor/meteor'
import { Jobs } from '/imports/api/Jobs'
import fs from 'fs'
import Papa from 'papaparse'
import { Topograms, Nodes, Edges } from '/imports/api/collections'

// Simple worker: poll queued jobs every few seconds and process them
const POLL_INTERVAL = 2000

const processJob = async (job) => {
  if (!job || !job.payload || job.status !== 'queued') return
  const { tmpPath, filename, mapping = {}, options = {} } = job.payload
  await Jobs.updateAsync(job._id, { $set: { status: 'running', startedAt: new Date() } })

  try {
    const fileText = fs.readFileSync(tmpPath, { encoding: 'utf8' })
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
    const rows = parsed.data || []
  await Jobs.updateAsync(job._id, { $set: { total: rows.length } })

    // Two pass approach: collect nodes and edges separately
    const nodes = []
    const edges = []
    rows.forEach((r, idx) => {
      const hasEdge = r.source || r.target || r.from || r.to
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
      const batch = nodes.slice(i, i + BATCH).map(r => ({ topogramId, data: r, createdAt: new Date() }))
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
