const https = require('https')

// No CORS headers needed — this is a redirect endpoint
const REDIRECT_HEADERS = { 'Access-Control-Allow-Origin': '*' }

function withTimeout(promise, ms) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  )
  return Promise.race([promise, timer])
}

function httpsPost(hostname, path, formBody) {
  const data = formBody.toString()
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { reject(new Error('Parse error')) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function supabaseUpsert(supabaseUrl, serviceKey, body) {
  const hostname = new URL(supabaseUrl).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: '/rest/v1/fitness_tokens',
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        // Upsert on user_id conflict
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: REDIRECT_HEADERS, body: '' }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const APP_URL = process.env.APP_URL

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !APP_URL) {
    return { statusCode: 500, body: 'Server misconfigured' }
  }

  const params = event.queryStringParameters || {}
  const { code, state, error: oauthError } = params

  if (oauthError) {
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=${encodeURIComponent(oauthError)}` }, body: '' }
  }
  if (!code || !state) {
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=missing_params` }, body: '' }
  }

  // Decode state to recover userId
  let stateData
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
  } catch {
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=invalid_state` }, body: '' }
  }
  const { userId } = stateData
  if (!userId) {
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=invalid_state` }, body: '' }
  }

  // Exchange authorization code for tokens
  const redirectUri = `${APP_URL}/.netlify/functions/google-auth-callback`
  let tokenRes
  try {
    tokenRes = await withTimeout(
      httpsPost('oauth2.googleapis.com', '/token', new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })),
      5000
    )
  } catch (e) {
    console.error('[google-auth-callback] Token exchange error:', e.message)
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=token_exchange_failed` }, body: '' }
  }

  if (tokenRes.status !== 200 || !tokenRes.body.access_token) {
    console.error('[google-auth-callback] Token exchange failed:', tokenRes.body)
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=token_invalid` }, body: '' }
  }

  const { access_token, refresh_token, expires_in } = tokenRes.body
  const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString()

  // Save tokens server-side only — NEVER return access_token or refresh_token to client
  try {
    await withTimeout(
      supabaseUpsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        user_id: userId,
        access_token,
        refresh_token: refresh_token || null,
        expires_at: expiresAt,
      }),
      5000
    )
  } catch (e) {
    console.error('[google-auth-callback] Supabase upsert error:', e.message)
    return { statusCode: 302, headers: { Location: `${APP_URL}/?google_error=save_failed` }, body: '' }
  }

  // Redirect back to app — frontend detects ?google_connected=true
  return {
    statusCode: 302,
    headers: { Location: `${APP_URL}/?google_connected=true` },
    body: '',
  }
}
