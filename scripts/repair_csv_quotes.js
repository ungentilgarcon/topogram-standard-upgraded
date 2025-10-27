const fs = require('fs')
const path = require('path')
const Papa = require('papaparse')

const samplesDir = path.join(__dirname, '..', 'samples')
const files = fs.readdirSync(samplesDir).filter(f => f.toLowerCase().endsWith('.csv'))

function sanitizeCsvText(rawText) {
  const nl = rawText.split(/\r\n|\n|\r/)
  const records = []
  let buffer = ''
  const quoteCount = (s) => (s.match(/"/g) || []).length
  for (let i = 0; i < nl.length; i++) {
    const line = nl[i]
    if (buffer.length === 0) buffer = line
    else buffer = buffer + '\n' + line
    if ((quoteCount(buffer) % 2) === 0) {
      records.push(buffer)
      buffer = ''
    } else {
      continue
    }
  }
  if (buffer && buffer.length) {
    // remove last unmatched quote
    buffer = buffer.replace(/"(?=[^\\"]*$)/, '')
    records.push(buffer)
  }
  return records.join('\n')
}

files.forEach(fname => {
  const filePath = path.join(samplesDir, fname)
  let raw = fs.readFileSync(filePath, 'utf8')
  // preserve initial comment lines (# ...)
  const lines = raw.split(/\r\n|\n|\r/)
  const commentLines = []
  let bodyStart = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#')) { commentLines.push(lines[i]); bodyStart = i + 1; } else break
  }
  const body = lines.slice(bodyStart).join('\n')
  const sanitized = sanitizeCsvText(body)
  // After sanitization we prefer to write the sanitized text back directly
  // This avoids reserialization that may insert newlines inside quoted fields.
  const final = (commentLines.length ? commentLines.join('\n') + '\n' : '') + sanitized + '\n'
  // Quick validation: try parsing the final text; if still errors, log them but still write
  const validated = Papa.parse(final.split(/\r\n|\n|\r/).slice(commentLines.length).join('\n'), { header: true, comments: '#', skipEmptyLines: true })
  if (validated.errors && validated.errors.length) {
    console.log('Repair: parsing still has errors for', fname, validated.errors.slice(0,3))
  }
  fs.writeFileSync(filePath, final, 'utf8')
  console.log('Rewrote (sanitized) ', fname)
})

console.log('repair_csv_quotes done')
