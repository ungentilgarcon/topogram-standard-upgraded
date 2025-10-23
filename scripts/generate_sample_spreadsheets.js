#!/usr/bin/env node
/*
Generate sample XLSX and ODS spreadsheets for Topogram imports.
- Creates two workbooks:
  1) Nodes+Edges (two sheets)
  2) Single-sheet Mixed (nodes first then edges)
- Writes .xlsx files directly.
- Attempts to write .ods (bookType:'ods') if supported by the xlsx lib; if not, tries LibreOffice/soffice conversion.

Outputs in ./samples/
*/

const fs = require('fs')
const path = require('path')
const child_process = require('child_process')
const XLSX = require('xlsx')

const outDir = path.join(__dirname, '..', 'samples')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

function makeNodes() {
  return [
    { id: '1', name: 'Alice', label: 'Alice A', color: '#ff5722', emoji: '🎸', weight: 10 },
    { id: '2', name: 'Bob', label: 'Bob B', color: '#3f51b5', emoji: '🎤', weight: 5 },
    { id: '3', name: 'Carol', label: 'Carol C', color: '#2e7d32', emoji: '🎷', weight: 8 },
  ]
}

function makeEdges() {
  return [
    { source: '1', target: '2', name: 'friendship', relationship: 'friendship', edgeColor: '#9c27b0', edgeWeight: 2, enlightement: 'arrow' },
    { source: '2', target: '3', name: 'collab', relationship: 'collab', edgeColor: '#607d8b', edgeWeight: 1 },
    { source: '3', target: '1', name: 'support', relationship: 'support', edgeColor: '#ff9800', edgeWeight: 3, enlightement: 'arrow' },
  ]
}

function writeWorkbookPair(baseName) {
  const wb = XLSX.utils.book_new()
  const wsNodes = XLSX.utils.json_to_sheet(makeNodes(), { skipHeader: false })
  const wsEdges = XLSX.utils.json_to_sheet(makeEdges(), { skipHeader: false })
  XLSX.utils.book_append_sheet(wb, wsNodes, 'Nodes')
  XLSX.utils.book_append_sheet(wb, wsEdges, 'Edges')
  const xlsxPath = path.join(outDir, baseName + '.topogram.xlsx')
  XLSX.writeFile(wb, xlsxPath, { bookType: 'xlsx' })
  let odsPath = path.join(outDir, baseName + '.topogram.ods')
  try {
    XLSX.writeFile(wb, odsPath, { bookType: 'ods' })
    console.log('Wrote ODS directly:', path.relative(process.cwd(), odsPath))
  } catch (e) {
    odsPath = tryLibreOfficeConvert(xlsxPath, 'ods') || odsPath
  }
  console.log('Wrote XLSX:', path.relative(process.cwd(), xlsxPath))
}

function writeWorkbookSingle(baseName) {
  const rows = [...makeNodes(), ...makeEdges()]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false })
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const xlsxPath = path.join(outDir, baseName + '.topogram.xlsx')
  XLSX.writeFile(wb, xlsxPath, { bookType: 'xlsx' })
  let odsPath = path.join(outDir, baseName + '.topogram.ods')
  try {
    XLSX.writeFile(wb, odsPath, { bookType: 'ods' })
    console.log('Wrote ODS directly:', path.relative(process.cwd(), odsPath))
  } catch (e) {
    odsPath = tryLibreOfficeConvert(xlsxPath, 'ods') || odsPath
  }
  console.log('Wrote XLSX:', path.relative(process.cwd(), xlsxPath))
}

function tryLibreOfficeConvert(srcPath, targetExt) {
  // Try 'soffice' or 'libreoffice' headless conversion as a fallback
  const candidates = ['soffice', 'libreoffice']
  for (const bin of candidates) {
    try {
      const which = child_process.spawnSync('which', [bin], { encoding: 'utf8' })
      if (which.status !== 0) continue
      console.log(`Attempting ${bin} conversion to ${targetExt} ...`)
      const res = child_process.spawnSync(bin, ['--headless', '--convert-to', targetExt, '--outdir', outDir, srcPath], { encoding: 'utf8' })
      if (res.status === 0) {
        const out = path.join(outDir, path.basename(srcPath).replace(/\.xlsx$/i, '.' + targetExt))
        if (fs.existsSync(out)) {
          console.log(`Converted via ${bin}:`, path.relative(process.cwd(), out))
          return out
        }
      } else {
        console.warn(`${bin} failed:`, res.stderr || res.stdout)
      }
    } catch (e) {
      // ignore and try next
    }
  }
  console.warn('Could not generate ODS (no direct support and no LibreOffice found).')
  return null
}

writeWorkbookPair('sample_nodes_edges')
writeWorkbookSingle('sample_single_sheet')
console.log('Done.')
