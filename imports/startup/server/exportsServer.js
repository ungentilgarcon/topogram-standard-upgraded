import express from 'express'
import path from 'path'
import fs from 'fs'
import { Meteor } from 'meteor/meteor'
import { WebApp } from 'meteor/webapp'

// Serve exported bundles from OS temp dir (where exportMethods writes them)
export function registerExportsRoute(app) {
  const baseTemp = path.join(require('os').tmpdir(), 'topogram-exports')
  app.get('/_exports/:file', (req, res) => {
    const file = req.params.file
    const safe = file.replace(/[^a-zA-Z0-9-_.]/g, '')
    const p = path.join(baseTemp, safe)
    if (!fs.existsSync(p)) return res.status(404).send('Not found')
    res.download(p, safe)
  })
}

// Auto-register a direct connect-style handler with Meteor's WebApp so
// requests to /_exports/* are served before the SPA fallback. Keep the
// explicit registerExportsRoute exported for tests or alternative wiring.
try {
  const baseTemp = path.join(require('os').tmpdir(), 'topogram-exports')
  WebApp.connectHandlers.use((req, res, next) => {
    // Only handle our export URL space
    if (!req.url || !req.url.startsWith('/_exports/')) return next()

    // Extract filename from URL (/ _exports/<file>) and sanitize
    const parts = req.url.split('/')
    const file = parts.slice(2).join('/') // allow filenames containing '/'
    const safe = file.replace(/[^a-zA-Z0-9-_.]/g, '')
    const p = path.join(baseTemp, safe)

    if (!fs.existsSync(p)) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Not found')
      return
    }

    try {
      const stat = fs.statSync(p)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"`)
      res.setHeader('Content-Length', String(stat.size))
      const stream = fs.createReadStream(p)
      stream.on('error', (err) => {
        console.error('Error streaming export file', err && err.stack ? err.stack : String(err))
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Internal error')
      })
      stream.pipe(res)
    } catch (e) {
      console.error('Failed to serve export file', e && e.stack ? e.stack : String(e))
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Internal error')
    }
  })
} catch (e) {
  // Avoid crashing the server if mounting fails; log the error for debugging
  console.error('Failed to mount exports connect handler', e && e.stack ? e.stack : String(e))
}
