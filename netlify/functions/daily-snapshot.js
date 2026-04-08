/**
 * daily-snapshot — Netlify Scheduled Function
 * Runs at 00:05 UTC every day (cron: "5 0 * * *")
 * Defined in netlify.toml: [functions."daily-snapshot"] schedule = "5 0 * * *"
 */
const https = require('https')
const { closeChallengeById } = require('./close-challenge')

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
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', () => resolve(500))
    req.write(bodyStr)
    req.end()
  })
}

function getFitnessTokens(userId, supabaseUrl, serviceKey) {
  return new Promise((resolve) => {
    const hostname = new URL(supabaseUrl).hostname
    const req = https.request({
      hostname,
      path: `/rest/v1/fitness_tokens?user_id=eq.${encodeURIComponent(userId)}&select=access_token,refresh_token,expires_at`,
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { const arr = JSON.parse(d); resolve(Array.isArray(arr) ? arr[0] : null) } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
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

async function getStepsForUser(userId, date, supabaseUrl, serviceKey) {
  const tokens = await getFitnessTokens(userId, supabaseUrl, serviceKey)
  if (!tokens?.access_token) return null

  const startMs = new Date(date + 'T00:00:00Z').getTime()
  const endMs = new Date(date + 'T23:59:59.999Z').getTime()

  let fitRes
  try {
    fitRes = await withTimeout(fetchGoogleFitSteps(tokens.access_token, startMs, endMs), 5000)
  } catch {
    return null
  }

  if (fitRes.status !== 200) return null

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
  return steps
}

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    console.error('[daily-snapshot] Server misconfigured — missing env vars')
    return { statusCode: 500, body: 'Server misconfigured' }
  }

  const today = new Date().toISOString().split('T')[0]
  // yesterday in UTC
  const yesterdayDate = new Date()
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
  const yesterday = yesterdayDate.toISOString().split('T')[0]

  console.log('[daily-snapshot] Running for yesterday:', yesterday)

  // Load all active challenges
  let activeChallenges
  try {
    activeChallenges = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        'challenges?status=eq.active&select=*'),
      5000
    )
  } catch (e) {
    console.error('[daily-snapshot] Failed to load challenges:', e.message)
    return { statusCode: 500, body: 'Failed to load challenges' }
  }

  if (!Array.isArray(activeChallenges) || activeChallenges.length === 0) {
    console.log('[daily-snapshot] No active challenges')
    return { statusCode: 200, body: JSON.stringify({ processed: 0 }) }
  }

  console.log('[daily-snapshot] Processing', activeChallenges.length, 'challenges')
  let processed = 0
  let closed = 0

  for (const challenge of activeChallenges) {
    try {
      // Check if daily_log for yesterday already exists
      const existingLogs = await withTimeout(
        supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
          `daily_logs?challenge_id=eq.${challenge.id}&log_date=eq.${yesterday}&select=id`),
        5000
      )
      const logExists = Array.isArray(existingLogs) && existingLogs.length > 0

      if (!logExists) {
        // Fetch steps from Google Fit using service role (tokens stored server-side)
        const steps = await getStepsForUser(challenge.user_id, yesterday, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const stepCount = steps ?? 0
        const goalMet = stepCount >= challenge.daily_goal

        await withTimeout(
          supabaseInsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'daily_logs', {
            challenge_id: challenge.id,
            user_id: challenge.user_id,
            log_date: yesterday,
            steps: stepCount,
            goal_met: goalMet,
            grace_day_used: false,
          }),
          5000
        )
        console.log(`[daily-snapshot] Logged ${stepCount} steps for challenge ${challenge.id} on ${yesterday} — goal_met: ${goalMet}`)
      }

      // Close challenge if yesterday was the end date
      if (challenge.end_date === yesterday) {
        await closeChallengeById(challenge.id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY)
        console.log(`[daily-snapshot] Closed challenge ${challenge.id}`)
        closed++
      }

      processed++
    } catch (e) {
      console.error(`[daily-snapshot] Error processing challenge ${challenge.id}:`, e.message)
    }
  }

  console.log(`[daily-snapshot] Done — processed: ${processed}, closed: ${closed}`)
  return {
    statusCode: 200,
    body: JSON.stringify({ processed, closed }),
  }
}
