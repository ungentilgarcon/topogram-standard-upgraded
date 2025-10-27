const fs = require('fs')
const path = require('path')
const Papa = require('papaparse')

function testCsv(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8')
  const parsed = Papa.parse(txt, { header: true, comments: '#', skipEmptyLines: true })
  console.log('CSV parse for', path.basename(filePath))
  console.log('rows:', parsed.data.length, 'errors:', parsed.errors.length)
  if (parsed.errors.length) console.log(parsed.errors.slice(0,5))
}

function testJson(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8')
  try {
    const parsed = JSON.parse(txt)
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes.length : 0
    const edges = Array.isArray(parsed.edges) ? parsed.edges.length : 0
    console.log('JSON parse for', path.basename(filePath), 'nodes:', nodes, 'edges:', edges)
  } catch (e) {
    console.error('JSON parse failed for', filePath, e.message)
  }
}

const samplesDir = path.join(__dirname, '..', 'samples')
testCsv(path.join(samplesDir, 'dependency_graph_mapappbuilder.csv'))
testCsv(path.join(samplesDir, 'dependency_graph_main.csv'))
testCsv(path.join(samplesDir, 'topogram-sample.csv'))
testJson(path.join(samplesDir, 'dependency_graph_topogram.json'))
testCsv(path.join(samplesDir, 'dependency_graph_topogram_code_1000.csv'))
testJson(path.join(samplesDir, 'dependency_graph_topogram_code_1000.json'))

console.log('quick_parse_test finished')
