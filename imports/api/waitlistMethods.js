import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { Waitlist, LIMITS } from '/imports/api/importLimits'
import { Jobs } from '/imports/api/Jobs'
import { Topograms } from '/imports/api/collections'

Meteor.methods({
  'waitlist.position'() {
    if (!this.userId) throw new Meteor.Error('not-authorized')
    const myEntry = Waitlist.findOne({ userId: this.userId })
    if (!myEntry) return { inWaitlist: false }
    const earlier = Waitlist.find({ createdAt: { $lt: myEntry.createdAt } }).count()
    return { inWaitlist: true, position: earlier + 1, waitlistId: myEntry._id }
  },

  async 'waitlist.tryPromote'({ waitlistId }) {
    check(waitlistId, String)
    const entry = Waitlist.findOne(waitlistId)
    if (!entry) throw new Meteor.Error('not-found')
    // Only allow the owner or admin to attempt promotion
    if (entry.userId !== this.userId) {
      const adminId = (Meteor.settings && (Meteor.settings.admin || Meteor.settings.adminUser || Meteor.settings.adminEmail)) || process.env.ADMIN || process.env.ADMIN_EMAIL || null
      const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
      const isAdmin = (user && user.username === adminId) || (user && user.emails && user.emails.some(e => e.address === adminId))
      if (!isAdmin) throw new Meteor.Error('forbidden')
    }

    // Check current concurrent load
    const concurrentActive = await Jobs.rawCollection().countDocuments({ type: 'csv-import', status: { $in: ['queued','processing'] } })
    if (concurrentActive >= LIMITS.concurrentImports) {
      return { promoted: false, reason: 'no-slot' }
    }

    // Create job from entry payload
    const { payload, filename } = entry
    const tmpDir = process.env.PWD || '/tmp'
    const tmpPath = require('path').join(tmpDir, `csv_import_wait_${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`)
    require('fs').writeFileSync(tmpPath, Buffer.from(payload.contentBase64, 'base64'))
    const jobId = await Jobs.insertAsync({ userId: entry.userId, type: 'csv-import', payload: { tmpPath, filename, mapping: payload.mapping, options: payload.options }, status: 'queued', processed: 0, total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], createdAt: new Date() })
    // remove from waitlist
    await Waitlist.removeAsync(waitlistId)
    return { promoted: true, jobId }
  },

  'waitlist.leave'() {
    if (!this.userId) throw new Meteor.Error('not-authorized')
    Waitlist.remove({ userId: this.userId })
    return { left: true }
  }
})
