import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import fs from 'fs'
import path from 'path'
import { Jobs } from '/imports/api/Jobs'

Meteor.methods({
  async 'topogram.enqueueCsvImport'({ filename, contentBase64, mapping = {}, options = {} }) {
    try {
      check(filename, String)
      check(contentBase64, String)
      check(mapping, Object)
      check(options, Object)
      // In development allow anonymous imports (convenience for local testing).
      // In production enforce authentication.
      if (!this.userId && process.env.NODE_ENV === 'production') {
        throw new Meteor.Error('unauthorized', 'Must be logged in to import')
      }

      // write to a temp file
      const tmpDir = process.env.PWD || '/tmp'
      const tmpPath = path.join(tmpDir, `csv_import_${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`)
      const buffer = Buffer.from(contentBase64, 'base64')
      fs.writeFileSync(tmpPath, buffer)

      const jobId = await Jobs.insertAsync({ userId: this.userId, type: 'csv-import', payload: { tmpPath, filename, mapping, options }, status: 'queued', processed: 0, total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], createdAt: new Date() })
      return { jobId }
    } catch (err) {
      console.error('Error in topogram.enqueueCsvImport', err)
      throw new Meteor.Error('server-error', err && err.message ? err.message : String(err))
    }
  }
})
