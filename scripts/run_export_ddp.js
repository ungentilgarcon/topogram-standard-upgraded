// Usage examples:
// RESUME_TOKEN=<token> TOP_ID=pp2bsmqkXJ7bGkjPd node scripts/run_export_ddp.js
// LOGIN_USER=admin LOGIN_PASS=secret TOP_ID=pp2bsmqkXJ7bGkjPd node scripts/run_export_ddp.js

const DDP = require('ddp-client')

const host = process.env.DDP_HOST || 'localhost'
const port = process.env.DDP_PORT || 3000
const secure = process.env.DDP_SECURE === '1' || false
const wsProtocol = secure ? 'wss' : 'ws'
const url = `${wsProtocol}://${host}:${port}/websocket`

const TOP_ID = process.env.TOP_ID || process.env.TOPID || null
if (!TOP_ID) {
  process.stderr.write('Please set TOP_ID environment variable to the topogram id\n')
  process.exit(2)
}

const ddp = new DDP({
  host: host,
  port: port,
  ssl: secure,
  autoReconnect: true,
  autoReconnectTimer: 5000,
  maintainCollections: false
})

function wait(ms){return new Promise(r=>setTimeout(r,ms))}

function callMethod(name, params){
  return new Promise((resolve,reject)=>{
    ddp.call(name, params, (err,res)=>{
      if (err) return reject(err)
      resolve(res)
    })
  })
}

function loginWithPassword(user, pass){
  const userParam = (user.indexOf('@') !== -1) ? {email: user} : {username: user}
  return callMethod('login', [{user: userParam, password: {digest: require('crypto').createHash('sha256').update(pass).digest('hex'), algorithm: 'sha-256'}}])
}

function loginWithResume(token){
  return callMethod('login', [{resume: token}])
}

ddp.connect((err)=>{
  const fs = require('fs')
  if (err) {
    try { fs.appendFileSync('/tmp/topogram-export-run.log', 'DDP connect error ' + (err && err.stack ? err.stack : String(err)) + '\n') } catch(e) {}
    process.exit(3)
  }
  try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Connected to DDP at ' + url + '\n') } catch(e) {}

  (async ()=>{
    try{
      // authenticate if credentials provided
      if (process.env.RESUME_TOKEN) {
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Logging in with resume token...' + '\n') } catch(e) {}
        await loginWithResume(process.env.RESUME_TOKEN)
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Resume login successful' + '\n') } catch(e) {}
      } else if (process.env.LOGIN_USER && process.env.LOGIN_PASS) {
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Logging in with username/password...' + '\n') } catch(e) {}
        await loginWithPassword(process.env.LOGIN_USER, process.env.LOGIN_PASS)
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Password login successful' + '\n') } catch(e) {}
      } else {
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'No credentials provided; calling method unauthenticated may fail if server requires admin' + '\n') } catch(e) {}
      }

        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Calling topogram.exportBundle ' + TOP_ID + '\n') } catch(e) {}
      const cfg = { title: 'Exported Topogram', id: `topogram-${TOP_ID}`, // minimal config; exporter performs schema validation
        networkRenderer: 'cytoscape', geoRenderer: 'leaflet' }
      const res = await callMethod('topogram.exportBundle', [{ topogramId: TOP_ID, config: cfg }])
  try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Export method returned: ' + JSON.stringify(res) + '\n') } catch(e) {}

      // print path where file should be
      if (res && res.filename) {
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Exported bundle filename: ' + res.filename + '\n') } catch(e) {}
        try { fs.appendFileSync('/tmp/topogram-export-run.log', 'It should be available under /tmp/topogram-exports/' + res.filename + '\n') } catch(e) {}
      }

      process.exit(0)
      }catch(e){
        try {
          const util = require('util')
          const dump = (e && e.stack) ? (e.stack + '\n' + util.inspect(e, { depth: null })) : util.inspect(e, { depth: null })
          fs.appendFileSync('/tmp/topogram-export-run.log', 'Error during export call: ' + dump + '\n')
        } catch(e2) {
          try { fs.appendFileSync('/tmp/topogram-export-run.log', 'Error during export call (failed to serialize error) ' + String(e) + '\n') } catch(e3) {}
        }
        process.exit(4)
      }
  })()
})
