const https = require('https')
const crypto = require('crypto')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function withTimeout(promise, ms) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  )
  return Promise.race([promise, timer])
}

// Stripe signature verification — same pattern as TriCoach
function verifyStripeSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false
  const parts = signature.split(',')
  const tPart = parts.find(p => p.startsWith('t='))
  const v1Part = parts.find(p => p.startsWith('v1='))
  if (!tPart || !v1Part) return false
  const t = tPart.slice(2)
  const v1 = v1Part.slice(3)
  const payload = `${t}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
  } catch {
    return false
  }
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

function supabaseGetUser(supabaseUrl, serviceKey, userId) {
  const hostname = new URL(supabaseUrl).hostname
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      method: 'GET',
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

function sendEmail(resendApiKey, to, subject, html) {
  const bodyStr = JSON.stringify({ from: 'Walk or Pay <noreply@walkOrPay.app>', to, subject, html })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const RESEND_API_KEY = process.env.RESEND_API_KEY // optional — email skipped if not set

  if (!STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  }

  // Always use the raw body for signature verification
  const rawBody = event.body || ''
  const signature = event.headers['stripe-signature'] || ''

  if (!verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
    console.error('[stripe-webhook] Invalid signature')
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid signature' }) }
  }

  let stripeEvent
  try {
    stripeEvent = JSON.parse(rawBody)
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  console.log('[stripe-webhook] Event received:', stripeEvent.type)

  // ── payment_intent.succeeded → activate challenge ──────────────────────
  if (stripeEvent.type === 'payment_intent.succeeded') {
    const pi = stripeEvent.data?.object
    const challengeId = pi?.metadata?.challenge_id
    const userId = pi?.metadata?.user_id
    const welcomeBonusApplied = pi?.metadata?.welcome_bonus_applied === 'true'

    if (challengeId && userId) {
      try {
        const today = new Date().toISOString().split('T')[0]
        const endDate = new Date(today)
        endDate.setDate(endDate.getDate() + 6)

        await withTimeout(
          supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
            `challenges?id=eq.${challengeId}`, {
              status: 'active',
              start_date: today,
              end_date: endDate.toISOString().split('T')[0],
            }),
          5000
        )
        console.log('[stripe-webhook] Challenge activated:', challengeId)

        // Send confirmation email if Resend is configured
        if (RESEND_API_KEY) {
          try {
            const userData = await withTimeout(supabaseGetUser(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, userId), 5000)
            const email = userData?.email
            if (email) {
              const dailyGoal = pi?.metadata?.daily_goal ? Number(pi.metadata.daily_goal) : null
              const effectiveCents = pi?.metadata?.effective_amount_cents ? Number(pi.metadata.effective_amount_cents) : null
              const goalStr = dailyGoal ? dailyGoal.toLocaleString() : 'your'
              const stakeStr = effectiveCents ? `$${(effectiveCents / 100).toFixed(2)}` : 'your stake'
              await withTimeout(sendEmail(
                RESEND_API_KEY,
                email,
                'Your Walk or Pay challenge has started! 🚶',
                `<p>Your 7-day challenge is live. Your daily goal is <strong>${goalStr} steps</strong>.</p>
                 <p>At stake: <strong>${stakeStr}</strong></p>
                 <p>Good luck! <a href="https://walkOrPay.netlify.app">View your dashboard</a></p>`
              ), 5000)
              console.log('[stripe-webhook] Confirmation email sent to:', email)
            }
          } catch (e) {
            console.error('[stripe-webhook] Email send failed (non-blocking):', e.message)
          }
        }

        if (welcomeBonusApplied) {
          // Ensure profile row exists and mark bonus as used
          await withTimeout(
            supabaseUpsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'profiles', {
              user_id: userId,
              welcome_bonus_used: true,
            }),
            5000
          )
          console.log('[stripe-webhook] Welcome bonus marked used for user:', userId)
        }
      } catch (e) {
        console.error('[stripe-webhook] Failed to activate challenge:', e.message)
        // Return 200 anyway — Stripe must not retry this event
      }
    }
  }

  // ── payment_intent.payment_failed → mark challenge cancelled ────────────
  if (stripeEvent.type === 'payment_intent.payment_failed') {
    const pi = stripeEvent.data?.object
    const challengeId = pi?.metadata?.challenge_id
    if (challengeId) {
      try {
        await withTimeout(
          supabasePatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
            `challenges?id=eq.${challengeId}`, { status: 'cancelled' }),
          5000
        )
        console.log('[stripe-webhook] Challenge cancelled (payment failed):', challengeId)
      } catch (e) {
        console.error('[stripe-webhook] Failed to cancel challenge:', e.message)
      }
    }
  }

  // Always return 200 to Stripe to acknowledge receipt
  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true }),
  }
}
