import { Meteor } from 'meteor/meteor'
import { Nodes, Edges } from './collections'

// Minimal set of methods ported from legacy app to support the client UI
Meteor.methods({
  async 'node.create'(node) {
    return await Nodes.insertAsync(node)
  },

  async 'node.createMany'({ topogramId, nodes }) {
    return await Promise.all(nodes.map(n => Nodes.insertAsync({ ...n, topogramId })))
  },

  async 'node.delete'({ nodeId }) {
    return await Nodes.removeAsync(nodeId)
  },

  async 'node.deleteMany'({ nodeIds }) {
    return await Nodes.removeAsync({ _id: { $in: nodeIds } })
  },

  async 'node.move'({ topogramId, nodeId, position }) {
    return await Nodes.updateAsync({ topogramId, 'data.id': nodeId }, { $set: { position } })
  },

  async 'deleteNodesByTopogramId'(topogramId) {
    return await Nodes.removeAsync({ topogramId })
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
    return true
  },

  async deleteNodeAndConnectedEdges(nodeId, edgesId) {
    const node = await Nodes.findOneAsync({ 'data.id': nodeId })
    if (!node) return null
    await Nodes.removeAsync({ _id: node._id })
    await Edges.removeAsync({ 'data.id': { $in: edgesId } })
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
