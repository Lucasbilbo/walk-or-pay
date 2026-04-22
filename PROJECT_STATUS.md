# Walk or Pay — Project Status

## Current Status (April 22, 2026)
🟡 APP IN APPLE REVIEW — submitted April 22, 2026. Expected decision: 1-3 days.

## Product
Walk or Pay is an iOS app where users create 7-day step challenges with real money at stake.
If they miss their daily step goal, they lose a proportional share of their deposit.
Penalties are donated to a charitable cause (ONG TBD).

## Stack
- Frontend: React + Vite (web, legacy) + Expo/React Native (iOS app — primary)
- Backend: Netlify Functions (CommonJS)
- Database: Supabase (zbqwosnlunkhrcuxwmop.supabase.co)
- Payments: Stripe (LIVE mode active)
- Steps: Apple HealthKit (iOS), Google Fit (Android, future)
- Deploy: Netlify (walk-or-pay.netlify.app) + EAS (expo.dev)
- Bundle ID: com.walkorpay.app / Scheme: walkorpay

## App Screens (all complete)
- OnboardingScreen — 3 slides, shown only on first launch
- LoginScreen — magic link via Supabase
- DashboardScreen — steps from HealthKit, progress, weekly view, stats, grace day
- CreateChallengeScreen — 4-step flow: goal → amount → grace day → pay
- HistoryScreen — completed challenges with refund amounts
- ProfileScreen — email, sign out, delete account (required by Apple)
- CompletedScreen — summary with penalty, refund, donation message

## Netlify Functions (all complete)
- create-challenge.js — creates Stripe PaymentIntent + challenge record
- stripe-webhook.js — activates challenge on payment_intent.succeeded
- close-challenge.js — calculates penalty, issues Stripe refund, records penalty_pool
- daily-snapshot.js — cron 00:05 UTC, reads HealthKit steps, closes finished challenges
- evening-reminder.js — cron 17:00 UTC, sends push notification if steps < 70% goal
- get-steps.js — fetches steps from Google Fit (Android)
- google-auth-url.js / google-auth-callback.js — Google OAuth flow
- use-grace-day.js — marks grace day used
- save-push-token.js — saves Expo push token to profiles
- delete-account.js — deletes all user data + auth user (Apple requirement)
- generate-user-token.js — generates token for iOS Shortcut integration
- shortcut-log-steps.js — receives steps from iOS Shortcut

## Database Tables
- profiles: user_id (PK), welcome_bonus_used, push_token, created_at
- challenges: id, user_id, status (pending_payment/active/closing/completed/cancelled), daily_goal, amount_cents, effective_amount_cents, grace_days, grace_days_used, welcome_bonus_applied, start_date, end_date, stripe_payment_intent_id, penalty_cents
- daily_logs: id, challenge_id, user_id, log_date (NOT date), steps, goal_met, grace_day_used
- fitness_tokens: user_id (PK), access_token, refresh_token, expires_at
- penalty_pool: id, challenge_id, user_id, amount_cents
- user_tokens: id, user_id, token (unique)
- RLS enabled on all tables. fitness_tokens has no frontend policies (service_role only).

## Environment Variables
Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (live), STRIPE_WEBHOOK_SECRET (live), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL, RESEND_API_KEY
expo-app/.env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (live)
All Stripe keys are LIVE mode.

## Security (Opus 4 Audit — April 22, 2026)
All critical issues fixed:
- ✅ CRIT-1: Welcome bonus race condition — conditional PATCH with welcome_bonus_used=false guard
- ✅ CRIT-2: Double refund — atomic status lock (closing) before any calculation
- ✅ CRIT-3: Operation reorder — DB writes before Stripe refund call
- ✅ CRIT-4: effective_amount_cents validation — recomputed from source fields
- ✅ CRIT-5: Google Fit step bounds — clamped to [0, 80000]
- ✅ HIGH-4: Stripe idempotency key on refund calls
Pending (post-launch): HIGH-1 (webhook replay window), HIGH-2 (penalty_pool reconciliation), HIGH-3 (encrypt Google tokens)

## App Store Connect
- App ID: 6762873126
- Bundle: com.walkorpay.app
- Status: In Review
- Privacy Policy: https://walk-or-pay.netlify.app/privacy
- Terms: https://walk-or-pay.netlify.app/terms
- Reviewer account: reviewer@walkorpay.com / ReviewWalkOrPay2026
- Age rating: 4+ (no gambling questions answered yes)
- Category: Health & Fitness / Lifestyle

## EAS
- Account: lucasbilbao (expo.dev)
- Project ID: 68f3fa5e-de7e-4d3c-abb7-9eab0879884c
- Production build: ggGqPtoneUwUfLAQz3Gi8L (submitted via Transporter)

## Business Logic
- penalty_cents = Math.round((failedDays / 7) * effective_amount_cents)
- refund_cents = amount_cents - min(penalty_cents, amount_cents)
- Welcome bonus: effective_amount_cents = amount_cents * 2 (first challenge only)
- Grace day: one free missed day per challenge (optional)
- Step bounds: [0, 80000] — values outside are clamped to 0

## Pending — Before/After Launch

### If Apple rejects:
- Most likely reason: Stripe payments (Guideline 3.1.1)
- Response: "Walk or Pay facilitates real-world physical activity commitments. The deposit is the user's own money, returned proportionally based on compliance. This is a financial commitment service, not a digital good or in-app purchase."

### Post-launch development:
- [ ] Android build (Play Store)
- [ ] Email notifications with Resend (challenge started, daily reminder, challenge closed)
- [ ] Choose ONG for penalty donations and update app text
- [ ] Encrypt Google Fit refresh tokens (HIGH-3 from security audit)
- [ ] App icon update: replace $ with € (logo needs redesign)
- [ ] HIGH-1: Reduce Stripe webhook replay window from 300s to 150s
- [ ] HIGH-2: Reconcile penalty_pool with actual Stripe refund amounts

### Known gotchas:
- Expo Go does NOT work — HealthKit requires EAS dev build
- Mac needs 8-10GB free for local iOS build — use EAS if disk is full
- Stripe keys must be from SAME account in both Netlify and expo-app/.env
- PaymentIntents created with live keys cannot be confirmed with test keys
- daily-snapshot manual trigger: curl -X POST https://walk-or-pay.netlify.app/.netlify/functions/daily-snapshot
- Force challenge close for testing: UPDATE challenges SET end_date = CURRENT_DATE - INTERVAL '1 day' WHERE status = 'active'
- EAS login with Apple SSO: use eas login --sso
- To run dev app: cd expo-app && npx expo start --dev-client --lan (or --tunnel if WiFi blocks)

## Key URLs
- Netlify: app.netlify.com/projects/walk-or-pay
- Supabase: supabase.com/dashboard/project/zbqwosnlunkhrcuxwmop
- Stripe: dashboard.stripe.com (live mode)
- EAS: expo.dev/accounts/lucasbilbao/projects/walk-or-pay
- App Store Connect: appstoreconnect.apple.com/apps/6762873126
- GitHub: github.com/Lucasbilbo/walk-or-pay
