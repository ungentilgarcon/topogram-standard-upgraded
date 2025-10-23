#!/usr/bin/env node
/*
Generate layered "Global Supply Chain Graph of Everything" sample CSVs for Topogram.
Outputs to samples/topograms/flowofevrything/ as multiple .topogram.csv files:
- trade_flows.topogram.csv
- company_chains.topogram.csv
- logistics_routes.topogram.csv
- material_flows.topogram.csv
- esg_impacts.topogram.csv (nodes with ESG fields; a few edges for impact links)
- combined_all_layers.topogram.csv (union view with a `layer` field)

Each CSV follows the header used by Topogram import with nodes (no source/target)
followed by edges (with source/target and enlightement=arrow).
*/

const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'samples', 'topograms', 'flowofevrything')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const H = [
  'id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','start','end','time','date','source','target','edgeLabel','edgeColor','edgeWeight','relationship','enlightement','emoji','extra'
]

function csvLine(arr) {
  return arr.map(v => {
    if (v === null || typeof v === 'undefined') return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }).join(',')
}

function writeCSV(file, rows) {
  const text = ['# Topogram Sample', H.join(',')].concat(rows.map(csvLine)).join('\n') + '\n'
  fs.writeFileSync(path.join(OUT_DIR, file), text, 'utf8')
}

// Helpers to build properly aligned rows
function blankRow() {
  return new Array(H.length).fill('')
}

function nodeRow({ id, name, label, description, color, fillColor, weight = 1, rawWeight = 1, lat = '', lng = '', emoji = '' }) {
  const r = blankRow()
  r[0] = id
  r[1] = name
  r[2] = label || name
  r[3] = description || ''
  r[4] = color
  r[5] = fillColor
  r[6] = weight
  r[7] = rawWeight
  r[8] = lat
  r[9] = lng
  r[21] = emoji || ''
  return r
}

function edgeRow({ start = '', end = '', time = '', date = '', source, target, edgeLabel = '', edgeColor = '#999', edgeWeight = 1, relationship = '', enlightement = 'arrow' }) {
  const r = blankRow()
  r[10] = start
  r[11] = end
  r[12] = time
  r[13] = date || start
  r[14] = source
  r[15] = target
  r[16] = edgeLabel
  r[17] = edgeColor
  r[18] = edgeWeight
  r[19] = relationship || edgeLabel
  r[20] = enlightement
  return r
}

// Helpers for time periods
function getLastNYears(n) {
  const current = new Date().getFullYear()
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(current - i)
  return out
}
function quartersForYears(years) {
  const q = []
  years.forEach(y => {
    q.push([`${y}-01-01`, `${y}-03-31`, `${y}Q1`])
    q.push([`${y}-04-01`, `${y}-06-30`, `${y}Q2`])
    q.push([`${y}-07-01`, `${y}-09-30`, `${y}Q3`])
    q.push([`${y}-10-01`, `${y}-12-31`, `${y}Q4`])
  })
  return q
}
function monthsForYears(years) {
  const m = []
  years.forEach(y => {
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0')
      const lastDay = new Date(y, month, 0).getDate()
      m.push([`${y}-${mm}-01`, `${y}-${mm}-${String(lastDay).padStart(2, '0')}`, `${y}-${mm}`])
    }
  })
  return m
}

