const https = require('https')
const crypto = require('crypto')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Always 200 to Stripe — prevents indefinite retries on our errors
const ACK = { statusCode: 200, headers: CORS, body: JSON.stringify({ received: true }) }

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

// Verify Stripe webhook signature using raw body — must be called before JSON.parse
function constructStripeEvent(rawBody, sig, secret) {
  const TOLERANCE_SECONDS = 300

  const parts = sig.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=')
    if (k && v) acc[k] = v
    return acc
  }, {})

  const timestamp = parts['t']
  const v1 = parts['v1']
  if (!timestamp || !v1) throw new Error('Missing signature components')

  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (age > TOLERANCE_SECONDS) throw new Error('Stripe webhook timestamp too old')

  const signedPayload = `${timestamp}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex')

  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(v1, 'hex')

  if (expectedBuf.length !== receivedBuf.length) throw new Error('Signature length mismatch')
  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) throw new Error('Signature mismatch')

  return JSON.parse(rawBody)
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stripe-webhook] Missing required env vars')
    return ACK // still 200 — Stripe must not retry indefinitely
  }

  const sig = event.headers['stripe-signature'] || ''
  if (!sig) {
    console.error('[stripe-webhook] Missing Stripe-Signature header')
    return ACK
  }

  // Raw body — must NOT be parsed before verification
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : (event.body || '')

  let stripeEvent
  try {
    stripeEvent = constructStripeEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    console.error('[stripe-webhook] Signature verification failed:', e.message)
    return ACK
  }

  console.log('[stripe-webhook] Event received:', stripeEvent.type)

  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return ACK
  }

  const pi = stripeEvent.data.object
  const paymentIntentId = pi.id

  try {
    // Find the challenge by payment intent id
    const rows = await withTimeout(
      supabaseGet(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `challenges?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=id,user_id,status,welcome_bonus_applied`),
      5000
    )
    const challenge = Array.isArray(rows) ? rows[0] : null

    if (!challenge) {
      console.error('[stripe-webhook] No challenge found for payment_intent:', paymentIntentId)
      return ACK
    }

    if (challenge.status === 'active') {
      console.log('[stripe-webhook] Challenge already active, skipping:', challenge.id)
      return ACK
    }

    // Calculate start/end dates
    const startDate = new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 6)

    // Activate challenge
    await withTimeout(
      supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        `challenges?id=eq.${encodeURIComponent(challenge.id)}`,
        {
          status: 'active',
          start_date: toDateStr(startDate),
          end_date: toDateStr(endDate),
        }
      ),
      5000
    )
    console.log(`[stripe-webhook] Activated challenge ${challenge.id}: ${toDateStr(startDate)} → ${toDateStr(endDate)}`)

    // Ensure profile exists — PK is user_id
    // Only set welcome_bonus_used: false on insert; don't overwrite if already true
    await withTimeout(
      supabaseUpsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'profiles',
        { user_id: challenge.user_id }
      ),
      5000
    )

  } catch (e) {
    console.error('[stripe-webhook] Error processing payment_intent.succeeded:', e.message)
    // Fall through — always return 200 to Stripe
  }

  return ACK
}
