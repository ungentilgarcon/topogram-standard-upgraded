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

  // Merge provided config early so template rendering can access title and other fields
  const outConfig = Object.assign({}, config || {}, { topogramId })

    // Copy presentation template. The exporter may run in different working
    // directories (project root during dev, or Meteor build dir in production).
    // To be robust, walk up parent directories from both process.cwd() and
    // __dirname and look for a `mapappbuilder/presentation-template` folder.
    function findUpForTemplate(startDir, maxLevels = 8) {
      let cur = path.resolve(startDir)
      for (let i = 0; i < maxLevels; i++) {
        const cand = path.join(cur, 'mapappbuilder', 'presentation-template')
        try {
          if (fs.existsSync(cand)) return cand
        } catch (e) {
          // ignore
        }
        const parent = path.dirname(cur)
        if (parent === cur) break
        cur = parent
      }
      return null
    }

    let templateDir = findUpForTemplate(process.cwd()) || findUpForTemplate(__dirname)
    if (!templateDir) {
      // As a last resort, check project-root relative paths
      const fallback = path.join(process.cwd(), '..', '..', 'mapappbuilder', 'presentation-template')
      if (fs.existsSync(fallback)) templateDir = fallback
    }

    if (!templateDir) {
      const tried = [
        path.join(process.cwd(), 'mapappbuilder', 'presentation-template'),
        path.join(process.cwd(), '..', '..', 'mapappbuilder', 'presentation-template'),
        path.join(__dirname, '..', '..', '..', 'mapappbuilder', 'presentation-template'),
        path.join(__dirname, '..', '..', '..', '..', 'mapappbuilder', 'presentation-template')
      ]
      console.warn('presentation template copy failed: no template dir found; tried:', tried)
    } else {
      try {
        // copy all files except index.html.tpl (we will materialize index.html with DOCTYPE)
        const entries = await fsp.readdir(templateDir)
        for (const e of entries) {
          const src = path.join(templateDir, e)
          const destRel = path.join('presentation', e)
          if (e === 'index.html.tpl') continue
          await copyRecursive(src, path.join(bundleDir, destRel))
        }
  // If the template contains a `lib` folder (e.g. local leaflet/cytoscape
  // builds), copy it into the presentation so exports are offline-ready.
        const libPath = path.join(templateDir, 'lib')
        if (fs.existsSync(libPath)) {
          await copyRecursive(libPath, path.join(bundleDir, 'presentation', 'lib'))
        } else {
          // If the template didn't include a lib folder, attempt a few repo-relative
          // fallbacks to locate a presentation-template/lib that may exist elsewhere
          // in the repository (packaged dev tree vs build output). This addresses
          // cases where the exporter was invoked from a different working dir
          // and the earlier findUp didn't catch the lib path.
          const fallbackLibCandidates = [
            path.join(process.cwd(), 'mapappbuilder', 'presentation-template', 'lib'),
            path.join(__dirname, '..', 'mapappbuilder', 'presentation-template', 'lib'),
            path.join(__dirname, '..', '..', 'mapappbuilder', 'presentation-template', 'lib'),
            path.join(__dirname, '..', '..', '..', 'mapappbuilder', 'presentation-template', 'lib')
          ]
          let copiedFallback = false
          for (const cand of fallbackLibCandidates) {
            try {
              if (fs.existsSync(cand)) {
                await copyRecursive(cand, path.join(bundleDir, 'presentation', 'lib'))
                copiedFallback = true
                break
              }
            } catch (e) {
              // continue
            }
          }
          if (!copiedFallback) {
          // Try to find local node_modules for leaflet and cytoscape and
          // copy minified assets into presentation/lib when present. This
          // helps developers who have installed dependencies locally via npm.
          const tryFindNodeModule = (start, rel) => {
            let cur = path.resolve(start)
            for (let i = 0; i < 6; i++) {
              const cand = path.join(cur, 'node_modules', rel)
              try { if (fs.existsSync(cand)) return cand } catch (e) {}
              const parent = path.dirname(cur)
              if (parent === cur) break
              cur = parent
            }
            return null
          }

          // Include cytoscape as well so exported bundles have the network
          // runtime available even if the presentation template didn't ship it.
          const libsToCopy = [
            { pkg: 'leaflet', rel: path.join('leaflet', 'dist') },
            { pkg: 'cytoscape', rel: path.join('cytoscape', 'dist') }
          ]

          const destLib = path.join(bundleDir, 'presentation', 'lib')
          for (const lib of libsToCopy) {
            let found = tryFindNodeModule(process.cwd(), lib.rel) || tryFindNodeModule(__dirname, lib.rel)
            if (found) {
              try {
                await copyRecursive(found, destLib)
              } catch (e) {
                console.warn('failed to copy local node_module assets for', lib.pkg, e && e.message)
              }
            }
          }
          }
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
    }

  // Write config.json (merge provided config with minimal fields)
  await fsp.writeFile(path.join(bundleDir, 'config.json'), JSON.stringify(outConfig, null, 2), 'utf8')

    // Data dir
    await fsp.mkdir(path.join(bundleDir, 'data'), { recursive: true })
    await fsp.writeFile(path.join(bundleDir, 'data', 'topogram.json'), JSON.stringify({ topogram, nodes, edges }, null, 2), 'utf8')

    // Copy assets referenced in config.assets (if paths exist in repo)
    if (outConfig.assets && Array.isArray(outConfig.assets)) {
      // Use a finder similar to template finder: walk up to find project root
      function findAssetBase(startDir, relPath, maxLevels = 8) {
        let cur = path.resolve(startDir)
        for (let i = 0; i < maxLevels; i++) {
          const cand = path.join(cur, relPath)
          try {
            if (fs.existsSync(cand)) return cur
          } catch (e) {}
          const parent = path.dirname(cur)
          if (parent === cur) break
          cur = parent
        }
        return null
      }

      for (const assetRel of outConfig.assets) {
        let copied = false

        // 1) If we have a templateDir, try copying relative to it into presentation/
        if (templateDir) {
          try {
            const srcPath = path.join(templateDir, assetRel)
            if (fs.existsSync(srcPath)) {
              const destPath = path.join(bundleDir, 'presentation', assetRel)
              await copyRecursive(srcPath, destPath)
              copied = true
            }
          } catch (e) {
            // continue to other strategies
          }
          if (copied) continue
        }

        // 2) Try walking upwards from several starting points to locate the asset
        const starts = [process.cwd(), __dirname, path.join(process.cwd(), '..', '..')]
        for (const s of starts) {
          const base = findAssetBase(s, assetRel)
          if (base) {
            try {
              const srcPath = path.join(base, assetRel)
              const destPath = path.join(bundleDir, 'assets', assetRel)
              await copyRecursive(srcPath, destPath)
              copied = true
              break
            } catch (e) {
              // continue
            }
          }
        }

        if (!copied) {
          console.warn('asset not found, skipping (tried templateDir and upwards)', assetRel)
        }
      }
    }

    // Create a minimal runnable Node app inside the bundle so the zip can be
    // unpacked and run independently. This app simply serves the `presentation`
    // directory as static files.
    try {
      const nodePkg = {
        name: bundleId,
        version: '0.0.1',
        private: true,
        scripts: {
          start: 'node server.js'
        },
        dependencies: {
          express: '^4.18.2'
        }
      }
      await fsp.writeFile(path.join(bundleDir, 'package.json'), JSON.stringify(nodePkg, null, 2), 'utf8')
      // If there's a package-lock.json at project root, copy it into the bundle
      // so `npm ci` can be used by verification and CI for deterministic installs.
      try {
        const projectLock = path.join(process.cwd(), 'package-lock.json')
        if (fs.existsSync(projectLock)) {
          await copyRecursive(projectLock, path.join(bundleDir, 'package-lock.json'))
        }
      } catch (e) {
        // Non-fatal: just log and continue (lockfile optional)
        console.info('package-lock.json not copied (missing or failed to copy):', e && e.message)
      }
      // Copy static server template into bundle as server.js
      try {
        // Search for the server template in a few likely locations (project root,
        // __dirname parents, and upwards). If not found, fail the export so
        // bundles always contain a server that serves /data, /assets and the
        // presentation.
        function findUp(startDir, relPath, maxLevels = 8) {
          let cur = path.resolve(startDir)
          for (let i = 0; i < maxLevels; i++) {
            const cand = path.join(cur, relPath)
            try {
              if (fs.existsSync(cand)) return cand
            } catch (e) {}
            const parent = path.dirname(cur)
            if (parent === cur) break
            cur = parent
          }
          return null
        }

        const candidates = [
          path.join(process.cwd(), 'imports', 'templates', 'server-template.js'),
          path.join(__dirname, '..', 'imports', 'templates', 'server-template.js'),
          path.join(__dirname, '..', '..', 'imports', 'templates', 'server-template.js')
        ]

        let serverTemplate = null
        for (const c of candidates) {
          try { if (fs.existsSync(c)) { serverTemplate = c; break } } catch (e) {}
        }

        if (!serverTemplate) {
          serverTemplate = findUp(process.cwd(), path.join('imports', 'templates', 'server-template.js')) || findUp(__dirname, path.join('imports', 'templates', 'server-template.js'))
        }

        if (!serverTemplate) {
          throw new Error('server-template not found; ensure imports/templates/server-template.js exists in project')
        }

        await copyRecursive(serverTemplate, path.join(bundleDir, 'server.js'))
      } catch (e) {
        console.error('failed to write/copy server runner file', e && e.message ? e.message : String(e))
        throw new Meteor.Error('server-template-missing', 'Server template missing or could not be copied into bundle: ' + (e && e.message ? e.message : String(e)))
      }

      const readme = `This bundle contains a standalone Topogram presentation.\n\nTo run:\n\n1. Unzip the bundle\n2. cd ${bundleId}-${timestamp}\n3. npm install\n4. npm start\n\nThe presentation will be served on port 3000 by default.\n`
      await fsp.writeFile(path.join(bundleDir, 'README.md'), readme, 'utf8')
    } catch (e) {
      console.warn('failed to write node runner files', e && e.message)
    }

    // Create a zip file of the bundle using archiver
    const outName = `${bundleId}-${timestamp}.zip`
    const outPath = path.join(baseTemp, outName)
    try {
      const archiver = await import('archiver')
      const output = fs.createWriteStream(outPath)
      const archive = archiver.default('zip', { zlib: { level: 9 } })
      await new Promise((resolve, reject) => {
        output.on('close', resolve)
        archive.on('error', reject)
        archive.pipe(output)
        archive.directory(bundleDir, false)
        archive.finalize()
      })
    } catch (e) {
      console.error('packager error', e && e.stack ? e.stack : String(e))
      throw new Meteor.Error('packager-failed', e.message || String(e))
    }

    // Return a filename that the exports server will serve from /_exports/<filename>
    return { filename: outName }
  }
})

