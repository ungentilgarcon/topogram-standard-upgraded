import Papa from 'papaparse'

// Shared sample header used by the importer and exporters
export const sampleHeaderArr = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','extra']

// Sanitize CSV text by merging physical lines that belong to the same
// quoted record (i.e. odd number of quotes on the line). As a last resort
// we remove a trailing unmatched quote.
export function sanitizeCsvText(rawText) {
  try {
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
      buffer = buffer.replace(/"(?=[^\\"]*$)/, '')
      records.push(buffer)
    }
    return records.join('\n')
  } catch (e) {
    console.debug && console.debug('sanitizeCsvText failed', e)
    return rawText
  }
}

export async function parseCsvFile(file, { sanitize = true } = {}) {
  const text = await file.text()
  const input = sanitize ? sanitizeCsvText(text) : text
  const parsed = Papa.parse(input, { header: true, comments: '#', skipEmptyLines: true })
  return { header: parsed.meta && parsed.meta.fields ? parsed.meta.fields : sampleHeaderArr, rows: parsed.data || [], errors: parsed.errors || [] }
}

export async function parseJsonFile(file) {
  const txt = await file.text()
  const parsed = JSON.parse(txt)
  const headerArr = sampleHeaderArr
  const rows = []
  if (Array.isArray(parsed.nodes)) {
    parsed.nodes.forEach(n => {
      const obj = {}
      headerArr.forEach((h) => obj[h] = '')
      if (n.id != null) obj.id = String(n.id)
      if (n.name != null) obj.name = String(n.name)
      if (n.label != null) obj.label = String(n.label)
      if (n.description != null) obj.description = String(n.description)
      if (n.color != null) obj.color = String(n.color)
      if (n.fillColor != null) obj.fillColor = String(n.fillColor)
      if (n.weight != null) obj.weight = String(n.weight)
      if (n.rawWeight != null) obj.rawWeight = String(n.rawWeight)
      if (n.lat != null) obj.lat = String(n.lat)
      if (n.lng != null) obj.lng = String(n.lng)
      if (n.start != null) obj.start = String(n.start)
      if (n.end != null) obj.end = String(n.end)
      if (n.time != null) obj.time = String(n.time)
      if (n.date != null) obj.date = String(n.date)
      if (n.emoji != null) obj.emoji = String(n.emoji)
      if (n.extra != null) obj.extra = typeof n.extra === 'string' ? n.extra : JSON.stringify(n.extra)
      rows.push(obj)
    })
  }
  if (Array.isArray(parsed.edges)) {
    parsed.edges.forEach(e => {
      const obj = {}
      headerArr.forEach((h) => obj[h] = '')
      if (e.source != null) obj.source = String(e.source)
      if (e.target != null) obj.target = String(e.target)
      if (e.edgeLabel != null) obj.edgeLabel = String(e.edgeLabel)
      if (e.edgeColor != null) obj.edgeColor = String(e.edgeColor)
      if (e.edgeWeight != null) obj.edgeWeight = String(e.edgeWeight)
      if (e.relationship != null) obj.relationship = String(e.relationship)
      if (e.enlightement != null) obj.enlightement = String(e.enlightement)
      if (e.extra != null) obj.extra = typeof e.extra === 'string' ? e.extra : JSON.stringify(e.extra)
      rows.push(obj)
    })
  }
  return { header: headerArr, rows }
}

// Parse XLSX/ODS by converting the first worksheet to CSV then reusing PapaParse
export async function parseSpreadsheetFile(file, { sanitize = true } = {}) {
  // dynamic import of xlsx to avoid bundling cost when unused
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  const firstSheetName = wb.SheetNames && wb.SheetNames[0]
  if (!firstSheetName) return { header: sampleHeaderArr, rows: [], errors: [] }
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheetName])
  const input = sanitize ? sanitizeCsvText(csv) : csv
  const parsed = Papa.parse(input, { header: true, comments: '#', skipEmptyLines: true })
  return { header: parsed.meta && parsed.meta.fields ? parsed.meta.fields : sampleHeaderArr, rows: parsed.data || [], errors: parsed.errors || [] }
}

export async function parseFile(file) {
  const name = (file && file.name) ? file.name.toLowerCase() : ''
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsvFile(file)
  if (name.endsWith('.json')) return parseJsonFile(file)
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) return parseSpreadsheetFile(file)
  // fallback: attempt CSV parse
  return parseCsvFile(file)
}

export default { sanitizeCsvText, parseCsvFile, parseJsonFile, parseSpreadsheetFile, parseFile }
