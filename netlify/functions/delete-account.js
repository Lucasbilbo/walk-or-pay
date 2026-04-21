const https = require('https')

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

function supabaseDelete(supabaseUrl, serviceKey, path) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: `/rest/v1/${path}`, method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', () => resolve(500))
    req.end()
  })
}

function deleteAuthUser(supabaseUrl, serviceKey, uid) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: `/auth/v1/admin/users/${encodeURIComponent(uid)}`,
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', () => resolve(500))
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[delete-account] Missing required env vars')
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

  const uid = user.id
  const uidParam = `user_id=eq.${encodeURIComponent(uid)}`

  // Delete in FK-safe order
  const steps = [
    ['daily_logs', `daily_logs?${uidParam}`],
    ['penalty_pool', `penalty_pool?${uidParam}`],
    ['fitness_tokens', `fitness_tokens?${uidParam}`],
    ['user_tokens', `user_tokens?${uidParam}`],
    ['challenges', `challenges?${uidParam}`],
    ['profiles', `profiles?${uidParam}`],
  ]

  for (const [table, path] of steps) {
    try {
      const status = await withTimeout(supabaseDelete(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, path), 5000)
      // 200 or 204 are both success; table may not exist (404) — treat as ok
      if (status !== 200 && status !== 204 && status !== 404) {
        console.error(`[delete-account] DELETE ${table} returned ${status}`)
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Failed to delete ${table}` }) }
      }
    } catch (e) {
      console.error(`[delete-account] DELETE ${table} timed out:`, e.message)
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Timeout deleting ${table}` }) }
    }
  }

  // Delete auth user via Supabase Admin API
  try {
    const status = await withTimeout(deleteAuthUser(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, uid), 5000)
    if (status !== 200 && status !== 204) {
      console.error('[delete-account] Admin delete user returned:', status)
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to delete auth user' }) }
    }
  } catch (e) {
    console.error('[delete-account] Admin delete user timed out:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Timeout deleting auth user' }) }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true }),
  }
}
