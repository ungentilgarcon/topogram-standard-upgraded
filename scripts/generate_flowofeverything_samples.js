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

// Minimal country catalog (capital coords approximated)
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
  { id: 'br', name: 'Brazil', lat: -15.7939, lng: -47.8828 },
  { id: 'cl', name: 'Chile', lat: -33.4489, lng: -70.6693 },
  { id: 'za', name: 'South Africa', lat: -25.7479, lng: 28.2293 },
  { id: 'au', name: 'Australia', lat: -35.2809, lng: 149.1300 },
  { id: 'ca', name: 'Canada', lat: 45.4215, lng: -75.6972 },
]

const ports = [
  { id: 'port-shanghai', name: 'Port of Shanghai', lat: 31.2304, lng: 121.4737, country: 'cn' },
  { id: 'port-shenzhen', name: 'Port of Shenzhen (Yantian)', lat: 22.561, lng: 114.278, country: 'cn' },
  { id: 'port-la', name: 'Port of Los Angeles', lat: 33.740, lng: -118.271, country: 'us' },
  { id: 'port-rotterdam', name: 'Port of Rotterdam', lat: 51.951, lng: 4.142, country: 'nl' },
  { id: 'port-singapore', name: 'Port of Singapore', lat: 1.264, lng: 103.840, country: 'sg' },
  { id: 'port-busan', name: 'Port of Busan', lat: 35.1028, lng: 129.0403, country: 'kr' },
  { id: 'port-yokohama', name: 'Port of Yokohama', lat: 35.4437, lng: 139.6380, country: 'jp' },
  { id: 'port-hk', name: 'Port of Hong Kong', lat: 22.308, lng: 114.161, country: 'cn' },
  { id: 'port-antwerp', name: 'Port of Antwerp', lat: 51.263, lng: 4.399, country: 'be' },
]

