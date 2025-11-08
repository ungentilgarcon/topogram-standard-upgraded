import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { Topograms, Folders, AuditLogs } from './collections'

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
    const tcol = Topograms.rawCollection()
    try {
      const pipeline = [
        { $match: { folder: { $exists: true, $ne: null } } },
        { $group: { _id: '$folder', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]
      const docs = await tcol.aggregate(pipeline).toArray()
      // also include any folders explicitly created in the Folders collection
      const fcol = Folders.rawCollection()
      const folderDocs = await fcol.find({}).project({ name: 1 }).toArray()
      const map = new Map(docs.map(d => [d._id, d.count]))
      folderDocs.forEach(fd => { if (fd && fd.name && !map.has(fd.name)) map.set(fd.name, 0) })
      const out = []
      for (const [name, count] of Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        out.push({ name, count })
      }
      return out
    } catch (e) {
      // Fallback using distinct+count per name (less efficient but safe)
      try {
        const names = await tcol.distinct('folder', { folder: { $exists: true, $ne: null } })
        const results = []
        for (const name of names) {
          const count = await tcol.countDocuments({ folder: name })
          results.push({ name, count })
        }
        // include explicit folders
        const fdocs = await Folders.rawCollection().find({}).project({ name: 1 }).toArray()
        for (const fd of fdocs) {
          if (fd && fd.name && !results.find(r => r.name === fd.name)) results.push({ name: fd.name, count: 0 })
        }
        return results
      } catch (err) {
        console.error && console.error('topograms.folderCounts failed', err)
        return []
      }
    }
  }
  ,
  async 'topograms.deleteFolderMeta'({ folder } = {}) {
    check(folder, String)
    if (!folder || !folder.trim()) throw new Meteor.Error('invalid', 'Folder name required')
    // admin-only
    const adminId = (() => {
      try {
        const s = Meteor.settings || {}
        return s.admin || s.adminUser || s.adminEmail || (s.public && s.public.admin) || process.env.ADMIN || process.env.ADMIN_EMAIL || null
      } catch (e) { return process.env.ADMIN || process.env.ADMIN_EMAIL || null }
    })()
    if (!adminId) throw new Meteor.Error('admin-not-configured', 'Admin identity not configured')
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in')
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    const userMatchesAdmin = (u) => {
      if (!u || !adminId) return false
      if (u.username && u.username === adminId) return true
      if (u.emails && Array.isArray(u.emails)) {
        for (const e of u.emails) if (e && e.address === adminId) return true
      }
      return false
    }
    if (!userMatchesAdmin(user)) throw new Meteor.Error('forbidden', 'User not allowed to delete folders')

    const clean = folder.trim()
    try {
      // Count how many topograms will be affected
      const tcol = Topograms.rawCollection()
      const affected = await tcol.countDocuments({ folder: clean })
      // Unset folder on matching topograms
      await tcol.updateMany({ folder: clean }, { $unset: { folder: '' } })
      // Remove explicit folder entry
      try { await Folders.rawCollection().deleteOne({ name: clean }) } catch (e) {}
      // Log the action
      try {
        await AuditLogs.rawCollection().insertOne({
          type: 'delete-folder-meta',
          folder: clean,
          affected: affected,
          userId: this.userId,
          createdAt: new Date()
        })
      } catch (e) { console.warn && console.warn('topograms.deleteFolderMeta: failed to write audit log', e) }
      return { success: true, affected }
    } catch (e) {
      console.error && console.error('topograms.deleteFolderMeta failed', e)
      throw new Meteor.Error('delete-failed', e.message || String(e))
    }
  }
,
  async 'topograms.elementCountsMany'({ ids = [] } = {}) {
    check(ids, Array)
    const out = {}
    try {
      // Use rawCollections for server-side counts
      const ncol = (await import('/imports/api/collections')).Nodes.rawCollection()
      const ecol = (await import('/imports/api/collections')).Edges.rawCollection()
      await Promise.all(ids.map(async (id) => {
        try {
          const [n, e] = await Promise.all([
            ncol.countDocuments({ topogramId: id }),
            ecol.countDocuments({ topogramId: id })
          ])
          out[id] = { nodes: n || 0, edges: e || 0 }
        } catch (err) { out[id] = { nodes: 0, edges: 0 } }
      }))
      return out
    } catch (e) {
      console.error && console.error('topograms.elementCountsMany failed', e)
      return out
    }
  }
,
  async 'topogram.moveToFolder'({ topogramId, folder = null } = {}) {
    check(topogramId, String)
    // only allow admins to move topograms between folders
    const adminId = (() => {
      try {
        const s = Meteor.settings || {}
        return s.admin || s.adminUser || s.adminEmail || (s.public && s.public.admin) || process.env.ADMIN || process.env.ADMIN_EMAIL || null
      } catch (e) { return process.env.ADMIN || process.env.ADMIN_EMAIL || null }
    })()
    if (!adminId) throw new Meteor.Error('admin-not-configured', 'Admin identity not configured')
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in')
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    const userMatchesAdmin = (u) => {
      if (!u || !adminId) return false
      if (u.username && u.username === adminId) return true
      if (u.emails && Array.isArray(u.emails)) {
        for (const e of u.emails) if (e && e.address === adminId) return true
      }
      return false
    }
    if (!userMatchesAdmin(user)) throw new Meteor.Error('forbidden', 'User not allowed to move topograms')

    // normalize folder: empty string or null => unset
    const set = (folder === null || folder === '' ? { $unset: { folder: '' } } : { $set: { folder } })
    try {
      const before = await Topograms.findOneAsync({ _id: topogramId }, { fields: { folder: 1, title: 1 } })
      await Topograms.updateAsync({ _id: topogramId }, set)
      // Ensure folder exists in Folders collection when setting
      if (folder && folder !== '') {
        try { await Folders.rawCollection().updateOne({ name: folder }, { $set: { name: folder, createdAt: new Date() } }, { upsert: true }) } catch (e) {}
      }
      // Log the move into AuditLogs
      try {
        await AuditLogs.rawCollection().insertOne({
          type: 'move',
          topogramId,
          title: before && before.title ? before.title : null,
          from: before && before.folder ? before.folder : null,
          to: (folder === '' || folder === null) ? null : folder,
          userId: this.userId,
          createdAt: new Date()
        })
      } catch (e) {
        console.warn && console.warn('topogram.moveToFolder: failed to write audit log', e)
      }
      return { success: true }
    } catch (e) {
      console.error && console.error('topogram.moveToFolder failed', e)
      throw new Meteor.Error('move-failed', e.message || String(e))
    }
  }
,
  async 'topograms.createFolder'({ name } = {}) {
    check(name, String)
    if (!name || !name.trim()) throw new Meteor.Error('invalid', 'Folder name required')
    // admin-only
    const adminId = (() => {
      try {
        const s = Meteor.settings || {}
        return s.admin || s.adminUser || s.adminEmail || (s.public && s.public.admin) || process.env.ADMIN || process.env.ADMIN_EMAIL || null
      } catch (e) { return process.env.ADMIN || process.env.ADMIN_EMAIL || null }
    })()
    if (!adminId) throw new Meteor.Error('admin-not-configured', 'Admin identity not configured')
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in')
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    const userMatchesAdmin = (u) => {
      if (!u || !adminId) return false
      if (u.username && u.username === adminId) return true
      if (u.emails && Array.isArray(u.emails)) {
        for (const e of u.emails) if (e && e.address === adminId) return true
      }
      return false
    }
    if (!userMatchesAdmin(user)) throw new Meteor.Error('forbidden', 'User not allowed to create folders')
    const clean = name.trim()
    try {
      await Folders.rawCollection().updateOne({ name: clean }, { $setOnInsert: { name: clean, createdAt: new Date() } }, { upsert: true })
      return { success: true }
    } catch (e) {
      console.error && console.error('topograms.createFolder failed', e)
      throw new Meteor.Error('create-failed', e.message || String(e))
    }
  }
})
