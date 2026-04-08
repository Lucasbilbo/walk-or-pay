const https = require('https')
const crypto = require('crypto')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function withTimeout(promise, ms) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  )
  return Promise.race([promise, timer])
}

function verifyJWT(token, supabaseUrl, serviceKey) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: '/auth/v1/user', method: 'GET',
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve(res.statusCode === 200 ? JSON.parse(d) : null) } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function supabaseGet(supabaseUrl, serviceKey, path) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: `/rest/v1/${path}`, method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function supabaseInsert(supabaseUrl, serviceKey, table, body) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: `/rest/v1/${table}`, method: 'POST',
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'return=representation',
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { resolve({ status: res.statusCode, body: null }) } })
    })
    req.on('error', () => resolve({ status: 500, body: null }))
    req.write(bodyStr)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  const authHeader = event.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }

  let user
  try {
    user = await withTimeout(verifyJWT(token, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), 5000)
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Auth verification timed out' }) }
  }
  if (!user?.id) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid token' }) }

  // Check if token already exists for this user
  let existing
  try {
    const rows = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `user_tokens?user_id=eq.${encodeURIComponent(user.id)}&select=token`),
      5000
    )
    existing = Array.isArray(rows) ? rows[0] : null
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to check existing token' }) }
  }

  if (existing?.token) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: existing.token }),
    }
  }

  // Generate new token and save
  const personalToken = crypto.randomBytes(32).toString('hex')
  try {
    const res = await withTimeout(
      supabaseInsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'user_tokens', {
        user_id: user.id,
        token: personalToken,
      }),
      5000
    )
    if (res.status !== 201) throw new Error(`Insert failed: ${res.status}`)
  } catch (e) {
    console.error('[generate-user-token] Insert failed:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to generate token' }) }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: personalToken }),
  }
}
