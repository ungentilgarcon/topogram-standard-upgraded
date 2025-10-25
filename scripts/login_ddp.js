// Simple DDP login checker. Usage:
// LOGIN_USER=ungentilgarcon LOGIN_PASS=matrix node scripts/login_ddp.js

const DDP = require('ddp-client')

const host = process.env.DDP_HOST || 'localhost'
const port = process.env.DDP_PORT || 3001
const secure = process.env.DDP_SECURE === '1' || false
const wsProtocol = secure ? 'wss' : 'ws'
const url = `${wsProtocol}://${host}:${port}/websocket`

const user = process.env.LOGIN_USER
const pass = process.env.LOGIN_PASS

if (!user || !pass) {
  console.error('Please set LOGIN_USER and LOGIN_PASS environment variables')
  process.exit(2)
}

const ddp = new DDP({ host, port, ssl: secure, autoReconnect: true, maintainCollections: false })

function callMethod(name, params){
  return new Promise((resolve, reject) => {
    ddp.call(name, params, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
}

function loginWithPassword(user, pass){
  const userParam = (user.indexOf('@') !== -1) ? {email: user} : {username: user}
  const crypto = require('crypto')
  const digest = crypto.createHash('sha256').update(pass).digest('hex')
  return callMethod('login', [{ user: userParam, password: { digest: digest, algorithm: 'sha-256' } }])
}

ddp.connect(async (err) => {
  if (err) {
    console.error('DDP connect error', err)
    process.exit(3)
  }
  try {
    const res = await loginWithPassword(user, pass)
    console.log('Login successful:', res)
    process.exit(0)
  } catch (e) {
    console.error('Login failed:', e && e.error ? e.error : e && e.message ? e.message : e)
    process.exit(4)
  }
})
