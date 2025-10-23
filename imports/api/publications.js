import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Topograms, Nodes, Edges, Comments } from './collections'

// Debug: confirm publications file loaded
console.debug && console.debug('publications.js loaded')
console.debug && console.debug('MONGO_URL:', process.env.MONGO_URL)

// COMMENTS
Meteor.publish('comments', function (topogramId) {
  if (!topogramId) return this.ready()
  return Comments.find({ topogramId })
})

// NODES AND EDGES
Meteor.publish('edges', function (topogramId) {
  if (!topogramId) return this.ready()
  // topogramId in the DB may be stored as a string, an ObjectID, or nested under data.topogramId.
  // Try all likely variants so we don't miss documents during migration.
  let query = { $or: [{ topogramId }, { 'data.topogramId': topogramId }] }
  try {
    const oid = new Mongo.ObjectID(topogramId)
    query = { $or: [{ topogramId }, { topogramId: oid }, { 'data.topogramId': topogramId }, { 'data.topogramId': oid }] }
  } catch (e) {
    // not an ObjectID string, keep string-based query
  }
  console.debug && console.debug('edges publication query:', JSON.stringify(query))
  return Edges.find(query)
})

Meteor.publish('nodes', function (topogramId) {
  if (!topogramId) return this.ready()
  // match both top-level topogramId and nested data.topogramId, with string/ObjectID variants
  let query = { $or: [{ topogramId }, { 'data.topogramId': topogramId }] }
  try {
    const oid = new Mongo.ObjectID(topogramId)
    query = { $or: [{ topogramId }, { topogramId: oid }, { 'data.topogramId': topogramId }, { 'data.topogramId': oid }] }
  } catch (e) {
    // not an ObjectID string
  }
  console.debug && console.debug('nodes publication query:', JSON.stringify(query))
  return Nodes.find(query)
})

// TOPGRAMS (public/private)
Meteor.publish('topograms.private', function topogramsPrivate() {
  if (!this.userId) { return this.ready() }
  return Topograms.find({ userId: this.userId })
})

Meteor.publish('topograms.public', function topogramsPublic() {
  // small de-optimized copy of the legacy behavior: publish a limited sorted list
  return Topograms.find({ sharedPublic: true }, { sort: { createdAt: -1 }, limit: 20 })
})

// Admin / debug: publish all topograms (useful for local dev and migration)
Meteor.publish('allTopograms', function allTopograms() {
  // Deprecated in favor of topograms.paginated; keep small safeguard window
  console.debug && console.debug(`allTopograms subscription from ${this.userId || 'anon'}`)
  return Topograms.find({}, { sort: { createdAt: -1 }, limit: 200 })
})

// Paginated topograms publication with optional folder filter
Meteor.publish('topograms.paginated', function topogramsPaginated(options = {}) {
  const { folder = null, page = 1, limit = 200 } = options || {}
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 1, 500))
  const safePage = Math.max(1, parseInt(page) || 1)
  const skip = (safePage - 1) * safeLimit
  const query = folder ? { folder } : {}
  console.debug && console.debug('topograms.paginated', { folder, page: safePage, limit: safeLimit, skip })
  return Topograms.find(query, { sort: { createdAt: -1 }, limit: safeLimit, skip })
})

Meteor.publish('topogram', function (topogramId) {
  console.debug && console.debug(`topogram subscription for id: ${topogramId} from ${this.userId || 'anon'}`)
  if (!topogramId) return this.ready()
  // Support legacy DBs where _id is an ObjectID
  let query = { _id: topogramId }
  try {
    const oid = new Mongo.ObjectID(topogramId)
    query = { $or: [{ _id: topogramId }, { _id: oid }] }
  } catch (e) {
    // not an ObjectID string
  }
  console.debug && console.debug('topogram publication query:', query)
  return Topograms.find(query)
})
