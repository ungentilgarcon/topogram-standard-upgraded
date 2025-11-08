import { Meteor } from 'meteor/meteor'
import { Topograms, Nodes, Edges } from '/imports/api/collections'

// Backfill nodeCount and edgeCount for Topogram documents that are missing them.
// This runs on server startup and is idempotent: it only processes Topograms
// where nodeCount or edgeCount is missing or null.
Meteor.startup(() => {
  ;(async () => {
    try {
      const selector = { $or: [ { nodeCount: { $exists: false } }, { edgeCount: { $exists: false } }, { nodeCount: null }, { edgeCount: null } ] }
      const total = await Topograms.rawCollection().countDocuments(selector)
      if (!total) {
        console.log && console.log('backfillCounts: no topograms need counts')
        return
      }
      console.log && console.log(`backfillCounts: starting - ${total} topograms to process`)

      const BATCH = 50
      const cursor = Topograms.rawCollection().find(selector).project({ _id: 1 }).batchSize(BATCH)
      let processed = 0
      while (await cursor.hasNext()) {
        const doc = await cursor.next()
        if (!doc || !doc._id) continue
        try {
          const topId = doc._id
          const nodeCount = await Nodes.rawCollection().countDocuments({ topogramId: topId })
          const edgeCount = await Edges.rawCollection().countDocuments({ topogramId: topId })
          await Topograms.updateAsync({ _id: topId }, { $set: { nodeCount, edgeCount } })
        } catch (e) {
          console.warn && console.warn('backfillCounts: failed for topogram', doc && doc._id, e)
        }
        processed++
        if (processed % 50 === 0) console.log && console.log(`backfillCounts: processed ${processed}/${total}`)
      }
      console.log && console.log(`backfillCounts: completed - processed ${processed} topograms`)
    } catch (err) {
      console.error && console.error('backfillCounts: unexpected error', err)
    }
  })()
})
