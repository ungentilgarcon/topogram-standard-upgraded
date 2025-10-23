import { Meteor } from 'meteor/meteor'
import { Topograms } from './collections'

Meteor.methods({
  async 'topograms.count'({ folder } = {}) {
    const query = folder ? { folder } : {}
    try {
      // Use synchronous count; in Meteor 3, use rawCollection if needed
      return await Topograms.find(query).countAsync()
    } catch (e) {
      // fallback for older drivers
      try { return Topograms.find(query).count() } catch (err) { /* ignore */ }
      return 0
    }
  },

  async 'topograms.folderCounts'() {
    const col = Topograms.rawCollection()
    try {
      const pipeline = [
        { $match: { folder: { $exists: true, $ne: null } } },
        { $group: { _id: '$folder', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]
      const docs = await col.aggregate(pipeline).toArray()
      return docs.map(d => ({ name: d._id, count: d.count }))
    } catch (e) {
      // Fallback using distinct+count per name (less efficient but safe)
      try {
        const names = await col.distinct('folder', { folder: { $exists: true, $ne: null } })
        const results = []
        for (const name of names) {
          const count = await col.countDocuments({ folder: name })
          results.push({ name, count })
        }
        return results
      } catch (err) {
        console.error && console.error('topograms.folderCounts failed', err)
        return []
      }
    }
  }
})
