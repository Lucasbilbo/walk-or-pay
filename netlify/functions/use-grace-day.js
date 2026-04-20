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

function supabasePatch(supabaseUrl, serviceKey, path, body) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: `/rest/v1/${path}`, method: 'PATCH',
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[use-grace-day] Missing required env vars')
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

  let parsed
  try {
    parsed = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { challenge_id } = parsed
  if (!challenge_id) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'challenge_id required' }) }
  }

  // Today in UTC
  const today = new Date().toISOString().split('T')[0]

  // Load challenge — verify ownership and active status
  let challenges
  try {
    challenges = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `challenges?id=eq.${encodeURIComponent(challenge_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,user_id,status,grace_days,grace_days_used`),
      5000
    )
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load challenge' }) }
  }

  const challenge = Array.isArray(challenges) ? challenges[0] : null
  if (!challenge) {
    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Challenge not found' }) }
  }
  if (challenge.status !== 'active') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Challenge is not active' }) }
  }
  if (challenge.grace_days_used >= challenge.grace_days) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No grace days remaining' }) }
  }

  // Load today's log — must exist and not already goal_met or grace_day_used
  let logs
  try {
    logs = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `daily_logs?challenge_id=eq.${encodeURIComponent(challenge_id)}&log_date=eq.${today}&select=id,goal_met,grace_day_used`),
      5000
    )
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load daily log' }) }
  }

  const log = Array.isArray(logs) ? logs[0] : null
  if (!log) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Aún no hay registro de pasos para hoy' }) }
  }
  if (log.goal_met) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Goal already met for today' }) }
  }
  if (log.grace_day_used) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Grace day already used for today' }) }
  }

  // Mark grace_day_used on the log
  let patchStatus
  try {
    patchStatus = await withTimeout(
      supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `daily_logs?challenge_id=eq.${encodeURIComponent(challenge_id)}&log_date=eq.${today}`,
        { grace_day_used: true }
      ),
      5000
    )
  } catch (e) {
    console.error('[use-grace-day] Failed to update daily_log:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to apply grace day' }) }
  }

  if (patchStatus !== 204) {
    console.error('[use-grace-day] daily_log PATCH returned:', patchStatus)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to apply grace day' }) }
  }

  // Increment grace_days_used on challenge
  const newGraceDaysUsed = challenge.grace_days_used + 1
  try {
    await withTimeout(
      supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `challenges?id=eq.${encodeURIComponent(challenge_id)}`,
        { grace_days_used: newGraceDaysUsed }
      ),
      5000
    )
  } catch (e) {
    console.error('[use-grace-day] Failed to update challenge grace_days_used:', e.message)
    // Log already updated — don't fail the response
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      grace_days_remaining: challenge.grace_days - newGraceDaysUsed,
    }),
  }
}
