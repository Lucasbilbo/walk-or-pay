
# Walk or Pay — Session Log

## Session: 2026-04-21

### What we did
Full end-to-end audit and test of the app on a real iPhone.

### Bugs fixed
- close-challenge.js:181 — PATCH profiles used `?id=eq.` instead of `?user_id=eq.` → welcome_bonus could be claimed twice (CRITICAL)
- DashboardScreen.js — $ symbol changed to €
- DashboardScreen.js — 4 occurrences of `.toISOString().split('T')[0]` replaced with `getLocalDateString()` helper to fix UTC date offset for users in UTC+1/+2
- App.js — Stripe publishableKey was hardcoded, moved to EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in expo-app/.env
- CreateChallengeScreen.js — amountDollars renamed to amountEuros
- expo-app/.gitignore — .env was not ignored, now it is

### Features added
- Push notifications: save-push-token.js + DashboardScreen registers token + daily-snapshot sends reminder when steps < 70% of goal
- Completed challenge summary screen (English) with days completed, penalty, refund, donation message
- Privacy Policy (/privacy) and Terms of Service (/terms) on the web
- supabase/migrations/001_initial_schema.sql — full schema versioned for the first time
- supabase/README.md — how to apply migrations on a new project

### Infrastructure resolved
- EAS Build configured (eas.json, expo-dev-client installed, project linked to lucasbilbao/walk-or-pay on expo.dev)
- Device registered on Apple Developer via EAS
- Development build installed directly on iPhone (no Expo Go — HealthKit requires native build)
- Supabase schema confirmed: all 6 tables exist with correct columns (log_date ✅, push_token added to profiles ✅)
- RLS enabled on all tables ✅
- Stripe keys mismatch resolved: both backend (Netlify) and frontend (expo-app/.env) now use same Stripe test account (51TJK3G...)

### Key decisions made
- Payment strategy: @stripe/stripe-react-native in-app (NOT web browser redirect) — legal for physical commitment services
- Penalty money destination: donated to a charitable cause (ONG TBD) — better for App Store approval and marketing
- iOS first, Android later

### Current environment
- Stripe: TEST mode (sk_test_51TJK3G... in Netlify, pk_test_51TJK3G... in expo-app/.env)
- Supabase: zbqwosnlunkhrcuxwmop.supabase.co (production project, Walk or Pay only)
- EAS project: lucasbilbao/walk-or-pay (expo.dev)
- Bundle ID: com.walkorpay.app
- Scheme: walkorpay
- Last commit: pending audit results

### What's pending (manual — your side)
- [ ] Choose ONG for penalty donations (update text in app when decided)
- [ ] Stripe LIVE mode: change sk_test_ → sk_live_ in Netlify + pk_test_ → pk_live_ in expo-app/.env + update STRIPE_WEBHOOK_SECRET with live webhook secret
- [ ] App Store Connect: create app listing, upload screenshots, set Privacy Policy URL (walk-or-pay.netlify.app/privacy) and Terms URL (walk-or-pay.netlify.app/terms)
- [ ] EAS production build: `eas build --platform ios --profile production`
- [ ] Apple Developer: check provisioning profiles are active

### What's pending (development)
- [ ] Audit results from Code (running as of this session end)
- [ ] App Store screenshots (iPhone 6.7" and 6.5")
- [ ] App Store listing copy (title, subtitle, description, keywords)
- [ ] Stripe live mode switch
- [ ] Android build (post iOS launch)
- [ ] ONG integration or manual donation process

### How to run locally
```bash
# Web
cd walk-or-pay && netlify dev

# iOS app (requires iPhone connected or EAS build)
cd expo-app && npx expo start --dev-client --tunnel
```

## Session continued — same day

### Additional features built
- OnboardingScreen: 3-slide intro, shown only on first launch (AsyncStorage)
- ProfileScreen: shows email, sign out, delete account (required by Apple)
- delete-account.js: deletes all user data in correct FK order + removes auth user
- HistoryScreen: lists all completed challenges with refund amounts
- Loading states and error handling on all screens (DashboardScreen, CreateChallengeScreen, LoginScreen)
- APP_STORE_LISTING.md created with full App Store copy

### Next session priorities
1. Run new EAS dev build (many screens changed since last build)
2. Full flow test on iPhone with new build
3. Switch Stripe to live mode
4. EAS production build
5. App Store Connect submission

### Known gotchas learned this session
- Expo Go does NOT work — HealthKit uses NitroModules, requires EAS dev build
- Mac disk space needed for local iOS build: 8-10GB minimum (use EAS if disk is full)
- Stripe keys must be from the SAME Stripe account in both Netlify and expo-app/.env
- PaymentIntents created with live keys cannot be confirmed with test keys — always match environments
- daily-snapshot can be triggered manually: `curl -X POST https://walk-or-pay.netlify.app/.netlify/functions/daily-snapshot`
- To force challenge close for testing: UPDATE challenges SET end_date = CURRENT_DATE - INTERVAL '1 day' WHERE status = 'active'
- EAS login with Apple SSO: use `eas login --sso` not `eas login`
