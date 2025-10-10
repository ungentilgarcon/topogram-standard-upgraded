import { Meteor } from 'meteor/meteor'
import { Edges } from './collections'

Meteor.methods({
  async 'edge.create'(edge) {
    return await Edges.insertAsync(edge)
  },

  async 'edge.createMany'({ topogramId, edges }) {
    const ok = edges.map(e => ({ ...e, topogramId }))
    return await Promise.all(ok.map(e => Edges.insertAsync(e)))
  },

  async 'edge.delete'({ edgeId }) {
    return await Edges.removeAsync(edgeId)
  },

  async 'edge.deleteMany'({ edgeIds }) {
    return await Edges.removeAsync({ _id: { $in: edgeIds } })
  },

  async 'edge.deleteAll'(topogramId) {
    return await Edges.removeAsync({ topogramId })
  },

  async deleteEdgesByTopogramId(topogramId) {
    return await Edges.removeAsync({ topogramId })
  }
})