// Expanded country catalog (capital coords approximated)
const countries = [
  { id: 'cn', name: 'China', lat: 39.9042, lng: 116.4074 },
  { id: 'us', name: 'United States', lat: 38.9072, lng: -77.0369 },
  { id: 'jp', name: 'Japan', lat: 35.6762, lng: 139.6503 },
  { id: 'kr', name: 'South Korea', lat: 37.5665, lng: 126.9780 },
  { id: 'tw', name: 'Taiwan', lat: 25.0330, lng: 121.5654 },
  { id: 'vn', name: 'Vietnam', lat: 21.0278, lng: 105.8342 },
  { id: 'th', name: 'Thailand', lat: 13.7563, lng: 100.5018 },
  { id: 'my', name: 'Malaysia', lat: 3.1390, lng: 101.6869 },
  { id: 'sg', name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { id: 'id', name: 'Indonesia', lat: -6.2088, lng: 106.8456 },
  { id: 'in', name: 'India', lat: 28.6139, lng: 77.2090 },
  { id: 'mx', name: 'Mexico', lat: 19.4326, lng: -99.1332 },
  { id: 'de', name: 'Germany', lat: 52.5200, lng: 13.4050 },
  { id: 'fr', name: 'France', lat: 48.8566, lng: 2.3522 },
  { id: 'gb', name: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
  { id: 'nl', name: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { id: 'be', name: 'Belgium', lat: 50.8503, lng: 4.3517 },
  { id: 'es', name: 'Spain', lat: 40.4168, lng: -3.7038 },
  { id: 'it', name: 'Italy', lat: 41.9028, lng: 12.4964 },
  { id: 'pl', name: 'Poland', lat: 52.2297, lng: 21.0122 },
  { id: 'tr', name: 'Türkiye', lat: 39.9334, lng: 32.8597 },
  { id: 'ae', name: 'United Arab Emirates', lat: 24.4539, lng: 54.3773 },
  { id: 'br', name: 'Brazil', lat: -15.7939, lng: -47.8828 },
  { id: 'cl', name: 'Chile', lat: -33.4489, lng: -70.6693 },
  { id: 'za', name: 'South Africa', lat: -25.7479, lng: 28.2293 },
  { id: 'au', name: 'Australia', lat: -35.2809, lng: 149.1300 },
  { id: 'ca', name: 'Canada', lat: 45.4215, lng: -75.6972 },
]

const ports = [
  { id: 'port-shanghai', name: 'Port of Shanghai', lat: 31.2304, lng: 121.4737, country: 'cn' },
  { id: 'port-ningbo', name: 'Port of Ningbo-Zhoushan', lat: 29.8782, lng: 121.5495, country: 'cn' },
  { id: 'port-shenzhen', name: 'Port of Shenzhen (Yantian)', lat: 22.561, lng: 114.278, country: 'cn' },
  { id: 'port-guangzhou', name: 'Port of Guangzhou', lat: 23.1103, lng: 113.2644, country: 'cn' },
  { id: 'port-qingdao', name: 'Port of Qingdao', lat: 36.0662, lng: 120.3826, country: 'cn' },
  { id: 'port-tianjin', name: 'Port of Tianjin', lat: 39.3434, lng: 117.3616, country: 'cn' },
  { id: 'port-hk', name: 'Port of Hong Kong', lat: 22.308, lng: 114.161, country: 'cn' },
  { id: 'port-singapore', name: 'Port of Singapore', lat: 1.264, lng: 103.840, country: 'sg' },
  { id: 'port-busan', name: 'Port of Busan', lat: 35.1028, lng: 129.0403, country: 'kr' },
  { id: 'port-yokohama', name: 'Port of Yokohama', lat: 35.4437, lng: 139.6380, country: 'jp' },
  { id: 'port-rotterdam', name: 'Port of Rotterdam', lat: 51.951, lng: 4.142, country: 'nl' },
  { id: 'port-antwerp', name: 'Port of Antwerp', lat: 51.263, lng: 4.399, country: 'be' },
  { id: 'port-hamburg', name: 'Port of Hamburg', lat: 53.5461, lng: 9.9665, country: 'de' },
  { id: 'port-algeciras', name: 'Port of Algeciras', lat: 36.1333, lng: -5.4500, country: 'es' },
  { id: 'port-nynj', name: 'Port of New York/New Jersey', lat: 40.6681, lng: -74.0451, country: 'us' },
  { id: 'port-la', name: 'Port of Los Angeles', lat: 33.740, lng: -118.271, country: 'us' },
  { id: 'port-longbeach', name: 'Port of Long Beach', lat: 33.7676, lng: -118.1997, country: 'us' },
  { id: 'port-savannah', name: 'Port of Savannah', lat: 32.0823, lng: -81.0998, country: 'us' },
  { id: 'port-jebelali', name: 'Port of Jebel Ali (Dubai)', lat: 25.0126, lng: 55.0615, country: 'ae' },
]

// Companies with multiple facilities (granular lat/lng)
const companies = [
  { id: 'tsmc', name: 'TSMC', type: 'Semiconductor Fab', facilities: [
    { id: 'hsinchu', country: 'tw', lat: 24.813, lng: 120.967, label: 'Hsinchu' },
    { id: 'tainan', country: 'tw', lat: 22.999, lng: 120.226, label: 'Tainan' },
    { id: 'taichung', country: 'tw', lat: 24.147, lng: 120.673, label: 'Taichung' },
    { id: 'phoenix', country: 'us', lat: 33.4484, lng: -112.0740, label: 'Phoenix' },
    { id: 'kumamoto', country: 'jp', lat: 32.8031, lng: 130.7079, label: 'Kumamoto' },
  ]},
  { id: 'foxconn', name: 'Foxconn', type: 'EMS/Assembly', facilities: [
    { id: 'shenzhen', country: 'cn', lat: 22.756, lng: 114.064, label: 'Shenzhen' },
    { id: 'zhengzhou', country: 'cn', lat: 34.7466, lng: 113.6254, label: 'Zhengzhou' },
    { id: 'chennai', country: 'in', lat: 13.0827, lng: 80.2707, label: 'Chennai' },
    { id: 'guanajuato', country: 'mx', lat: 21.0190, lng: -101.2574, label: 'Guanajuato' },
  ]},
  { id: 'samsung', name: 'Samsung Electronics', type: 'Semiconductor + OEM', facilities: [
    { id: 'suwon', country: 'kr', lat: 37.263, lng: 127.028, label: 'Suwon' },
    { id: 'hwaseong', country: 'kr', lat: 37.199, lng: 127.028, label: 'Hwaseong' },
    { id: 'pyeongtaek', country: 'kr', lat: 36.992, lng: 127.113, label: 'Pyeongtaek' },
  ]},
  { id: 'lgchem', name: 'LG Chem', type: 'Battery', facilities: [
    { id: 'ochang', country: 'kr', lat: 36.7133, lng: 127.4897, label: 'Ochang' },
    { id: 'nanjing', country: 'cn', lat: 32.0603, lng: 118.7969, label: 'Nanjing' },
  ]},
  { id: 'catl', name: 'CATL', type: 'Battery', facilities: [
    { id: 'ningde', country: 'cn', lat: 26.6617, lng: 119.5220, label: 'Ningde' },
    { id: 'yibin', country: 'cn', lat: 28.7517, lng: 104.6417, label: 'Yibin' },
  ]},
  { id: 'byd', name: 'BYD', type: 'Battery + OEM', facilities: [
    { id: 'shenzhen', country: 'cn', lat: 22.555, lng: 113.883, label: 'Shenzhen' },
    { id: 'xian', country: 'cn', lat: 34.3416, lng: 108.9398, label: 'Xi\'an' },
  ]},
  { id: 'apple', name: 'Apple', type: 'OEM', facilities: [
    { id: 'cupertino', country: 'us', lat: 37.3349, lng: -122.009, label: 'Cupertino' },
  ]},
  { id: 'xiaomi', name: 'Xiaomi', type: 'OEM', facilities: [
    { id: 'beijing', country: 'cn', lat: 39.983, lng: 116.312, label: 'Beijing' },
  ]},
  { id: 'sony', name: 'Sony', type: 'OEM', facilities: [
    { id: 'tokyo', country: 'jp', lat: 35.6895, lng: 139.6917, label: 'Tokyo' },
  ]},
]

const materials = [
  { id: 'lithium', name: 'Lithium', from: 'cl' },
  { id: 'cobalt', name: 'Cobalt', from: 'za' },
  { id: 'nickel', name: 'Nickel', from: 'id' },
  { id: 'silicon', name: 'Silicon', from: 'cn' },
]

function colorFor(type) {
  switch (type) {
    case 'country': return ['#607d8b','#cfd8dc']
    case 'port': return ['#2196f3','#bbdefb']
    case 'company': return ['#4caf50','#c8e6c9']
    case 'material': return ['#ff9800','#ffe0b2']
    case 'product': return ['#9c27b0','#e1bee7']
    default: return ['#616161','#eeeeee']
  }
}

// Row helpers using rows push
function addNode(rows, params) { rows.push(nodeRow(params)) }
function addEdge(rows, params) { rows.push(edgeRow(params)) }

function buildTradeFlows() {
  const rows = []
  const [color, fill] = colorFor('country')
  countries.forEach(c => {
    addNode(rows, { id: `country-${c.id}`, name: c.name, label: c.name, description: 'Country (trade node)', color, fillColor: fill, weight: 1, rawWeight: 1, lat: c.lat, lng: c.lng })
  })
  const commodities = ['HS-8507 Batteries','HS-8517 Smartphones','HS-8542 Integrated Circuits','HS-8528 Displays']
  const years = getLastNYears(7)
  const pairs = [
    ['cn','us'],['cn','de'],['kr','us'],['tw','cn'],['tw','us'],['jp','us'],['sg','us'],['cn','in'],['vn','us'],['mx','us'],
    ['cn','gb'],['cn','nl'],['cn','fr'],['cn','it'],['cn','es']
  ]
  function randBetween(a,b){ return Math.round(a + Math.random()*(b-a)) }
  pairs.forEach(([src,dst]) => {
    commodities.forEach((comm,i) => {
      years.forEach(y => {
        const v = randBetween(200, 1200) * (i+1)
        const label = `${comm} ${y}`
        addEdge(rows, { start: `${y}-01-01`, end: `${y}-12-31`, time: String(y), date: `${y}-01-01`, source: `country-${src}`, target: `country-${dst}`, edgeLabel: label, edgeColor: '#3f51b5', edgeWeight: v, relationship: label })
      })
    })
  })
  return rows
}

function buildCompanyChains() {
  const rows = []
  const [color, fill] = colorFor('company')
  companies.forEach(co => {
    co.facilities.forEach(f => {
      addNode(rows, { id: `co-${co.id}-${f.id}`, name: `${co.name} ${f.label}`, label: co.type, description: `${co.type} (${co.name})`, color, fillColor: fill, weight: 5, rawWeight: 5, lat: f.lat, lng: f.lng, emoji: '🏭' })
    })
  })
  const relations = [
    ['co-tsmc-hsinchu','co-foxconn-zhengzhou','SoC supply'],
    ['co-tsmc-tainan','co-foxconn-shenzhen','SoC supply'],
    ['co-tsmc-taichung','co-xiaomi-beijing','SoC supply'],
    ['co-samsung-hwaseong','co-foxconn-zhengzhou','Display supply'],
    ['co-samsung-pyeongtaek','co-apple-cupertino','Display coordination'],
    ['co-lgchem-ochang','co-foxconn-zhengzhou','Battery cells'],
    ['co-catl-ningde','co-foxconn-zhengzhou','Battery cells'],
    ['co-byd-xian','co-xiaomi-beijing','Battery pack'],
  ]
  const q = quartersForYears(getLastNYears(7))
  function w(base){ return Math.round(base * (0.8 + Math.random()*0.4)) }
  relations.forEach(([s,t,label]) => {
    q.forEach(([start,end,qq]) => {
      addEdge(rows, { start, end, time: qq, date: start, source: s, target: t, edgeLabel: label, edgeColor: '#009688', edgeWeight: w(50), relationship: label })
    })
  })
  return rows
}

function buildLogistics() {
  const rows = []
  const [color, fill] = colorFor('port')
  ports.forEach(p => {
    addNode(rows, { id: p.id, name: p.name, label: p.name, description: 'Seaport', color, fillColor: fill, weight: 3, rawWeight: 3, lat: p.lat, lng: p.lng, emoji: '🛳️' })
  })
  const factoryToPort = [
    ['co-foxconn-shenzhen','port-shenzhen','export electronics'],
    ['co-foxconn-zhengzhou','port-shanghai','export electronics'],
    ['co-samsung-pyeongtaek','port-busan','export components'],
    ['co-tsmc-kumamoto','port-yokohama','export wafers'],
  ]
  const portLanes = [
    ['port-shenzhen','port-la','transpacific lane'],
    ['port-shanghai','port-longbeach','transpacific lane'],
    ['port-busan','port-la','transpacific lane'],
    ['port-yokohama','port-nynj','transpacific lane'],
    ['port-singapore','port-rotterdam','asia-europe lane'],
    ['port-ningbo','port-antwerp','asia-europe lane'],
    ['port-jebelali','port-rotterdam','middle-east-europe lane'],
  ]
  const months = monthsForYears(getLastNYears(7))
  function wm(base){ return Math.round(base * (0.7 + Math.random()*0.6)) }
  factoryToPort.forEach(([s,t,label]) => {
    months.forEach(([start,end,m]) => {
      addEdge(rows, { start, end, time: m, date: start, source: s, target: t, edgeLabel: label, edgeColor: '#2196f3', edgeWeight: wm(120), relationship: label })
    })
  })
  portLanes.forEach(([s,t,label]) => {
    months.forEach(([start,end,m]) => {
      addEdge(rows, { start, end, time: m, date: start, source: s, target: t, edgeLabel: label, edgeColor: '#3f51b5', edgeWeight: wm(300), relationship: label })
    })
  })
  return rows
}

function buildMaterialFlows() {
  const rows = []
  const [matColor, matFill] = colorFor('material')
  materials.forEach(m => {
    const c = countries.find(cc => cc.id === m.from) || countries[0]
    addNode(rows, { id: `mat-${m.id}`, name: m.name, label: m.name, description: `Raw material (${m.name})`, color: matColor, fillColor: matFill, weight: 2, rawWeight: 2, lat: c.lat, lng: c.lng, emoji: '⛏️' })
  })
  const [prodColor, prodFill] = colorFor('product')
  const transformations = [
    { id: 'chem-refine', name: 'Chemical Refining' },
    { id: 'battery-cell', name: 'Battery Cell' },
    { id: 'battery-pack', name: 'Battery Pack' },
    { id: 'smartphone', name: 'Smartphone' },
  ]
  transformations.forEach(t => {
    addNode(rows, { id: `proc-${t.id}`, name: t.name, label: t.name, description: 'Process/Product stage', color: prodColor, fillColor: prodFill, weight: 2, rawWeight: 2, lat: 0, lng: 0 })
  })
  const chain = [
    ['mat-lithium','proc-chem-refine','refining'],
    ['mat-cobalt','proc-chem-refine','refining'],
    ['mat-nickel','proc-chem-refine','refining'],
    ['proc-chem-refine','proc-battery-cell','cell manufacturing'],
    ['proc-battery-cell','proc-battery-pack','pack assembly'],
    ['proc-battery-pack','proc-smartphone','final assembly'],
  ]
  const years = getLastNYears(7)
  chain.forEach(([s,t,label]) => {
    years.forEach(y => {
      addEdge(rows, { start: `${y}-01-01`, end: `${y}-12-31`, time: String(y), date: `${y}-01-01`, source: s, target: t, edgeLabel: label, edgeColor: '#795548', edgeWeight: 50, relationship: label })
    })
  })
  return rows
}

function buildESGImpacts() {
  const rows = []
  addNode(rows, { id: 'esg-co2', name: 'CO2e Impact', label: 'CO2e', description: 'Aggregated emissions impact hub', color: '#9e9e9e', fillColor: '#eeeeee', weight: 1, rawWeight: 1, lat: 0, lng: 0 })
  const picks = ['foxconn','tsmc','samsung','lgchem','catl','byd']
  const years = getLastNYears(7)
  picks.forEach(id => {
    const co = companies.find(c => c.id === id)
    const [color, fill] = colorFor('company')
    const f = co.facilities[0]
    addNode(rows, { id: `esg-${id}`, name: `${co.name} ESG`, label: co.type, description: `ESG overlay for ${co.name}`, color, fillColor: fill, weight: 5, rawWeight: 5, lat: f.lat, lng: f.lng })
    years.forEach(y => {
      addEdge(rows, { start: `${y}-01-01`, end: `${y}-12-31`, time: String(y), date: `${y}-01-01`, source: `esg-${id}`, target: 'esg-co2', edgeLabel: 'annual CO2e (kt)', edgeColor: '#f44336', edgeWeight: Math.round(100 + Math.random()*400), relationship: 'CO2e' })
    })
  })
  return rows
}

function padRows(rows) {
  return rows.map(r => {
    const a = Array.isArray(r) ? r.slice() : []
    while (a.length < H.length) a.push('')
    return a
  })
}

function main() {
  const files = [
    ['trade_flows.topogram.csv', buildTradeFlows()],
    ['company_chains.topogram.csv', buildCompanyChains()],
    ['logistics_routes.topogram.csv', buildLogistics()],
    ['material_flows.topogram.csv', buildMaterialFlows()],
    ['esg_impacts.topogram.csv', buildESGImpacts()],
  ]
  let combined = []
  files.forEach(([name, rows]) => {
    const layer = name.replace('.topogram.csv','')
    combined = combined.concat(rows.map(r => {
      const a = Array.isArray(r) ? r.slice() : []
      while (a.length < H.length) a.push('')
      a[H.indexOf('extra')] = (a[H.indexOf('extra')] ? a[H.indexOf('extra')] + ';' : '') + `layer=${layer}`
      return a
    }))
  })
  files.forEach(([name, rows]) => writeCSV(name, padRows(rows)))
  writeCSV('combined_all_layers.topogram.csv', padRows(combined))
  console.log('Generated layered CSVs in', path.relative(process.cwd(), OUT_DIR))
}

main()
    const years = getLastNYears(7)
