# Walk or Pay — Launch Guide

A complete step-by-step guide to launching on the App Store. Written for someone doing this for the first time.

---

## Prerequisites checklist

- [ ] Apple Developer account active (99€/year) ✅
- [ ] Stripe account with live mode activated (business details complete)
- [ ] Supabase project: zbqwosnlunkhrcuxwmop.supabase.co ✅
- [ ] Netlify site: walk-or-pay.netlify.app ✅
- [ ] EAS account: lucasbilbao on expo.dev ✅

---

## Step 1 — Switch Stripe to live mode

See `STRIPE_LIVE_CHECKLIST.md` for the full checklist. Summary:

### 1a. Get live keys from Stripe

1. Go to https://dashboard.stripe.com/apikeys
2. Make sure you're in **Live mode** (toggle top-left — switch from "Test mode")
3. Copy:
   - **Publishable key**: starts with `pk_live_...`
   - **Secret key**: starts with `sk_live_...` (click "Reveal")

### 1b. Update Netlify environment variables

1. Go to https://app.netlify.com/projects/walk-or-pay → **Site settings** → **Environment variables**
2. Update `STRIPE_SECRET_KEY` → paste `sk_live_...`
3. Click **Save** (do NOT update `STRIPE_WEBHOOK_SECRET` yet — do that after creating the webhook in 1c)

### 1c. Create live webhook in Stripe

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. Endpoint URL: `https://walk-or-pay.netlify.app/.netlify/functions/stripe-webhook`
4. Click **Select events** → find and add: `payment_intent.succeeded`
5. Click **Add endpoint**
6. On the webhook detail page, click **Reveal** under "Signing secret"
7. Copy the `whsec_...` value
8. Go back to Netlify → Environment variables → update `STRIPE_WEBHOOK_SECRET` → paste `whsec_...`

### 1d. Update expo-app/.env

