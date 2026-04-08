const https = require('https')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function withTimeout(promise, ms) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  )
  return Promise.race([promise, timer])
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

function supabaseUpsert(supabaseUrl, serviceKey, table, body) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: `/rest/v1/${table}`, method: 'POST',
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'resolution=merge-duplicates,return=minimal',
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
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  let parsed
  try {
    parsed = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { token, steps, date } = parsed

  if (!token || typeof steps !== 'number' || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'token, steps (number), and date (YYYY-MM-DD) required' }) }
  }

  // Resolve user_id from personal token
  let tokenRow
  try {
    const rows = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `user_tokens?token=eq.${encodeURIComponent(token)}&select=user_id`),
      5000
    )
    tokenRow = Array.isArray(rows) ? rows[0] : null
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to verify token' }) }
  }
  if (!tokenRow?.user_id) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid token' }) }
  }

  const userId = tokenRow.user_id

  // Find active challenge
  let challenge
  try {
    const rows = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `challenges?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&order=created_at.desc&limit=1&select=id,daily_goal`),
      5000
    )
    challenge = Array.isArray(rows) ? rows[0] : null
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load challenge' }) }
  }

  if (!challenge) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'No active challenge' }),
    }
  }

  const goalMet = steps >= challenge.daily_goal

  // Upsert daily_log
  try {
    await withTimeout(
      supabaseUpsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'daily_logs', {
        challenge_id: challenge.id,
        user_id: userId,
        log_date: date,
        steps,
        goal_met: goalMet,
        grace_day_used: false,
      }),
      5000
    )
  } catch (e) {
    console.error('[shortcut-log-steps] Upsert failed:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to log steps' }) }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      steps,
      goal_met: goalMet,
      daily_goal: challenge.daily_goal,
    }),
  }
}
