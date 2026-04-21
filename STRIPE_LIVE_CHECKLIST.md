# Stripe Live Mode Checklist

## Steps to switch from test to live

### 1. Netlify environment variables (Site settings → Environment variables)
- [ ] STRIPE_SECRET_KEY → sk_live_... (from dashboard.stripe.com/apikeys)
- [ ] STRIPE_WEBHOOK_SECRET → whsec_... (from live webhook endpoint signing secret)

### 2. expo-app/.env
- [ ] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY → pk_live_... (from dashboard.stripe.com/apikeys)

### 3. Stripe Dashboard
- [ ] Create live webhook endpoint: https://walk-or-pay.netlify.app/.netlify/functions/stripe-webhook
- [ ] Add event: payment_intent.succeeded
- [ ] Copy signing secret → update STRIPE_WEBHOOK_SECRET in Netlify
- [ ] Activate Stripe account (business details complete)

### 4. After switching
- [ ] Trigger new Netlify deploy
- [ ] Run EAS production build with pk_live_ in .env
- [ ] Test with a real card (small amount)
- [ ] Verify challenge goes active in Supabase
- [ ] Verify webhook logs in Stripe dashboard

## ⚠️ Important
- pk_live_ and sk_live_ must be from the SAME Stripe account
- Never commit live keys to git
- Delete any pending_payment challenges in Supabase before testing live
