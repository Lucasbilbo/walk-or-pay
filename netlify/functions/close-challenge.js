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

// Like supabasePatch but returns the updated rows (empty array = no rows matched)
function supabasePatchReturning(supabaseUrl, serviceKey, path, body) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: `/rest/v1/${path}`, method: 'PATCH',
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'return=representation',
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
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

// Verify a Supabase JWT and return the user_id, or null if invalid
function verifySupabaseJwt(supabaseUrl, serviceKey, token) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: '/auth/v1/user', method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d)
          resolve(res.statusCode === 200 && parsed.id ? parsed.id : null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function stripeRefund(secretKey, paymentIntentId, amountCents, idempotencyKey) {
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
        'Idempotency-Key': idempotencyKey,
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch { reject(new Error('Stripe parse error')) }
      })
    })
    req.on('error', reject)
    req.write(params)
    req.end()
  })
}

// Exported for use from daily-snapshot
async function closeChallengeById(challengeId, supabaseUrl, serviceKey, stripeKey) {
  // Step 1 — Load challenge
  const rows = await withTimeout(
    supabaseGet(supabaseUrl, serviceKey,
      `challenges?id=eq.${encodeURIComponent(challengeId)}&select=*`),
    5000
  )
  const challenge = Array.isArray(rows) ? rows[0] : null
  if (!challenge) throw new Error('Challenge not found')
  if (challenge.status !== 'active') throw new Error('Challenge is not active')

  // Step 2 — Atomic lock: PATCH only succeeds if status is still 'active'.
  // If another process already acquired the lock, lockRows will be empty.
  const lockRows = await withTimeout(
    supabasePatchReturning(supabaseUrl, serviceKey,
      `challenges?id=eq.${encodeURIComponent(challengeId)}&status=eq.active`,
      { status: 'closing' }
    ),
    5000
  )
  if (!Array.isArray(lockRows) || lockRows.length === 0) {
    console.warn(`[close-challenge] Lock not acquired for ${challengeId} — already closing or completed`)
    return { success: false, reason: 'Challenge not in active state — already closing or completed' }
  }

  // Step 3 — Load daily_logs
  const logs = await withTimeout(
    supabaseGet(supabaseUrl, serviceKey,
      `daily_logs?challenge_id=eq.${encodeURIComponent(challengeId)}&select=log_date,goal_met,grace_day_used`),
    5000
  )
  const dailyLogs = Array.isArray(logs) ? logs : []

  // Step 4 — Calculate penalty and refund
  const failedDays = dailyLogs.filter(l => !l.goal_met && !l.grace_day_used).length
  const penaltyCents = Math.round((failedDays / 7) * challenge.effective_amount_cents)
  const refundCents = Math.max(0, challenge.amount_cents - Math.min(penaltyCents, challenge.amount_cents))

  // Step 5 — Mark challenge completed BEFORE Stripe call.
  // If Stripe times out the challenge is already closed and cannot be refunded again on retry.
  await withTimeout(
    supabasePatch(supabaseUrl, serviceKey,
      `challenges?id=eq.${encodeURIComponent(challengeId)}`,
      { status: 'completed', penalty_cents: penaltyCents }
    ),
    5000
  )

  // Step 6 — Record penalty in penalty_pool
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

  // Step 7 — Mark welcome_bonus_used on profiles if bonus was applied
  if (challenge.welcome_bonus_applied) {
    await withTimeout(
      supabasePatch(supabaseUrl, serviceKey,
        `profiles?user_id=eq.${encodeURIComponent(challenge.user_id)}`,
        { welcome_bonus_used: true }
      ),
      5000
    )
  }

  // Step 8 — Stripe refund LAST.
  // Challenge is already 'completed' — even if this fails, no double refund is possible.
  // Idempotency key ensures retries never produce a second refund.
  if (refundCents > 0 && challenge.stripe_payment_intent_id && stripeKey) {
    try {
      const idempotencyKey = `refund-${challengeId}-${refundCents}`
      const refund = await withTimeout(
        stripeRefund(stripeKey, challenge.stripe_payment_intent_id, refundCents, idempotencyKey),
        5000
      )
      console.log(`[close-challenge] Refunded ${refundCents} cents for challenge ${challengeId}, status: ${refund.status}`)
    } catch (e) {
      // Challenge is already completed — do NOT revert. Flag for manual review.
      console.error(`[close-challenge] Stripe refund failed for ${challengeId}:`, e.message)
      console.error(`[close-challenge] MANUAL REVIEW REQUIRED: challenge ${challengeId} completed but refund of ${refundCents} cents failed`)
    }
  }

  console.log(`[close-challenge] Closed challenge ${challengeId}: failedDays=${failedDays}, penalty=${penaltyCents}, refund=${refundCents}`)
  return { success: true, failed_days: failedDays, penalty_cents: penaltyCents, refund_cents: refundCents }
}

exports.closeChallengeById = closeChallengeById

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const INTERNAL_SECRET = process.env.INTERNAL_SECRET

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  const authHeader = event.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
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

  // Two-lane auth: internal secret or user JWT
  const isInternal = INTERNAL_SECRET && token === INTERNAL_SECRET

  if (!isInternal) {
    // Verify JWT and check ownership
    let callerId
    try {
      callerId = await withTimeout(
        verifySupabaseJwt(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, token),
        5000
      )
    } catch {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
    }
    if (!callerId) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    // Verify the challenge belongs to this user
    const rows = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `challenges?id=eq.${encodeURIComponent(challenge_id)}&select=user_id`),
      5000
    )
    const challenge = Array.isArray(rows) ? rows[0] : null
    if (!challenge) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Challenge not found' }) }
    }
    if (challenge.user_id !== callerId) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) }
    }
  }

  try {
    const result = await closeChallengeById(
      challenge_id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
    )
    if (result.success === false) {
      return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: result.reason }) }
    }
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }
  } catch (e) {
    console.error('[close-challenge] Error:', e.message)
    const status = e.message.includes('not found') ? 404
      : e.message.includes('not active') ? 400
      : 500
    return { statusCode: status, headers: CORS, body: JSON.stringify({ error: e.message }) }
  }
}
