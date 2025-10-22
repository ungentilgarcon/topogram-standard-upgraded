// Minimal static server for exported Topogram presentation (template)
const express = require('express')
const path = require('path')
const fs = require('fs')
const app = express()
const port = process.env.PORT || 3000

// In the exported bundle, server.js will live at the bundle root. Use
// bundle-root-relative paths so we serve the expected directories.
try {
  const presDir = path.join(__dirname, 'presentation')
  const indexPath = path.join(presDir, 'index.html')
  const tplPath = path.join(presDir, 'index.html.tpl')
  if (!fs.existsSync(indexPath) && fs.existsSync(tplPath)) {
    try {
      const tpl = fs.readFileSync(tplPath, 'utf8')
      let title = 'Topogram'
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))
        title = (cfg && cfg.title) || (cfg && cfg.topogram && cfg.topogram.title) || title
      } catch (e) {
        // ignore
      }
      const rendered = '<!doctype html>\\n' + tpl.replace(/{{TITLE}}/g, title)
      fs.writeFileSync(indexPath, rendered, 'utf8')
      console.log('Materialized index.html from index.html.tpl')
    } catch (e) {
      console.warn('Failed to materialize index.html from template', e && e.message)
    }
  }
} catch (e) {
  console.warn('Presentation index materialization error', e && e.message)
}

// Serve data, assets and presentation from bundle root
app.use('/data', express.static(path.join(__dirname, 'data')))
app.use('/assets', express.static(path.join(__dirname, 'assets')))
app.use('/', express.static(path.join(__dirname, 'presentation')))
app.get('/config.json', (req, res) => res.sendFile(path.join(__dirname, 'config.json')))
app.get('/health', (req, res) => res.send('OK'))
app.listen(port, () => console.log('Topogram presentation server listening on', port))
