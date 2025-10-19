import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import fs from 'fs'
import path from 'path'
import { Jobs } from '/imports/api/Jobs'
import { Waitlist, LIMITS, isAdminUser } from '/imports/api/importLimits'
import { Topograms } from '/imports/api/collections'
import Papa from 'papaparse'

Meteor.methods({
  async 'topogram.enqueueCsvImport'({ filename, contentBase64, mapping = {}, options = {} }) {
    try {
      check(filename, String)
      check(contentBase64, String)
      check(mapping, Object)
      check(options, Object)
      // Only authenticated users can import in production and dev (enforce always)
      if (!this.userId) {
        throw new Meteor.Error('unauthorized', 'Must be logged in to import')
      }

      const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
      const adminId = (Meteor.settings && (Meteor.settings.admin || Meteor.settings.adminUser || Meteor.settings.adminEmail)) || process.env.ADMIN || process.env.ADMIN_EMAIL || null
      const isAdmin = isAdminUser(user, adminId)

      // Enforce upload size limit (except admin)
      const buffer = Buffer.from(contentBase64, 'base64')
      if (!isAdmin && buffer.length > LIMITS.uploadBytes) {
        throw new Meteor.Error('file-too-large', `Upload exceeds ${LIMITS.uploadBytes} bytes`)
      }

      // Quick scan CSV to count nodes/edges before writing the tmp file
      // Papa parse it in streaming mode to count rows keyed as node/edge
      let nodesCount = 0
      let edgesCount = 0
      try {
        const text = buffer.toString('utf8')
        const parsed = Papa.parse(text, { header: true })
        for (const row of parsed.data) {
          // Simple heuristic: presence of 'source' or 'target' indicates edge
          const keys = Object.keys(row || {})
          const hasSource = keys.some(k => k.toLowerCase().includes('source'))
          const hasTarget = keys.some(k => k.toLowerCase().includes('target'))
          if (hasSource || hasTarget) edgesCount++
          else nodesCount++
        }
      } catch (e) {
        // If parsing fails, proceed to let the background job handle complex formats
      }

      // Enforce per-import node/edge limits (except admin)
      if (!isAdmin) {
        if (nodesCount > LIMITS.nodesPerImport) throw new Meteor.Error('too-many-nodes', `Nodes exceed limit of ${LIMITS.nodesPerImport}`)
        if (edgesCount > LIMITS.edgesPerImport) throw new Meteor.Error('too-many-edges', `Edges exceed limit of ${LIMITS.edgesPerImport}`)
      }

      // Per-user daily topogram creation limit
      if (!isAdmin) {
        const since = new Date();
        since.setHours(0,0,0,0)
  const userTopCreated = await Topograms.rawCollection().countDocuments({ userId: this.userId, createdAt: { $gte: since } })
        if (userTopCreated >= LIMITS.perUserDailyTopograms) throw new Meteor.Error('daily-topogram-limit', `You have reached daily topogram creation limit of ${LIMITS.perUserDailyTopograms}`)
      }

      // Global daily imports cap
      const sinceGlobal = new Date();
      sinceGlobal.setHours(0,0,0,0)
  const globalImportsToday = await Jobs.rawCollection().countDocuments({ type: 'csv-import', createdAt: { $gte: sinceGlobal } })
      if (!isAdmin && globalImportsToday >= LIMITS.globalDailyImports) {
        throw new Meteor.Error('global-daily-limit', 'Daily imports limit reached')
      }

      // Concurrency: count jobs with status queued or processing
  const concurrentActive = await Jobs.rawCollection().countDocuments({ type: 'csv-import', status: { $in: ['queued','processing'] } })
      if (!isAdmin && concurrentActive >= LIMITS.concurrentImports) {
        // add to waitlist and persist payload so we can promote later
        const waitEntry = {
          userId: this.userId,
          filename,
          payload: { contentBase64, mapping, options },
          createdAt: new Date()
        }
        const waitId = await Waitlist.insertAsync(waitEntry)
        return { queued: true, waitlistId: waitId }
      }

  // write to a temp file
  const tmpDir = process.env.PWD || '/tmp'
  const tmpPath = path.join(tmpDir, `csv_import_${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`)
  fs.writeFileSync(tmpPath, buffer)

  const jobId = await Jobs.insertAsync({ userId: this.userId, type: 'csv-import', payload: { tmpPath, filename, mapping, options }, status: 'queued', processed: 0, total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], createdAt: new Date() })
  return { jobId }
    } catch (err) {
      console.error('Error in topogram.enqueueCsvImport', err)
      throw new Meteor.Error('server-error', err && err.message ? err.message : String(err))
    }
  }
})
