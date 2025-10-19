import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'
import { Topograms, Nodes, Edges } from '/imports/api/collections'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import schemaJson from '/mapappbuilder/config.schema.json'

function getConfiguredAdmin() {
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

// Utility: recursive copy
async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src)
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true })
    const entries = await fsp.readdir(src)
    for (const e of entries) {
      await copyRecursive(path.join(src, e), path.join(dest, e))
    }
  } else {
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await fsp.copyFile(src, dest)
  }
}

Meteor.methods({
  async 'topogram.exportBundle'({ topogramId, config }) {
    check(topogramId, String)
    check(config, Object)

    // Validate config using JSON schema
    try {
      const ajv = new Ajv({ allErrors: true, strict: false })
      addFormats(ajv)
      const validate = ajv.compile(schemaJson)
      const valid = validate(config)
      if (!valid) {
        // Map AJV errors into friendly messages
        const errors = (validate.errors || []).map(e => `${e.instancePath || '/'} ${e.message}`)
        throw new Meteor.Error('invalid-config', 'Config validation failed', { errors })
      }
    } catch (e) {
      if (e && e.errors && Array.isArray(e.errors)) throw e
      // Re-throw as Meteor.Error for client-friendly consumption
      if (e instanceof Meteor.Error) throw e
      throw new Meteor.Error('schema-validate-error', e && e.message ? e.message : String(e))
    }

    // admin check
    const adminId = getConfiguredAdmin()
    if (!adminId) throw new Meteor.Error('admin-not-configured', 'Admin identity not configured')
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in')
    const user = await Meteor.users.findOneAsync(this.userId, { fields: { username: 1, emails: 1 } })
    if (!userMatchesAdmin(user, adminId)) throw new Meteor.Error('forbidden', 'User not allowed to export bundles')

    // Read topogram and elements
    const topogram = await Topograms.rawCollection().findOne({ _id: topogramId })
    if (!topogram) throw new Meteor.Error('not-found', 'Topogram not found')

    const nodes = await Nodes.rawCollection().find({ topogramId }).toArray()
    const edges = await Edges.rawCollection().find({ topogramId }).toArray()

    // Build bundle dir
    const baseTemp = path.join(os.tmpdir(), 'topogram-exports')
    await fsp.mkdir(baseTemp, { recursive: true })
    const bundleId = (config && config.id) ? config.id.replace(/[^a-zA-Z0-9-_\.]/g, '-') : `${topogramId}`
    const timestamp = Date.now()
    const bundleDir = path.join(baseTemp, `${bundleId}-${timestamp}`)
    await fsp.mkdir(bundleDir, { recursive: true })

    // Copy presentation template. If a template file named index.html.tpl exists we will
    // write a proper index.html (with DOCTYPE) into the bundle to avoid Meteor static-html issues
    const templateDir = path.join(process.cwd(), 'mapappbuilder', 'presentation-template')
    try {
      // copy all files except index.html.tpl (we will materialize index.html with DOCTYPE)
      const entries = await fsp.readdir(templateDir)
      for (const e of entries) {
        const src = path.join(templateDir, e)
        const destRel = path.join('presentation', e)
        if (e === 'index.html.tpl') continue
        await copyRecursive(src, path.join(bundleDir, destRel))
      }
      // If tpl exists, render it into index.html with DOCTYPE
      const tplPath = path.join(templateDir, 'index.html.tpl')
      if (fs.existsSync(tplPath)) {
        const tpl = await fsp.readFile(tplPath, 'utf8')
        // simple replacement for {{TITLE}}
        const rendered = `<!doctype html>\n${tpl.replace(/{{TITLE}}/g, (outConfig && outConfig.title) || topogram.title || 'Topogram')}`
        await fsp.writeFile(path.join(bundleDir, 'presentation', 'index.html'), rendered, 'utf8')
      }
    } catch (e) {
      console.warn('presentation template copy failed', e && e.message)
    }

    // Write config.json (merge provided config with minimal fields)
    const outConfig = Object.assign({}, config || {}, { topogramId })
    await fsp.writeFile(path.join(bundleDir, 'config.json'), JSON.stringify(outConfig, null, 2), 'utf8')

    // Data dir
    await fsp.mkdir(path.join(bundleDir, 'data'), { recursive: true })
    await fsp.writeFile(path.join(bundleDir, 'data', 'topogram.json'), JSON.stringify({ topogram, nodes, edges }, null, 2), 'utf8')

    // Copy assets referenced in config.assets (if paths exist in repo)
    if (outConfig.assets && Array.isArray(outConfig.assets)) {
      for (const assetRel of outConfig.assets) {
        try {
          const srcPath = path.join(process.cwd(), assetRel)
          const destPath = path.join(bundleDir, 'assets', assetRel)
          if (fs.existsSync(srcPath)) {
            await copyRecursive(srcPath, destPath)
          } else {
            console.warn('asset not found, skipping', srcPath)
          }
        } catch (e) {
          console.warn('copy asset failed', assetRel, e && e.message)
        }
      }
    }

    // Run packager to zip the bundle
    const outName = `${bundleId}-${timestamp}.zip`
    const outPath = path.join(baseTemp, outName)
    const packager = path.join(process.cwd(), 'mapappbuilder', 'package.sh')
    try {
      // Ensure package.sh is executable
      try { await fsp.chmod(packager, 0o755) } catch (e) {}
      const res = spawnSync(packager, [bundleDir, outPath], { stdio: 'inherit' })
      if (res.status !== 0) {
        throw new Error('packager failed: ' + (res.error ? res.error.message : `exit ${res.status}`))
      }
    } catch (e) {
      console.error('packager error', e && e.stack ? e.stack : String(e))
      throw new Meteor.Error('packager-failed', e.message || String(e))
    }

    // Return a filename that the exports server will serve from /_exports/<filename>
    return { filename: outName }
  }
})
