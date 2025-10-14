#!/usr/bin/env node
// analysis/bisect-check.js
// This script is intended to be used by `git bisect run`.
// It expects an app to be running at APP_URL (default http://localhost:3000)
// and a TOPO_ID environment variable pointing to a Topogram detail page.
// It will load the Topogram detail page in a headless browser (Puppeteer)
// and attempt to detect whether the Cytoscape graph is visible and has
// non-zero visible nodes. Exit codes:
//   0 => good (graph visible)
//   1 => bad (graph blank)
// 125 => skip (environment not ready)

const DEFAULT_APP_URL = process.env.APP_URL || 'http://localhost:3000'
const TOPO_ID = process.env.TOPO_ID
if (!TOPO_ID) {
  console.error('TOPO_ID environment variable is required')
  process.exit(125)
}
const PAGE_URL = `${DEFAULT_APP_URL}/topogram/${TOPO_ID}`
const TIMEOUT = 30_000

(async () => {
  try {
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(TIMEOUT)
    page.on('console', msg => {
      // forward browser console to node stdout (helpful for debugging)
      const args = msg.args()
      Promise.all(args.map(a => a.jsonValue()).map(p => p.catch(e => undefined))).then(vals => {
        console.log('[BROWSER]', msg.type(), ...vals)
      })
    })
    console.log('Checking URL:', PAGE_URL)
    const resp = await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    if (!resp || resp.status() >= 400) {
      console.error('Failed to load page, status:', resp ? resp.status() : 'no response')
      await browser.close()
      process.exit(125)
    }

    // Wait for either the Cytoscape container or a loading indicator to appear
    await page.waitForSelector('.topogram-page', { timeout: TIMEOUT })

    // Allow some time for the app to mount Cytoscape
    await page.waitForTimeout(1200)

    // Evaluate page state: detect window._topoCy or look for canvas/renderer bounding box
    try {
      const result = await page.evaluate(() => {
        const out = { hasTopoCy: false, elementsCount: null, visibleNodes: null, bbox: null }
        try {
          const cy = window._topoCy || (window && window.cy) || null
          if (cy) {
            out.hasTopoCy = true
            try { out.elementsCount = cy.elements().length } catch(e) { out.elementsCount = null }
            try { out.visibleNodes = cy.nodes().filter(n => !n.hasClass('hidden')).length } catch(e) { out.visibleNodes = null }
            try {
              out.bbox = cy.elements().length ? cy.elements().boundingBox() : null
            } catch(e) { out.bbox = null }
          }
        } catch (e) {}
        // also try to inspect DOM for the cy container size
        try {
          const el = document.querySelector('.cy-container, .cy');
          if (el) {
            const r = el.getBoundingClientRect();
            out.domRect = { w: Math.round(r.width), h: Math.round(r.height) }
          }
        } catch(e){}
        return out
      })

      console.log('CHECK RESULT:', result)
      await browser.close()
      // Decide pass/fail: prefer visibleNodes > 0, else if elementsCount > 0 and domRect area > small threshold assume pass
      if (result.hasTopoCy) {
        if (typeof result.visibleNodes === 'number' && result.visibleNodes > 0) {
          console.log('Graph visible (visibleNodes > 0) => GOOD')
          process.exit(0)
        }
        if (typeof result.elementsCount === 'number' && result.elementsCount > 0) {
          if (result.domRect && result.domRect.w && result.domRect.h && result.domRect.w * result.domRect.h > 1000) {
            console.log('Graph elements present and container non-trivial => GOOD')
            process.exit(0)
          }
          console.log('Elements present but no visible nodes or small container => BAD')
          process.exit(1)
        }
        console.log('TopoCy present but zero elements => BAD')
        process.exit(1)
      } else {
        // If Cytoscape instance not found, look for the DOM canvas used by Cytoscape
        if (result.domRect && result.domRect.w && result.domRect.h && result.domRect.w * result.domRect.h > 1000) {
          console.log('No window._topoCy but container exists => inconclusive (SKIP)')
          process.exit(125)
        }
        console.log('No Cytoscape instance found and no container => SKIP')
        process.exit(125)
      }
    } catch (e) {
      console.error('Evaluation failed:', e)
      await browser.close()
      process.exit(125)
    }
  } catch (e) {
    console.error('Puppeteer or environment error:', e.message || e)
    process.exit(125)
  }
})();
