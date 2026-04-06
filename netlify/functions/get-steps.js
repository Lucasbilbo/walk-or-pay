const https = require('https')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function getFitnessTokens(userId, supabaseUrl, serviceKey) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: `/rest/v1/fitness_tokens?user_id=eq.${encodeURIComponent(userId)}&select=access_token,refresh_token,expires_at`,
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const arr = JSON.parse(d)
          resolve(Array.isArray(arr) && arr.length > 0 ? arr[0] : null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function updateFitnessToken(userId, supabaseUrl, serviceKey, updates) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(updates)
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: `/rest/v1/fitness_tokens?user_id=eq.${encodeURIComponent(userId)}`,
      method: 'PATCH',
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'return=minimal',
      },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', () => resolve(500))
    req.write(bodyStr)
    req.end()
  })
}

function refreshGoogleToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString()
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error('Parse error')) } })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function fetchGoogleFitSteps(accessToken, startMs, endMs) {
  const bodyStr = JSON.stringify({
    aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis: startMs,
    endTimeMillis: endMs,
  })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: '/fitness/v1/users/me/dataset:aggregate',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { reject(new Error('Parse error')) } })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
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

  // Validate date param
  const params = event.queryStringParameters || {}
  const date = (params.date || '').replace(/[^0-9-]/g, '')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'date param required (YYYY-MM-DD)' }) }
  }

  // Load tokens from DB
  let tokens
  try {
    tokens = await withTimeout(getFitnessTokens(user.id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), 5000)
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load fitness tokens' }) }
  }
  if (!tokens) {
    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'No Google Fit connection found' }) }
  }

  // Refresh access token if expiring within 60 seconds
  const expiresAtMs = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0
  if (expiresAtMs < Date.now() + 60000) {
    if (!tokens.refresh_token) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Token expired — please reconnect Google Fit' }) }
    }
    try {
      const refreshed = await withTimeout(refreshGoogleToken(tokens.refresh_token), 5000)
      if (!refreshed.access_token) throw new Error('No access_token in refresh response')
      const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString()
      await updateFitnessToken(user.id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        access_token: refreshed.access_token,
        expires_at: newExpiresAt,
      })
      tokens = { ...tokens, access_token: refreshed.access_token }
    } catch (e) {
      console.error('[get-steps] Token refresh failed:', e.message)
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to refresh Google token' }) }
    }
  }

  // Fetch steps from Google Fit
  const startMs = new Date(date + 'T00:00:00Z').getTime()
  const endMs = new Date(date + 'T23:59:59.999Z').getTime()

  let fitRes
  try {
    fitRes = await withTimeout(fetchGoogleFitSteps(tokens.access_token, startMs, endMs), 5000)
  } catch (e) {
    if (e.message === 'Timeout') {
      return { statusCode: 408, headers: CORS, body: JSON.stringify({ error: 'Google Fit request timed out' }) }
    }
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Google Fit request failed' }) }
  }

  if (fitRes.status !== 200) {
    console.error('[get-steps] Google Fit error:', fitRes.status, fitRes.body)
    return { statusCode: fitRes.status, headers: CORS, body: JSON.stringify({ error: 'Google Fit API error' }) }
  }

  // Sum steps across buckets — NEVER return access_token or refresh_token
  let steps = 0
  for (const bucket of (fitRes.body.bucket || [])) {
    for (const dataset of (bucket.dataset || [])) {
      for (const point of (dataset.point || [])) {
        for (const val of (point.value || [])) {
          steps += val.intVal || 0
        }
      }
    }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps, date }),
  }
}