const companies = [
  { id: 'tsmc', name: 'TSMC', country: 'tw', type: 'Semiconductor Fab', lat: 24.813, lng: 120.967 },
  { id: 'foxconn', name: 'Foxconn', country: 'cn', type: 'EMS/Assembly', lat: 22.756, lng: 114.064 },
  { id: 'samsung', name: 'Samsung Electronics', country: 'kr', type: 'Semiconductor + OEM', lat: 37.263, lng: 127.028 },
  { id: 'lgchem', name: 'LG Chem', country: 'kr', type: 'Battery', lat: 37.5665, lng: 126.978 },
  { id: 'catl', name: 'CATL', country: 'cn', type: 'Battery', lat: 24.489, lng: 118.089 },
  { id: 'byd', name: 'BYD', country: 'cn', type: 'Battery + OEM', lat: 22.555, lng: 113.883 },
  { id: 'apple', name: 'Apple', country: 'us', type: 'OEM', lat: 37.3349, lng: -122.009 },
  { id: 'xiaomi', name: 'Xiaomi', country: 'cn', type: 'OEM', lat: 39.983, lng: 116.312 },
  { id: 'sony', name: 'Sony', country: 'jp', type: 'OEM', lat: 35.6895, lng: 139.6917 },
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

function buildTradeFlows() {
  const rows = []
  // Countries as nodes
  countries.forEach(c => {
    const [color, fill] = colorFor('country')
    rows.push([`country-${c.id}`, c.name, c.name, 'Country (trade node)', color, fill, 1, 1, c.lat, c.lng])
  })
  // Commodity categories
  const commodities = ['HS-8507 Batteries','HS-8517 Smartphones','HS-8542 Integrated Circuits','HS-8528 Displays']
  const years = [2019,2020,2021,2022,2023,2024]
  function randBetween(a,b){ return Math.round(a + Math.random()*(b-a)) }
  // Generate flows between top pairs
  const pairs = [
    ['cn','us'],['cn','de'],['kr','us'],['tw','cn'],['tw','us'],['jp','us'],['sg','us'],['cn','in'],['vn','us'],['mx','us']
  ]
  pairs.forEach(([src,dst]) => {
    commodities.forEach((comm,i) => {
      years.forEach(y => {
        const v = randBetween(200, 1200) * (i+1)
        const label = `${comm} ${y}`
        const [_, __] = colorFor('country')
        rows.push([,,,,,,,,,,,,'',`country-${src}`,`country-${dst}`,label,'#3f51b5',v,label,'arrow'])
      })
    })
  })
  return rows
}

function buildCompanyChains() {
  const rows = []
  companies.forEach(co => {
    const [color, fill] = colorFor('company')
    rows.push([`co-${co.id}`, co.name, co.type, `${co.type} (${co.country.toUpperCase()})`, color, fill, 5, 5, co.lat, co.lng, '', '', '', '', '', '', '', '', '', '', '', '🏭'])
  })
  // Supplier → OEM edges
  const supplierTo = [
    ['tsmc','apple','SoC supply'], ['tsmc','xiaomi','SoC supply'], ['samsung','apple','Display supply'], ['lgchem','foxconn','Battery cells'], ['catl','foxconn','Battery cells'], ['byd','xiaomi','Battery pack']
  ]
  supplierTo.forEach(([s,t,label]) => {
    rows.push([,,,,,,,,,,,,'',`co-${s}`,`co-${t}`,label,'#009688',50,label,'arrow'])
  })
  return rows
}

function buildLogistics() {
  const rows = []
  ports.forEach(p => {
    const [color, fill] = colorFor('port')
    rows.push([p.id, p.name, p.name, 'Seaport', color, fill, 3, 3, p.lat, p.lng, '', '', '', '', '', '', '', '', '', '', '', '🛳️'])
  })
  // Connect factory areas to ports and to destinations
  const edges = [
    ['co-foxconn','port-shenzhen','export electronics','#2196f3',200],
    ['co-samsung','port-busan','export components','#2196f3',120],
    ['co-tsmc','port-yokohama','export wafers','#2196f3',80],
    ['port-shenzhen','port-la','transpacific lane','#3f51b5',400],
    ['port-busan','port-la','transpacific lane','#3f51b5',220],
    ['port-yokohama','port-la','transpacific lane','#3f51b5',160],
  ]
  edges.forEach(([s,t,label,color,w]) => {
    rows.push([,,,,,,,,,,,,'',s,t,label,color,w,label,'arrow'])
  })
  return rows
}

function buildMaterialFlows() {
  const rows = []
  materials.forEach(m => {
    const c = countries.find(cc => cc.id === m.from) || countries[0]
    const [color, fill] = colorFor('material')
    rows.push([`mat-${m.id}`, m.name, m.name, `Raw material (${m.name})`, color, fill, 2, 2, c.lat, c.lng, '', '', '', '', '', '', '', '', '', '', '', '⛏️'])
  })
  // Transformation nodes
  const transformations = [
    { id: 'chem-refine', name: 'Chemical Refining' },
    { id: 'battery-cell', name: 'Battery Cell' },
    { id: 'battery-pack', name: 'Battery Pack' },
    { id: 'smartphone', name: 'Smartphone' },
  ]
  transformations.forEach(t => {
    const [color, fill] = colorFor('product')
    rows.push([`proc-${t.id}`, t.name, t.name, 'Process/Product stage', color, fill, 2, 2, 0, 0])
  })
  const chain = [
    ['mat-lithium','proc-chem-refine','refining'],
    ['mat-cobalt','proc-chem-refine','refining'],
    ['mat-nickel','proc-chem-refine','refining'],
    ['proc-chem-refine','proc-battery-cell','cell manufacturing'],
    ['proc-battery-cell','proc-battery-pack','pack assembly'],
    ['proc-battery-pack','proc-smartphone','final assembly'],
  ]
  chain.forEach(([s,t,label]) => {
    rows.push([,,,,,,,,,,,,'',s,t,label,'#795548',50,label,'arrow'])
  })
  return rows
}

function buildESGImpacts() {
  const rows = []
  // Treat ESG as node attributes on companies; add a few edges to a pseudo node for impact category
  const esgHub = 'esg-co2'
  rows.push([esgHub, 'CO2e Impact', 'CO2e', 'Aggregated emissions impact hub', '#9e9e9e', '#eeeeee', 1, 1, 0, 0])
  const picks = ['foxconn','tsmc','samsung','lgchem','catl','byd']
  picks.forEach(id => {
    const co = companies.find(c => c.id === id)
    const [color, fill] = colorFor('company')
    // node with additional ESG fields baked in notes
    rows.push([`esg-${id}`, `${co.name} ESG`, co.type, `ESG overlay for ${co.name}` , color, fill, 5, 5, co.lat, co.lng, '', '', '', '', '', '', '', '', '', '', '', ''])
    rows.push([,,,,,,,,,,,,'',`esg-${id}`, esgHub, 'annual CO2e (kt)', '#f44336', Math.round(100+Math.random()*400), 'CO2e', 'arrow'])
  })
  return rows
}

function padRows(rows) {
  // Ensure each row has H.length columns
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
  // combined file: merge all with a layer field in extra column
  let combined = []
  files.forEach(([name, rows]) => {
    const layer = name.replace('.topogram.csv','')
    combined = combined.concat(rows.map(r => {
      const a = Array.isArray(r) ? r.slice() : []
      while (a.length < H.length) a.push('')
      // put layer tag into 'extra'
      a[H.indexOf('extra')] = (a[H.indexOf('extra')] ? a[H.indexOf('extra')] + ';' : '') + `layer=${layer}`
      return a
    }))
  })
  files.forEach(([name, rows]) => writeCSV(name, padRows(rows)))
  writeCSV('combined_all_layers.topogram.csv', padRows(combined))
  console.log('Generated layered CSVs in', path.relative(process.cwd(), OUT_DIR))
}

main()
