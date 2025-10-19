import express from 'express'
import path from 'path'
import fs from 'fs'
import { Meteor } from 'meteor/meteor'

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
