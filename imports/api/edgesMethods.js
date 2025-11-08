import { Meteor } from 'meteor/meteor'
import { Edges, Topograms } from './collections'

Meteor.methods({
  async 'edge.create'(edge) {
    const id = await Edges.insertAsync(edge)
    try {
      const topId = edge && edge.topogramId
      if (topId) await Topograms.updateAsync({ _id: topId }, { $inc: { edgeCount: 1 } })
    } catch (e) { console.warn && console.warn('Failed to increment edgeCount', e) }
    return id
  },

  async 'edge.createMany'({ topogramId, edges }) {
    const ok = edges.map(e => ({ ...e, topogramId }))
    const res = await Promise.all(ok.map(e => Edges.insertAsync(e)))
    try {
      if (topogramId && Array.isArray(edges) && edges.length) {
        await Topograms.updateAsync({ _id: topogramId }, { $inc: { edgeCount: edges.length } })
      }
    } catch (e) { console.warn && console.warn('Failed to increment edgeCount (many)', e) }
    return res
  },

  async 'edge.delete'({ edgeId }) {
    const edge = await Edges.findOneAsync({ _id: edgeId })
    if (!edge) return null
    const res = await Edges.removeAsync(edgeId)
    try {
      if (edge.topogramId) await Topograms.updateAsync({ _id: edge.topogramId }, { $inc: { edgeCount: -1 } })
    } catch (e) { console.warn && console.warn('Failed to decrement edgeCount', e) }
    return res
  },

  async 'edge.deleteMany'({ edgeIds }) {
    try {
      const docs = await Edges.rawCollection().find({ _id: { $in: edgeIds } }).toArray()
      const counts = docs.reduce((m, d) => { if (d && d.topogramId) { m[d.topogramId] = (m[d.topogramId] || 0) + 1 } return m }, {})
      const res = await Edges.removeAsync({ _id: { $in: edgeIds } })
      await Promise.all(Object.keys(counts).map(tid => Topograms.updateAsync({ _id: tid }, { $inc: { edgeCount: -counts[tid] } })))
      return res
    } catch (e) {
      return await Edges.removeAsync({ _id: { $in: edgeIds } })
    }
  },

  async 'edge.deleteAll'(topogramId) {
    const res = await Edges.removeAsync({ topogramId })
    try {
      if (topogramId) await Topograms.updateAsync({ _id: topogramId }, { $set: { edgeCount: 0 } })
    } catch (e) { console.warn && console.warn('Failed to reset edgeCount for topogram', e) }
    return res
  },

  async deleteEdgesByTopogramId(topogramId) {
    const res = await Edges.removeAsync({ topogramId })
    try {
      if (topogramId) await Topograms.updateAsync({ _id: topogramId }, { $set: { edgeCount: 0 } })
    } catch (e) { console.warn && console.warn('Failed to reset edgeCount for topogram', e) }
    return res
  }
})
