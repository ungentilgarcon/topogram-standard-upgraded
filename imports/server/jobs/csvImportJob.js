import { Meteor } from 'meteor/meteor'
import { Jobs } from '/imports/api/Jobs'
import fs from 'fs'
import Papa from 'papaparse'
import { Topograms, Nodes, Edges } from '/imports/api/collections'

// Simple worker: poll queued jobs every few seconds and process them
const POLL_INTERVAL = 2000

const processJob = (job) => {
  if (!job || !job.payload || job.status !== 'queued') return
  const { tmpPath, filename, mapping = {}, options = {} } = job.payload
  Jobs.update(job._id, { $set: { status: 'running', startedAt: new Date() } })

  try {
    const fileText = fs.readFileSync(tmpPath, { encoding: 'utf8' })
  const parsed = Papa.parse(fileText, { header: true, skipEmptyLines: true, comments: '#' })
    const rows = parsed.data || []
    Jobs.update(job._id, { $set: { total: rows.length } })

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
    const topogramId = Topograms.insert({ title: topogramTitle, userId: job.userId, createdAt: new Date(), importMeta: { filename } })

    // Insert nodes in batches
    const BATCH = 500
    let inserted = 0
    for (let i = 0; i < nodes.length; i += BATCH) {
      const batch = nodes.slice(i, i + BATCH).map(r => ({ topogramId, data: r, createdAt: new Date() }))
      const res = Nodes.rawCollection().insertMany(batch)
      inserted += (res && res.insertedCount) || batch.length
      Jobs.update(job._id, { $inc: { processed: batch.length, inserted } })
    }

    // Build a quick lookup for node ids by data.id or _id
    const nodeDocs = Nodes.find({ topogramId }).fetch()
    const idMap = new Map()
    nodeDocs.forEach(nd => {
      const key = (nd.data && nd.data.id) || nd._id
      idMap.set(String(key), String(nd._id))
    })

    // Insert edges, resolving endpoints
    let edgeInserted = 0
    for (let i = 0; i < edges.length; i += BATCH) {
      const batch = edges.slice(i, i + BATCH).map(r => {
        const rawSrc = r.source || r.from
        const rawTgt = r.target || r.to
        const src = rawSrc ? idMap.get(String(rawSrc)) : null
        const tgt = rawTgt ? idMap.get(String(rawTgt)) : null
        if (!src || !tgt) return null
        return { topogramId, data: { source: src, target: tgt, raw: r }, createdAt: new Date() }
      }).filter(Boolean)
      if (!batch.length) continue
      const res = Edges.rawCollection().insertMany(batch)
      edgeInserted += (res && res.insertedCount) || batch.length
      Jobs.update(job._id, { $inc: { processed: batch.length, inserted: edgeInserted } })
    }

    Jobs.update(job._id, { $set: { status: 'done', finishedAt: new Date(), inserted: inserted + edgeInserted } })

    // cleanup
    try { fs.unlinkSync(tmpPath) } catch (e) {}
  } catch (err) {
    Jobs.update(job._id, { $set: { status: 'failed', error: err && err.message } })
  }
}

Meteor.startup(() => {
  // Poll for jobs
  setInterval(() => {
    const job = Jobs.findOne({ status: 'queued', type: 'csv-import' })
    if (job) processJob(job)
  }, POLL_INTERVAL)
})
