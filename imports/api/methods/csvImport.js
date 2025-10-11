import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import fs from 'fs'
import path from 'path'
import { Jobs } from '/imports/api/Jobs'

Meteor.methods({
  'topogram.enqueueCsvImport'({ filename, contentBase64, mapping = {}, options = {} }) {
    check(filename, String)
    check(contentBase64, String)
    check(mapping, Object)
    check(options, Object)
    if (!this.userId) throw new Meteor.Error('unauthorized', 'Must be logged in to import')

    // write to a temp file
    const tmpDir = process.env.PWD || '/tmp'
    const tmpPath = path.join(tmpDir, `csv_import_${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`)
    const buffer = Buffer.from(contentBase64, 'base64')
    fs.writeFileSync(tmpPath, buffer)

    const jobId = Jobs.insert({ userId: this.userId, type: 'csv-import', payload: { tmpPath, filename, mapping, options }, status: 'queued', processed: 0, total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], createdAt: new Date() })
    return { jobId }
  }
})
