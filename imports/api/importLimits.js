import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'

export const Waitlist = new Mongo.Collection('import_waitlist')

// Configuration limits (can be extended to read from Meteor.settings)
export const LIMITS = {
  uploadBytes: 1 * 1024 * 1024, // 1 MB
  nodesPerImport: 100,
  edgesPerImport: 200,
  perUserDailyTopograms: 20,
  globalDailyImports: 200,
  concurrentImports: 10
}

export function isAdminUser(user, adminId) {
  if (!user || !adminId) return false
  if (user.username && user.username === adminId) return true
  if (user.emails && Array.isArray(user.emails)) {
    for (const e of user.emails) if (e && e.address === adminId) return true
  }
  return false
}

export default {
  Waitlist,
  LIMITS,
  isAdminUser
}
