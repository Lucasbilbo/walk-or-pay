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

function supabaseInsert(supabaseUrl, serviceKey, table, body) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve, reject) => {
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
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { reject(new Error('Parse error')) } })
    })
    req.on('error', reject)
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

function stripeCreatePaymentIntent(secretKey, amountCents, metadata) {
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    'metadata[challenge_id]': metadata.challenge_id,
    'metadata[user_id]': metadata.user_id,
    'metadata[welcome_bonus_applied]': String(metadata.welcome_bonus_applied),
    'metadata[daily_goal]': String(metadata.daily_goal),
    'metadata[effective_amount_cents]': String(metadata.effective_amount_cents),
  }).toString()
  const auth = Buffer.from(`${secretKey}:`).toString('base64')
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com', path: '/v1/payment_intents', method: 'POST',
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
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

  const { daily_goal, amount_cents, grace_days } = parsed

  // Input validation
  if (!daily_goal || daily_goal < 1000 || daily_goal > 50000) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'daily_goal must be between 1,000 and 50,000' }) }
  }
  if (!amount_cents || amount_cents < 500 || amount_cents > 10000) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'amount_cents must be between 500 (5€) and 10000 (100€)' }) }
  }
  if (![0, 1].includes(grace_days)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'grace_days must be 0 or 1' }) }
  }

  // Verify fitness token exists
  let fitnessTokens
  try {
    fitnessTokens = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `fitness_tokens?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`),
      5000
    )
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to check fitness connection' }) }
  }
  if (!Array.isArray(fitnessTokens) || fitnessTokens.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Connect Google Fit first' }) }
  }

  // Check welcome bonus
  let profile
  try {
    const profiles = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `profiles?user_id=eq.${encodeURIComponent(user.id)}&select=welcome_bonus_used`),
      5000
    )
    profile = Array.isArray(profiles) ? profiles[0] : null
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to load profile' }) }
  }

  // welcome_bonus_used defaults to false for new users (profile may not exist yet)
  const welcomeBonusUsed = profile?.welcome_bonus_used === true
  const welcomeBonusApplied = !welcomeBonusUsed
  const effectiveAmountCents = welcomeBonusApplied ? amount_cents * 2 : amount_cents

  // Calculate dates
  const today = new Date().toISOString().split('T')[0]
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 6)
  const endDateStr = endDate.toISOString().split('T')[0]

  // Insert challenge with pending_payment status
  let challenge
  try {
    const res = await withTimeout(
      supabaseInsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'challenges', {
        user_id: user.id,
        status: 'pending_payment',
        daily_goal,
        amount_cents,
        effective_amount_cents: effectiveAmountCents,
        grace_days,
        grace_days_used: 0,
        welcome_bonus_applied: welcomeBonusApplied,
        start_date: today,
        end_date: endDateStr,
      }),
      5000
    )
    if (res.status !== 201 || !Array.isArray(res.body) || !res.body[0]) {
      throw new Error('Insert failed')
    }
    challenge = res.body[0]
  } catch (e) {
    console.error('[create-challenge] DB insert failed:', e.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to create challenge' }) }
  }

  // Create Stripe PaymentIntent
  let paymentIntent
  try {
    const stripeRes = await withTimeout(
      stripeCreatePaymentIntent(STRIPE_SECRET_KEY, amount_cents, {
        challenge_id: challenge.id,
        user_id: user.id,
        welcome_bonus_applied: welcomeBonusApplied,
        daily_goal: daily_goal,
        effective_amount_cents: effectiveAmountCents,
      }),
      5000
    )
    if (stripeRes.status !== 200 || !stripeRes.body.client_secret) {
      throw new Error(stripeRes.body?.error?.message || 'Stripe error')
    }
    paymentIntent = stripeRes.body
  } catch (e) {
    console.error('[create-challenge] Stripe error:', e.message)
    // Clean up the pending challenge
    await supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      `challenges?id=eq.${challenge.id}`, { status: 'cancelled' })
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Payment setup failed' }) }
  }

  // Link payment intent to challenge
  await supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    `challenges?id=eq.${challenge.id}`,
    { stripe_payment_intent_id: paymentIntent.id }
  )

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_secret: paymentIntent.client_secret,
      challenge_id: challenge.id,
      effective_amount_cents: effectiveAmountCents,
      welcome_bonus_applied: welcomeBonusApplied,
    }),
  }
}
