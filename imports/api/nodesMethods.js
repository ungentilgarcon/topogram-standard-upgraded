import { Meteor } from 'meteor/meteor'
import { Nodes, Edges, Topograms } from './collections'

// Minimal set of methods ported from legacy app to support the client UI
Meteor.methods({
  async 'node.create'(node) {
    const id = await Nodes.insertAsync(node)
    try {
      const topId = node && node.topogramId
      if (topId) await Topograms.updateAsync({ _id: topId }, { $inc: { nodeCount: 1 } })
    } catch (e) { console.warn && console.warn('Failed to increment nodeCount', e) }
    return id
  },

  async 'node.createMany'({ topogramId, nodes }) {
    const res = await Promise.all(nodes.map(n => Nodes.insertAsync({ ...n, topogramId })))
    try {
      if (topogramId && Array.isArray(nodes) && nodes.length) {
        await Topograms.updateAsync({ _id: topogramId }, { $inc: { nodeCount: nodes.length } })
      }
    } catch (e) { console.warn && console.warn('Failed to increment nodeCount (many)', e) }
    return res
  },

  async 'node.delete'({ nodeId }) {
    const node = await Nodes.findOneAsync({ _id: nodeId })
    if (!node) return null
    const res = await Nodes.removeAsync(nodeId)
    try {
      if (node.topogramId) await Topograms.updateAsync({ _id: node.topogramId }, { $inc: { nodeCount: -1 } })
    } catch (e) { console.warn && console.warn('Failed to decrement nodeCount', e) }
    return res
  },

  async 'node.deleteMany'({ nodeIds }) {
    // find topogram grouping for the nodes to be deleted so we can decrement counts
    try {
      const docs = await Nodes.rawCollection().find({ _id: { $in: nodeIds } }).toArray()
      const counts = docs.reduce((m, d) => { if (d && d.topogramId) { m[d.topogramId] = (m[d.topogramId] || 0) + 1 } return m }, {})
      const res = await Nodes.removeAsync({ _id: { $in: nodeIds } })
      await Promise.all(Object.keys(counts).map(tid => Topograms.updateAsync({ _id: tid }, { $inc: { nodeCount: -counts[tid] } })))
      return res
    } catch (e) {
      // fallback: perform removal and don't update counts
      return await Nodes.removeAsync({ _id: { $in: nodeIds } })
    }
  },

  async 'node.move'({ topogramId, nodeId, position }) {
    return await Nodes.updateAsync({ topogramId, 'data.id': nodeId }, { $set: { position } })
  },

  async 'deleteNodesByTopogramId'(topogramId) {
    const res = await Nodes.removeAsync({ topogramId })
    try {
      if (topogramId) await Topograms.updateAsync({ _id: topogramId }, { $set: { nodeCount: 0 } })
    } catch (e) { console.warn && console.warn('Failed to reset nodeCount for topogram', e) }
    return res
  },

  async 'updateNodePosition'(nodeId, position) {
    const node = await Nodes.findOneAsync({ 'data.id': nodeId })
    if (!node) return null
    return await Nodes.updateAsync({ _id: node._id }, { $set: { position } })
  },

  async 'lockNode'(nodeId, position) {
    const node = await Nodes.findOneAsync({ 'data.id': nodeId })
    if (!node) return null
    const locked = node.locked ? false : true
    return await Nodes.updateAsync({ _id: node._id }, { $set: { locked, position } })
  },

  async 'starNode'(nodeId) {
    const node = await Nodes.findOneAsync({ 'data.id': nodeId })
    if (!node) return null
    const starred = node.data && node.data.starred ? false : true
    return await Nodes.updateAsync({ _id: node._id }, { $set: { 'data.starred': starred } })
  },

  async mergeNodes(sourceId, targetId) {
    const source = await Nodes.findOneAsync({ _id: sourceId })
    const target = await Nodes.findOneAsync({ _id: targetId })
    if (!source || !target) return null
    await Edges.updateAsync({ 'data.source': target.data.id }, { $set: { 'data.source': source.data.id } }, { multi: true })
    await Edges.updateAsync({ 'data.target': target.data.id }, { $set: { 'data.target': source.data.id } }, { multi: true })
    await Nodes.removeAsync({ _id: targetId })
    try {
      if (target && target.topogramId) await Topograms.updateAsync({ _id: target.topogramId }, { $inc: { nodeCount: -1 } })
    } catch (e) { console.warn && console.warn('Failed to decrement nodeCount after merge', e) }
    return true
  },

  async deleteNodeAndConnectedEdges(nodeId, edgesId) {
    const node = await Nodes.findOneAsync({ 'data.id': nodeId })
    if (!node) return null
    await Nodes.removeAsync({ _id: node._id })
    await Edges.removeAsync({ 'data.id': { $in: edgesId } })
    try {
      if (node.topogramId) {
        await Topograms.updateAsync({ _id: node.topogramId }, { $inc: { nodeCount: -1, edgeCount: -(Array.isArray(edgesId) ? edgesId.length : 0) } })
      }
    } catch (e) { console.warn && console.warn('Failed to decrement counts for deleteNodeAndConnectedEdges', e) }
    return true
  },

  fetchNodes(edges) {
    return edges
      .map(e => ({ source: e.data.source, target: e.data.target }))
      .reduce((map, d) => {
        map[d.id] = map[d.id] || d
        map[d.id].count = (map[d.id].count || 0) + 1
        return map
      }, {})
  }
})
