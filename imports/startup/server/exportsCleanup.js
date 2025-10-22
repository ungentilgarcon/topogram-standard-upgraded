import fs from 'fs'
import path from 'path'
import os from 'os'

// Cleanup configuration
const EXPORTS_DIR = path.join(os.tmpdir(), 'topogram-exports')
const DEFAULT_MAX_AGE_MS = (6 * 60 * 60 * 1000) // 6 hours
const CLEANUP_INTERVAL_MS = (30 * 60 * 1000) // run every 30 minutes

function removeIfOld(filePath, maxAgeMs) {
  try {
    const stat = fs.statSync(filePath)
    const age = Date.now() - stat.mtimeMs
    if (age > maxAgeMs) {
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(filePath)
      }
      return true
    }
  } catch (e) {
    // ignore
  }
  return false
}

function runCleanupOnce(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  try {
    if (!fs.existsSync(EXPORTS_DIR)) return
    const entries = fs.readdirSync(EXPORTS_DIR)
    for (const e of entries) {
      const p = path.join(EXPORTS_DIR, e)
      try {
        const removed = removeIfOld(p, maxAgeMs)
        if (removed) console.log('exportsCleanup: removed', p)
      } catch (err) {
        console.warn('exportsCleanup: error removing', p, err && err.message)
      }
    }
  } catch (e) {
    console.warn('exportsCleanup: failed to scan exports dir', e && e.message)
  }
}

// Start periodic cleanup
try {
  runCleanupOnce()
  setInterval(() => runCleanupOnce(), CLEANUP_INTERVAL_MS)
  console.log('exportsCleanup: started, dir=', EXPORTS_DIR)
} catch (e) {
  console.warn('exportsCleanup: failed to start', e && e.message)
}

export { runCleanupOnce }
