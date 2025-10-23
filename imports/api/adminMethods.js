import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { Mongo } from 'meteor/mongo'
import { Topograms, Nodes, Edges } from '/imports/api/collections'

// Helper to read configured admin identity from settings or env
function getConfiguredAdmin() {
  // Try Meteor.settings first (common startup config)
  try {
    const s = Meteor.settings || {}
    return s.admin || s.adminUser || s.adminEmail || (s.public && s.public.admin) || process.env.ADMIN || process.env.ADMIN_EMAIL || null
  } catch (e) {
    return process.env.ADMIN || process.env.ADMIN_EMAIL || null
  }
}

function userMatchesAdmin(user, adminId) {
  if (!user || !adminId) return false
  if (user.username && user.username === adminId) return true
  if (user.emails && Array.isArray(user.emails)) {
    for (const e of user.emails) {
      if (e && e.address === adminId) return true
    }
  }
  return false
}

function stringToObjectId(str) {
  if (typeof str !== 'string') return null
  const trimmed = str.trim()
  if (!trimmed || trimmed.length !== 24) return null
  if (!/^[0-9a-fA-F]{24}$/.test(trimmed)) return null
  try {
    return new Mongo.ObjectID(trimmed)
  } catch (e) {
    return null
  }
}

function collectIdVariants(raw) {
  const variants = []
  const seen = new Set()
  const addVariant = (value) => {
    if (value == null) return
    let key
    if (typeof value === 'string') {
      const str = value.trim()
      if (!str) return
      key = `s:${str}`
      value = str
    } else if (value && typeof value === 'object') {
      if (typeof value._str === 'string') {
        key = `o:${value._str}`
      } else if (typeof value.valueOf === 'function') {
        const val = value.valueOf()
        if (typeof val === 'string') {
          key = `o:${val}`
        }
      }
      if (!key) {
        try { key = `o:${JSON.stringify(value)}` } catch (e) { key = `o:${String(value)}` }
      }
    } else {
      key = `p:${String(value)}`
    }
    if (!key) key = `u:${String(value)}`
    if (seen.has(key)) return
    seen.add(key)
    variants.push(value)
  }

  const base = raw && typeof raw === 'object' && raw._id != null ? raw._id : raw
  addVariant(base)

  if (typeof base === 'string') {
    const trimmed = base.trim()
    if (trimmed !== base) addVariant(trimmed)
    const lower = trimmed.toLowerCase()
    if (lower !== trimmed) addVariant(lower)
    const oid = stringToObjectId(trimmed)
    if (oid) addVariant(oid)
  } else if (base && typeof base === 'object') {
    if (typeof base._str === 'string') {
      addVariant(base._str)
      const oid = stringToObjectId(base._str)
      if (oid) addVariant(oid)
    }
    if (typeof base.valueOf === 'function') {
      const val = base.valueOf()
      if (typeof val === 'string') {
        addVariant(val)
        const oid = stringToObjectId(val)
        if (oid) addVariant(oid)
      }
    }
  }

  if (base != null) {
    try {
      const stringified = String(base)
      addVariant(stringified)
      const oid = stringToObjectId(stringified.replace(/[^0-9a-fA-F]/g, ''))
      if (oid) addVariant(oid)
    } catch (e) {}
  }

  return variants
}

async function removeTopogramCascade(topogramId) {
  if (!Topograms) throw new Meteor.Error('collection-missing', 'Topograms collection not found')

  const selectorValues = collectIdVariants(topogramId)
  if (!selectorValues.length) throw new Meteor.Error('invalid-id', 'Topogram id required')

  try {
    const selector = { $in: selectorValues }
    if (Nodes) {
      await Nodes.removeAsync({ topogramId: selector })
      await Nodes.removeAsync({ 'data.topogramId': selector })
    }
    if (Edges) {
      await Edges.removeAsync({ topogramId: selector })
      await Edges.removeAsync({ 'data.topogramId': selector })
    }
    const removedTopograms = await Topograms.removeAsync({ _id: selector })
    return removedTopograms
  } catch (e) {
    console.error && console.error('removeTopogramCascade error', { err: e && e.stack ? e.stack : String(e), topogramId })
    throw e
  }
}

Meteor.methods({
  async 'admin.isAdmin'() {
    const adminId = getConfiguredAdmin()
    if (!adminId) return false
    if (!this.userId) return false
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    return userMatchesAdmin(user, adminId)
  }
})

Meteor.methods({
  async 'topogram.delete'({ topogramId }) {
    check && check(topogramId, String)
    const adminId = getConfiguredAdmin()
    if (!adminId) throw new Meteor.Error('admin-not-configured', 'Admin identity not configured')
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in')
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    if (!userMatchesAdmin(user, adminId)) throw new Meteor.Error('forbidden', 'User not allowed to delete topograms')
    try {
      const removed = await removeTopogramCascade(topogramId)
      if (!removed) {
        console.warn && console.warn(`topogram.delete found no document for ${topogramId}`)
        throw new Meteor.Error('not-found', 'Topogram not found')
      }
      console.log && console.log(`topogram.delete removed ${removed} for ${topogramId}`)
      return { removed }
    } catch (e) {
      console.error && console.error('topogram.delete error', { err: e && e.stack ? e.stack : String(e), userId: this.userId, topogramId, adminId })
      throw new Meteor.Error('delete-failed', e.message || String(e))
    }
  },

  async 'topogram.deleteFolder'({ folder }) {
    check && check(folder, String)
    const adminId = getConfiguredAdmin()
    if (!adminId) throw new Meteor.Error('admin-not-configured', 'Admin identity not configured')
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in')
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    if (!userMatchesAdmin(user, adminId)) throw new Meteor.Error('forbidden', 'User not allowed to delete folders')

    const cursor = await Topograms.rawCollection().find({ folder }).project({ _id: 1 }).toArray()
    if (!cursor.length) {
      return { removedTopograms: 0, folder }
    }

    let totalRemoved = 0
    for (const doc of cursor) {
      try {
        totalRemoved += await removeTopogramCascade(doc._id)
      } catch (e) {
        console.error && console.error('topogram.deleteFolder partial failure', { folder, topogramId: doc && doc._id, err: e && e.stack ? e.stack : String(e) })
        throw new Meteor.Error('delete-folder-failed', e.message || String(e))
      }
    }

    console.log && console.log(`topogram.deleteFolder removed ${cursor.length} topograms from folder ${folder}`)
    return { removedTopograms: cursor.length, folder, removed: totalRemoved }
  }
})
