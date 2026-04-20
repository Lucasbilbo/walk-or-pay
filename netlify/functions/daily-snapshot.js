/**
 * daily-snapshot — Netlify Scheduled Function
 * Cron: "5 0 * * *" (00:05 UTC every day)
 * Defined in netlify.toml: [functions."daily-snapshot"] schedule = "5 0 * * *"
 */
const https = require('https')
const { closeChallengeById } = require('./close-challenge')

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

function refreshGoogleToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString()
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch { reject(new Error('Token refresh parse error')) }
      })
    })
    req.on('error', reject)
    req.write(params)
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
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch { reject(new Error('Google Fit parse error')) }
      })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

function sendPushNotification(pushToken, title, body) {
  const bodyStr = JSON.stringify({ to: pushToken, title, body })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

async function getStepsForUser(userId, date, supabaseUrl, serviceKey, googleClientId, googleClientSecret) {
  // Load fitness tokens
  const rows = await withTimeout(
    supabaseGet(supabaseUrl, serviceKey,
      `fitness_tokens?user_id=eq.${encodeURIComponent(userId)}&select=access_token,refresh_token,expires_at`),
    5000
  )
  const tokenRow = Array.isArray(rows) ? rows[0] : null
  if (!tokenRow?.access_token) return null

  let { access_token, refresh_token, expires_at } = tokenRow

  // Refresh if expires within 1 minute
  const expiresAtMs = new Date(expires_at).getTime()
  const nowMs = Date.now()
  if (expiresAtMs - nowMs < 60_000) {
    if (!refresh_token || !googleClientId || !googleClientSecret) {
      console.error(`[daily-snapshot] Cannot refresh token for user ${userId} — missing credentials`)
      return null
    }
    try {
      const refreshRes = await withTimeout(
        refreshGoogleToken(googleClientId, googleClientSecret, refresh_token),
        5000
      )
      if (refreshRes.status !== 200 || !refreshRes.body.access_token) {
        console.error(`[daily-snapshot] Token refresh failed for user ${userId}: ${refreshRes.status}`)
        return null
      }
      access_token = refreshRes.body.access_token
      const newExpiresAt = new Date(nowMs + refreshRes.body.expires_in * 1000).toISOString()
      // Persist refreshed token — never expose in response
      await withTimeout(
        supabasePatch(supabaseUrl, serviceKey,
          `fitness_tokens?user_id=eq.${encodeURIComponent(userId)}`,
          { access_token, expires_at: newExpiresAt }
        ),
        5000
      )
    } catch (e) {
      console.error(`[daily-snapshot] Token refresh error for user ${userId}:`, e.message)
      return null
    }
  }

  // Fetch steps from Google Fit
  const startMs = new Date(date + 'T00:00:00Z').getTime()
  const endMs = new Date(date + 'T23:59:59.999Z').getTime()
  let fitRes
  try {
    fitRes = await withTimeout(fetchGoogleFitSteps(access_token, startMs, endMs), 5000)
  } catch (e) {
    console.error(`[daily-snapshot] Google Fit request failed for user ${userId}:`, e.message)
    return null
  }

  if (fitRes.status === 401) {
    console.error(`[daily-snapshot] Google Fit 401 for user ${userId} — token invalid`)
    return null
  }
  if (fitRes.status !== 200) {
    console.error(`[daily-snapshot] Google Fit ${fitRes.status} for user ${userId}`)
    return null
  }

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
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[daily-snapshot] Missing required env vars')
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  // Yesterday in UTC
  const yesterdayDate = new Date()
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
  const yesterday = yesterdayDate.toISOString().split('T')[0]

  console.log('[daily-snapshot] Running for yesterday:', yesterday)

  // Load all active challenges
  let activeChallenges
  try {
    activeChallenges = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        'challenges?status=eq.active&select=id,user_id,daily_goal,end_date,amount_cents,effective_amount_cents,stripe_payment_intent_id,welcome_bonus_applied,grace_days,grace_days_used'),
      5000
    )
  } catch (e) {
    console.error('[daily-snapshot] Failed to load challenges:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load challenges' }) }
  }

  if (!Array.isArray(activeChallenges) || activeChallenges.length === 0) {
    console.log('[daily-snapshot] No active challenges')
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ processed: 0, errors: 0, failed_challenge_ids: [] }) }
  }

  console.log('[daily-snapshot] Processing', activeChallenges.length, 'challenges')

  let processed = 0
  let errors = 0
  const failedChallengeIds = []

  for (const challenge of activeChallenges) {
    try {
      // Check if a daily_log for yesterday already exists
      const existingLogs = await withTimeout(
        supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
          `daily_logs?challenge_id=eq.${encodeURIComponent(challenge.id)}&log_date=eq.${yesterday}&select=id`),
        5000
      )
      const logExists = Array.isArray(existingLogs) && existingLogs.length > 0

      if (!logExists) {
        const steps = await getStepsForUser(
          challenge.user_id, yesterday,
          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
          GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
        )
        const stepCount = steps ?? 0
        const goalMet = stepCount >= challenge.daily_goal

        await withTimeout(
          supabaseUpsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'daily_logs', {
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

        // Push notification if below 70% of goal
        if (!goalMet && stepCount < challenge.daily_goal * 0.7) {
          try {
            const profileRows = await withTimeout(
              supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                `profiles?user_id=eq.${encodeURIComponent(challenge.user_id)}&select=push_token`),
              5000
            )
            const pushToken = Array.isArray(profileRows) ? profileRows[0]?.push_token : null
            if (pushToken) {
              const minutesLeft = Math.round((challenge.daily_goal - stepCount) / 100)
              await withTimeout(
                sendPushNotification(
                  pushToken,
                  'Keep walking!',
                  `You need ${minutesLeft} more minutes — don't lose your money`
                ),
                5000
              )
              console.log(`[daily-snapshot] Push sent to user ${challenge.user_id}`)
            }
          } catch (e) {
            console.error(`[daily-snapshot] Push notification failed for ${challenge.id}:`, e.message)
          }
        }
      } else {
        console.log(`[daily-snapshot] Log already exists for challenge ${challenge.id} on ${yesterday}, skipping`)
      }

      // Close challenge if yesterday was the end date
      if (challenge.end_date === yesterday) {
        if (!STRIPE_SECRET_KEY) {
          console.error(`[daily-snapshot] Cannot close challenge ${challenge.id} — STRIPE_SECRET_KEY missing`)
        } else {
          await closeChallengeById(challenge.id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY)
          console.log(`[daily-snapshot] Closed challenge ${challenge.id}`)
        }
      }

      processed++
    } catch (e) {
      console.error(`[daily-snapshot] Error processing challenge ${challenge.id}:`, e.message)
      errors++
      failedChallengeIds.push(challenge.id)
    }
  }

  const summary = { processed, errors, failed_challenge_ids: failedChallengeIds }
  console.log('[daily-snapshot] Done —', JSON.stringify(summary))
  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  }
}