Open `expo-app/.env` and replace the publishable key:
```
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

⚠️ Never commit this file to git. It is in `.gitignore`.

### 1e. Trigger Netlify redeploy

1. Go to https://app.netlify.com/projects/walk-or-pay → **Deploys**
2. Click **Trigger deploy** → **Deploy site**
3. Wait for the deploy to finish (green checkmark)

### 1f. Verify it's working

1. In Stripe dashboard → **Webhooks** → click your endpoint → check **Recent deliveries**
2. After the next real payment, you should see a `payment_intent.succeeded` event with status 200
3. Check Supabase → Table Editor → `challenges` — the challenge should have `status = active`

---

## Step 2 — EAS Production Build

The production build uses a different provisioning profile (App Store distribution, not Ad Hoc).

### 2a. Make sure expo-app/.env has `pk_live_` (done in Step 1d)

### 2b. Run the build

```bash
cd expo-app
eas build --platform ios --profile production
```

- EAS will upload your project and build it on Expo's servers
- Takes 10–20 minutes
- You'll get a link to track progress: https://expo.dev/accounts/lucasbilbao/projects/walk-or-pay/builds

### 2c. When the build finishes

Option A — Submit directly from EAS (easiest):
```bash
eas submit --platform ios --latest
```
This uploads the build to App Store Connect automatically. Skip to Step 4.

Option B — Download and upload manually:
1. Go to https://expo.dev/accounts/lucasbilbao/projects/walk-or-pay/builds
2. Click the finished build → **Download**
3. You get a `.ipa` file — upload it via Transporter app (free on Mac App Store) or Xcode → Organizer

### 2d. Check app.json before building

Make sure these are correct in `expo-app/app.json`:
- `version`: bump this for each submission (e.g. `"1.0.0"`)
- `ios.buildNumber`: must increment each submission (e.g. `"1"`, then `"2"`, etc.)
- `ios.bundleIdentifier`: `"com.walkorpay.app"`

---

## Step 3 — App Store Connect setup

### 3a. Create the app

1. Go to https://appstoreconnect.apple.com
2. Click **My Apps** → **+** → **New App**
3. Fill in:
   - **Platforms**: iOS
   - **Name**: `Walk or Pay: Step Challenge` (max 30 chars)
   - **Primary language**: English (U.S.)
   - **Bundle ID**: select `com.walkorpay.app` from the dropdown (it appears after your first EAS build registers it)
   - **SKU**: `walkorpay` (internal ID, not shown to users)
   - **User access**: Full access

### 3b. Fill in the App Store listing

Go to your app → **App Store** tab → version (e.g. 1.0).

Use `APP_STORE_LISTING.md` for all copy. Key fields:

| Field | Value |
|-------|-------|
| Name | Walk or Pay: Step Challenge |
| Subtitle | Put money on your daily steps |
| Description | (see APP_STORE_LISTING.md) |
| Keywords | step counter,walking,fitness,accountability,challenge,health,steps,pedometer,walk,habit |
| Support URL | https://walk-or-pay.netlify.app |
| Marketing URL | https://walk-or-pay.netlify.app |
| Privacy Policy URL | https://walk-or-pay.netlify.app/privacy |

### 3c. Screenshots

Apple requires screenshots for specific device sizes. Required for iOS 18:

| Size | Device |
|------|--------|
| 6.9" | iPhone 16 Pro Max (1320 × 2868 px) |
| 6.5" | iPhone 14 Plus or 11 Pro Max (1284 × 2778 px) |
| 5.5" | iPhone 8 Plus (1242 × 2208 px) — optional but recommended |
| 12.9" iPad | Required only if you support iPad |

**How to take screenshots:**

Option A — From EAS dev build on your iPhone:
1. Run the app on your iPhone
2. Navigate to each screen you want to screenshot
3. Press Side button + Volume Up to capture
4. Screenshots are in Photos app — AirDrop to Mac
5. Upload directly (iPhone 15 Pro Max counts as 6.7", may need to resize)

Option B — Xcode Simulator (easiest for exact sizes):
1. Open Xcode → open Simulator → select "iPhone 16 Pro Max"
2. Run the app via `npx expo start --dev-client` (or use your EAS dev build)
3. Take screenshots with Cmd+S in Simulator
4. Files saved to Desktop

You need at least **3 screenshots per size**. Recommended screens:
1. Dashboard with active challenge and steps
2. Step goal selection (CreateChallenge step 1)
3. Challenge completed / refund summary

### 3d. Age rating

1. Go to **App Information** → **Age Rating** → **Edit**
2. Answer the questionnaire:
   - Gambling or contests: **None** (select this — even though Apple may override to 17+)
   - Simulated gambling: **None**
3. If Apple automatically sets 17+ due to the money mechanic, that's expected and acceptable

### 3e. Pricing

1. Go to **Pricing and Availability**
2. Set price to **Free** (the app itself is free; users pay into challenges via Stripe)
3. Available in all territories or restrict as needed

### 3f. App Privacy

1. Go to **App Privacy** → **Get Started**
2. Data types collected:
   - **Health & Fitness**: steps data — used for app functionality, not shared
   - **Contact info**: email address — used for authentication, not shared
   - **Identifiers**: device ID (for push notifications) — used for app functionality
3. Answer each question honestly — Apple reviews this carefully

---

## Step 4 — Upload build and submit

### 4a. Wait for build processing

After uploading (via `eas submit` or Transporter):
1. Go to App Store Connect → your app → **TestFlight** tab
2. The build appears under "iOS Builds" — status starts as "Processing" (takes 5–30 minutes)
3. When it shows a green checkmark, it's ready to submit

### 4b. Attach build to the version

1. Go to **App Store** tab → your version (1.0)
2. Scroll to **Build** section → click **+** → select the processed build

### 4c. Pre-submission checklist

Before clicking Submit for Review:
- [ ] All screenshot sizes uploaded
- [ ] Description, keywords, subtitle filled in
- [ ] Privacy Policy URL live and accessible
- [ ] Age rating set
- [ ] Pricing set to Free
- [ ] Build attached to the version
- [ ] `expo-notifications` permission text set in app.json under `ios.infoPlist.NSHealthShareUsageDescription`
- [ ] The app works end-to-end with live Stripe keys

### 4d. Submit for Review

1. Click **Add for Review** → review the submission summary
2. Click **Submit to App Review**
3. Apple will send an email confirmation

### 4e. What happens during review (1–3 business days)

- Apple reviewers manually test the app
- They will try to create a challenge and make a payment — provide a **test account** in the review notes if needed
- Common questions: "How does the money work? Where does it go?"
- You can add notes for the reviewer in the submission form under "App Review Information"

**Reviewer notes to include:**
```
This app lets users set a daily step goal and deposit money as a commitment.
If they miss their goal, a proportional share is donated to charity.
To test: create an account via magic link email, then create a challenge using
Stripe test card 4242 4242 4242 4242, exp 12/34, CVC 123.
Note: Apple Health permissions are required for step tracking.
```

### 4f. Common rejection reasons

| Rejection reason | Fix |
|-----------------|-----|
| Guideline 4.2 — Minimum functionality | Add more features or clearer onboarding |
| Guideline 3.1 — Payments outside IAP | Justify why Stripe is used (it's a deposit/commitment, not a purchase) |
| Privacy policy missing or incomplete | Make sure /privacy is live and covers all data collected |
| Crashes on reviewer's device | Check crash logs in Xcode Organizer / Crashlytics |
| Push notifications without permission prompt | Make sure the permission request fires correctly |

**If rejected:** Read the rejection message carefully. Reply via App Store Connect Resolution Center — you can ask for clarification. Most rejections are resolved in 1–2 exchanges.

---

## Step 5 — After approval

### 5a. Set release date

When Apple approves the app:
1. Go to App Store Connect → your version → **Availability**
2. Choose: **Manually release** (recommended — gives you control) or **Automatically release**
3. Click **Release** when ready

### 5b. Monitor crashes

- **Xcode Organizer**: Xcode → Window → Organizer → Crashes — shows symbolicated crash reports
- **Expo**: https://expo.dev/accounts/lucasbilbao/projects/walk-or-pay → check build logs
- **Supabase logs**: https://supabase.com/dashboard/project/zbqwosnlunkhrcuxwmop → Logs → API

### 5c. Monitor payments

- Stripe dashboard: https://dashboard.stripe.com/payments — live payments appear here
- Stripe webhooks: https://dashboard.stripe.com/webhooks — check delivery success rate
- If a webhook fails (non-200), Stripe retries automatically for 72 hours

### 5d. Respond to user reviews

1. Go to App Store Connect → your app → **Ratings and Reviews**
2. Reply to all reviews — Apple shows your replies publicly
3. For 1-star reviews: acknowledge the issue, explain what you're doing about it
4. For feature requests: thank them and consider adding to backlog

### 5e. Releasing updates

For each update:
1. Bump `version` and `ios.buildNumber` in `expo-app/app.json`
2. Run `eas build --platform ios --profile production`
3. Run `eas submit --platform ios --latest`
4. Go to App Store Connect → create new version → attach build → submit

---

## Emergency contacts / URLs

| Service | URL |
|---------|-----|
| Stripe dashboard | https://dashboard.stripe.com |
| Stripe webhooks | https://dashboard.stripe.com/webhooks |
| Netlify | https://app.netlify.com/projects/walk-or-pay |
| Netlify function logs | https://app.netlify.com/projects/walk-or-pay/logs/functions |
| Supabase | https://supabase.com/dashboard/project/zbqwosnlunkhrcuxwmop |
| EAS builds | https://expo.dev/accounts/lucasbilbao/projects/walk-or-pay/builds |
| App Store Connect | https://appstoreconnect.apple.com |
| Apple Developer portal | https://developer.apple.com/account |
| Expo push notifications tool | https://expo.dev/notifications |
