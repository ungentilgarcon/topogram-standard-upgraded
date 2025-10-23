import { Meteor } from 'meteor/meteor'
import { Topograms } from './collections'

Meteor.methods({
  async 'topograms.count'({ folder, noFolder } = {}) {
    let query = {}
    if (folder) query = { folder }
    else if (noFolder) query = { $or: [ { folder: { $exists: false } }, { folder: null }, { folder: '' } ] }
    try {
      const col = Topograms.rawCollection()
      return await col.countDocuments(query)
    } catch (e) {
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
