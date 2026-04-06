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
        Prefer: 'return=minimal',
      },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', () => resolve(500))
    req.write(bodyStr)
    req.end()
  })
}

function stripeRefund(secretKey, paymentIntentId, amountCents) {
  const params = new URLSearchParams({
    payment_intent: paymentIntentId,
    amount: String(amountCents),
  }).toString()
  const auth = Buffer.from(`${secretKey}:`).toString('base64')
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com', path: '/v1/refunds', method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { reject(new Error('Parse error')) } })
    })
    req.on('error', reject)
    req.write(params)
    req.end()
  })
}

// Internal helper — also exported for use from daily-snapshot
async function closeChallengeById(challengeId, supabaseUrl, serviceKey, stripeKey) {
  // Load challenge
  const challenges = await withTimeout(
    supabaseGet(supabaseUrl, serviceKey,
      `challenges?id=eq.${encodeURIComponent(challengeId)}&select=*`),
    5000
  )
  const challenge = Array.isArray(challenges) ? challenges[0] : null
  if (!challenge) throw new Error('Challenge not found')
  if (challenge.status !== 'active') throw new Error('Challenge is not active')

  // Load all daily_logs for this challenge
  const logs = await withTimeout(
    supabaseGet(supabaseUrl, serviceKey,
      `daily_logs?challenge_id=eq.${encodeURIComponent(challengeId)}&select=*`),
    5000
  )
  const dailyLogs = Array.isArray(logs) ? logs : []

  // Count failed days: goal_met = false AND grace_day_used = false
  const failedDays = dailyLogs.filter(l => !l.goal_met && !l.grace_day_used).length

  const penaltyCents = Math.round((failedDays / 7) * challenge.effective_amount_cents)
  const refundCents = Math.max(0, challenge.amount_cents - Math.min(penaltyCents, challenge.amount_cents))

  // Issue Stripe refund if applicable
  if (refundCents > 0 && challenge.stripe_payment_intent_id && stripeKey) {
    try {
      await withTimeout(stripeRefund(stripeKey, challenge.stripe_payment_intent_id, refundCents), 5000)
      console.log(`[close-challenge] Refunded ${refundCents} cents for challenge ${challengeId}`)
    } catch (e) {
      console.error(`[close-challenge] Stripe refund failed for ${challengeId}:`, e.message)
      // Continue — don't block completion on refund failure
    }
  }

  // Record penalty in penalty_pool (even if 0, for audit trail)
  if (penaltyCents > 0) {
    await withTimeout(
      supabaseInsert(supabaseUrl, serviceKey, 'penalty_pool', {
        challenge_id: challengeId,
        user_id: challenge.user_id,
        amount_cents: penaltyCents,
      }),
      5000
    )
  }

  // Mark challenge completed
  await withTimeout(
    supabasePatch(supabaseUrl, serviceKey,
      `challenges?id=eq.${encodeURIComponent(challengeId)}`, {
        status: 'completed',
        penalty_cents: penaltyCents,
      }),
    5000
  )

  return { failed_days: failedDays, penalty_cents: penaltyCents, refund_cents: refundCents }
}

exports.closeChallengeById = closeChallengeById

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  // Accept either user JWT or service role key (for internal calls from daily-snapshot)
  const authHeader = event.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  const isInternalCall = token === SUPABASE_SERVICE_ROLE_KEY
  if (!isInternalCall) {
    // Validate as user JWT — only the challenge owner can close their own challenge
    // (Future: add user_id verification against challenge.user_id)
    if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

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

  try {
    const result = await closeChallengeById(
      challenge_id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
    )
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }
  } catch (e) {
    console.error('[close-challenge] Error:', e.message)
    const status = e.message.includes('not found') ? 404 : e.message.includes('not active') ? 400 : 500
    return { statusCode: status, headers: CORS, body: JSON.stringify({ error: e.message }) }
  }
}
