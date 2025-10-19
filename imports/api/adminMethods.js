import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
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

  // Perform deletion and cascade nodes/edges using exported collections
  if (!Topograms) throw new Meteor.Error('collection-missing', 'Topograms collection not found')

    // Remove nodes and edges associated with this topogram id
    try {
      console.log && console.log(`topogram.delete called by user ${this.userId} for ${topogramId} (adminId=${adminId})`)
      if (Nodes) {
        // removeAsync accepts a selector
        await Nodes.removeAsync({ topogramId })
        await Nodes.removeAsync({ 'data.topogramId': topogramId })
      }
      if (Edges) {
        await Edges.removeAsync({ topogramId })
        await Edges.removeAsync({ 'data.topogramId': topogramId })
      }
      const res = await Topograms.removeAsync(topogramId)
      return { removed: res }
    } catch (e) {
      console.error && console.error('topogram.delete error', { err: e && e.stack ? e.stack : String(e), userId: this.userId, topogramId, adminId })
      throw new Meteor.Error('delete-failed', e.message || String(e))
    }
  }
})
