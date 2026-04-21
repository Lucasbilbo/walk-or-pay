/**
 * evening-reminder — Netlify Scheduled Function
 * Cron: "0 17 * * *" (17:00 UTC = 19:00 Spain time)
 * Defined in netlify.toml: [functions."evening-reminder"] schedule = "0 17 * * *"
 *
 * Sends a push notification to users whose logged steps for today are below 70% of goal.
 * Steps come from daily_logs (already synced via shortcut); no Google Fit call needed.
 */
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[evening-reminder] Missing required env vars')
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  const today = new Date().toISOString().split('T')[0]
  console.log('[evening-reminder] Running for today:', today)

  // Load all active challenges
  let activeChallenges
  try {
    activeChallenges = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        'challenges?status=eq.active&select=id,user_id,daily_goal'),
      5000
    )
  } catch (e) {
    console.error('[evening-reminder] Failed to load challenges:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load challenges' }) }
  }

  if (!Array.isArray(activeChallenges) || activeChallenges.length === 0) {
    console.log('[evening-reminder] No active challenges')
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ notified: 0, skipped: 0, errors: 0 }) }
  }

  console.log('[evening-reminder] Processing', activeChallenges.length, 'challenges')

  let notified = 0
  let skipped = 0
  let errors = 0

  for (const challenge of activeChallenges) {
    try {
      // Get today's logged steps (may not exist yet — treated as 0)
      const logs = await withTimeout(
        supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
          `daily_logs?challenge_id=eq.${encodeURIComponent(challenge.id)}&log_date=eq.${today}&select=steps,goal_met`),
        5000
      )
      const log = Array.isArray(logs) ? logs[0] : null
      const steps = log?.steps ?? 0

      // Skip if already met goal
      if (log?.goal_met) {
        skipped++
        continue
      }

      // Skip if at or above 70% of goal
      if (steps >= challenge.daily_goal * 0.7) {
        skipped++
        continue
      }

      // Get push token from profile
      const profileRows = await withTimeout(
        supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
          `profiles?user_id=eq.${encodeURIComponent(challenge.user_id)}&select=push_token`),
        5000
      )
      const pushToken = Array.isArray(profileRows) ? profileRows[0]?.push_token : null

      if (!pushToken) {
        skipped++
        continue
      }

      const minutesLeft = Math.round((challenge.daily_goal - steps) / 100)
      await withTimeout(
        sendPushNotification(
          pushToken,
          'Time to walk! 🚶',
          `You need ${minutesLeft} more minutes to hit your goal today — don't lose your money`
        ),
        5000
      )
      console.log(`[evening-reminder] Push sent to user ${challenge.user_id} (${steps}/${challenge.daily_goal} steps)`)
      notified++
    } catch (e) {
      console.error(`[evening-reminder] Error processing challenge ${challenge.id}:`, e.message)
      errors++
    }
  }

  const summary = { notified, skipped, errors }
  console.log('[evening-reminder] Done —', JSON.stringify(summary))
  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  }
}
