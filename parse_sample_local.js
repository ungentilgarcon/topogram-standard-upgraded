const fs = require('fs');
const Papa = require('papaparse');
const text = fs.readFileSync('imports/ui/components/ImportCsvModal.jsx','utf8');
const m = text.match(/const sampleCsv = ([\s\S]*?)\n\n  const handleFile/);
if(!m){ console.error('sampleCsv not found'); process.exit(2)}
let sample = m[1];
// sample is JS expression; evaluate safely by extracting the string between backticks if present
const bt = sample.match(/`([\s\S]*)`/);
if(bt) sample = bt[1];
const p = Papa.parse(sample, { header: true, comments: '#', skipEmptyLines: true });
console.log('errors:', JSON.stringify(p.errors, null, 2));
console.log('rows:', p.data.length);
if(p.data && p.data.length) console.log('first row fields:', Object.keys(p.data[0]).length);
