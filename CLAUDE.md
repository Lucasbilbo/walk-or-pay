# Walk or Pay — Project Context

## What is this
Web app where users create 7-day step challenges with real money at stake.
Steps are read automatically from Google Fit. Missing the daily goal = losing a fraction of the deposit.
First challenge gets a 2x welcome bonus on the effective stake.

## Stack
- Frontend: React + Vite (JavaScript, NO TypeScript)
- Auth + DB: Supabase
- Backend: Netlify Functions (CommonJS — always require/module.exports.handler)
- Payments: Stripe (PaymentIntent + webhook)
- Steps: Google Fit API (OAuth2 with refresh tokens)
- Deploy: Netlify (walkOrPay.netlify.app)

## Critical rules — read before touching any code

### Netlify Functions
- ALWAYS CommonJS: `const x = require('x')` and `exports.handler = async (event) => {}`
- NEVER use ES modules (no import/export) in netlify/functions/
- Validate every required env var at the START of the handler:
  ```javascript
  if (!SOME_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) }
  ```
- Add withTimeout(5000) to ALL external HTTP calls (Google, Stripe, Supabase service calls)
- CORS headers on every response including errors
- NEVER return access_token or refresh_token from Google to the frontend

### Supabase (frontend client)
- storageKey: 'walkOrPay-auth' (prevents conflicts with other Supabase apps on same domain)
- ALWAYS .maybeSingle() — NEVER .single() (single() throws on 0 rows)
- Boolean filters: use .is('column', true) not .eq('column', true)
- NEVER run Supabase queries inside onAuthStateChange callback → wrap in setTimeout(fn, 0)

### Google Fit tokens
- Tokens are stored in the `fitness_tokens` table server-side only
- NEVER expose access_token or refresh_token in any API response
- Always check token expiry in get-steps.js — refresh if < 1 minute remaining

### Stripe
- ALWAYS verify webhook signature with crypto.timingSafeEqual before processing
- Return 200 to Stripe even if our processing fails (to prevent retries)
- Use the raw event body (not parsed JSON) for signature verification

### Scheduled functions (daily-snapshot)
- Defined in netlify.toml under [functions."daily-snapshot"] schedule
- Exports the same way: exports.handler = async (event) => {}
- Runs at 00:05 UTC daily

## Database schema

### profiles
```
user_id (uuid pk, fk auth.users)
welcome_bonus_used (bool, default false)
created_at (timestamptz)
```

### fitness_tokens
```
user_id (uuid pk, fk auth.users)
access_token (text)
refresh_token (text, nullable)
expires_at (timestamptz)
```

### challenges
```
id (uuid pk)
user_id (uuid fk)
status ('pending_payment' | 'active' | 'completed')
daily_goal (int — steps)
amount_cents (int — actual deposit)
effective_amount_cents (int — amount*2 if bonus, else amount)
grace_days (int — 0 or 1)
grace_days_used (int)
welcome_bonus_applied (bool)
start_date (date)
end_date (date)
stripe_payment_intent_id (text)
penalty_cents (int, nullable)
created_at (timestamptz)
```

### daily_logs
```
id (uuid pk)
challenge_id (uuid fk)
user_id (uuid fk)
date (date)
steps (int)
goal_met (bool)
grace_day_used (bool, default false)
created_at (timestamptz)
UNIQUE (challenge_id, date)
```

### penalty_pool
```
id (uuid pk)
challenge_id (uuid fk)
user_id (uuid fk)
amount_cents (int)
created_at (timestamptz)
```

## Business logic

### Penalty calculation
- failed_days = daily_logs where goal_met = false AND grace_day_used = false
- penalty_cents = Math.round((failed_days / 7) * effective_amount_cents)
- refund_cents = amount_cents - Math.min(penalty_cents, amount_cents)

### Welcome bonus
- Only on first challenge (welcome_bonus_used = false in profiles)
- effective_amount_cents = amount_cents * 2
- At stake (risk): effective_amount_cents
- Deposit (actual charge): amount_cents
- On challenge completion: mark profiles.welcome_bonus_used = true

### Steps estimate
- minutes_estimate = Math.round((goal - steps) / 100)
- 100 steps/minute is the standard walking pace estimate

## File structure
```
walk-or-pay/
├── netlify.toml
├── package.json
├── vite.config.js
├── .env.example
├── CLAUDE.md
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── styles/globals.css
│   ├── lib/
│   │   ├── supabase.js
│   │   └── challengeLogic.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useSteps.js
│   │   └── useChallenge.js
│   ├── components/
│   │   ├── AuthScreen.jsx
│   │   ├── ConnectFitness.jsx
│   │   ├── Dashboard.jsx
│   │   └── CreateChallenge.jsx
│   └── __tests__/
│       └── challenge.test.js
└── netlify/functions/
    ├── google-auth-url.js
    ├── google-auth-callback.js
    ├── get-steps.js
    ├── create-challenge.js
    ├── stripe-webhook.js
    ├── use-grace-day.js
    ├── close-challenge.js
    └── daily-snapshot.js
```

## Dev workflow
- `netlify dev` for local development (port 8888)
- `npm test` before every commit
- `npm run build` to verify no build errors
