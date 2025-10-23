import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'

// Create an admin user automatically on server startup when ADMIN and ADMIN_PASS
// are provided via environment variables or Meteor.settings. This is a convenience
// for local development and for bootstrapping a fresh deployment. It will not
// overwrite an existing user.
Meteor.startup(async () => {
  const s = Meteor.settings || {}
  const adminId = process.env.ADMIN || s.admin || s.adminUser || null
  const adminEmail = process.env.ADMIN_EMAIL || s.adminEmail || null
  const adminPass = process.env.ADMIN_PASS || s.adminPass || null
  if (!adminId) return

  try {
    // Try to find an existing user by username or email
    let existing = null
    if (adminEmail) {
      existing = await Meteor.users.findOneAsync({ 'emails.address': adminEmail })
    }
    if (!existing && adminId) {
      existing = await Meteor.users.findOneAsync({ username: adminId })
    }

    // Allow updating the password of an existing admin if ADMIN_UPDATE_PASS is provided.
    const adminUpdatePass = process.env.ADMIN_UPDATE_PASS || s.adminUpdatePass || null
    if (existing) {
      console.log('Admin user already exists:', adminId || adminEmail)
      if (adminUpdatePass) {
        try {
          console.log('Accounts.setPassword type:', typeof Accounts.setPassword)
          console.log('Accounts._hashPassword type:', typeof Accounts._hashPassword)
          if (typeof Accounts.setPassword === 'function') {
            Accounts.setPassword(existing._id, adminUpdatePass, { logout: false })
            console.log('Admin password updated via Accounts.setPassword')
          } else if (typeof Accounts._hashPassword === 'function') {
            // Fallback: hash password and write services.password
            const hashed = Accounts._hashPassword(adminUpdatePass)
            await Meteor.users.updateAsync(existing._id, { $set: { 'services.password.bcrypt': hashed } })
            console.log('Admin password updated via fallback hashed write')
          } else {
            // Last-resort: remove and recreate the user with the new password
            try {
              console.log('Falling back to remove-and-recreate user to set password')
              const username = existing.username || adminId
              const email = (existing.emails && existing.emails[0] && existing.emails[0].address) || adminEmail
              await Meteor.users.removeAsync(existing._id)
              const createSpec = { password: adminUpdatePass }
              if (username) createSpec.username = username
              if (email) createSpec.email = email
              const newId = await Promise.resolve(Accounts.createUser(createSpec))
              console.log('Recreated admin user with id:', newId)
            } catch (e2) {
              console.error('Failed to recreate admin user as fallback', e2 && e2.stack ? e2.stack : String(e2))
            }
          }
        } catch (e) {
          console.error('Failed to update admin password', e && e.stack ? e.stack : String(e))
        }
      }
      return
    }

    if (!adminPass) {
      console.warn('ADMIN specified but ADMIN_PASS not set; skipping automatic admin creation')
      return
    }
    // Build creation spec. Prefer providing both username and email when available.
    const createSpec = { password: adminPass }
    if (adminId) createSpec.username = adminId
    if (adminEmail) createSpec.email = adminEmail
    const id = Accounts.createUser(createSpec)
    // mark email verified when created with email
    if (adminEmail) {
      try {
        await Meteor.users.updateAsync(id, { $set: { 'emails.0.verified': true } })
      } catch (e) {
        console.warn('Failed to mark admin email verified', e && e.stack ? e.stack : String(e))
      }
    }
    console.log('Created admin user:', adminId || adminEmail)
  } catch (e) {
    console.error('Error creating admin user during startup:', e && e.stack ? e.stack : String(e))
  }
})
