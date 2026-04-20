# Supabase — Walk or Pay

## Production project

- **URL:** `https://zbqwosnlunkhrcuxwmop.supabase.co`
- **Dashboard:** https://app.supabase.com/project/zbqwosnlunkhrcuxwmop

## Applying migrations to a new project

### Option 1 — Supabase SQL Editor (simplest)

1. Go to your project dashboard → **SQL Editor**
2. Open `supabase/migrations/001_initial_schema.sql`
3. Paste the entire contents and click **Run**

### Option 2 — Supabase CLI

```bash
# Install CLI if needed
npm install -g supabase

# Link to your project (get the ref from the project URL)
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

### Option 3 — psql direct

```bash
psql "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" \
  -f supabase/migrations/001_initial_schema.sql
```

## Schema overview

| Table | Description |
|-------|-------------|
| `profiles` | One row per user. Tracks `welcome_bonus_used` and `push_token` for notifications. Auto-created by trigger on signup. |
| `challenges` | One challenge per user at a time. Status flow: `pending_payment` → `active` → `completed`. |
| `daily_logs` | One row per `(challenge_id, log_date)`. Unique constraint prevents duplicates. |
| `fitness_tokens` | Google Fit OAuth tokens. Server-side only — no RLS SELECT for users. |
| `penalty_pool` | Records penalty amounts when challenges close with failed days. |
| `user_tokens` | Personal tokens for the iOS Shortcut step-logging flow (no session JWT required). |

## RLS summary

All tables have Row Level Security enabled. Users can only access their own rows.
`fitness_tokens` has no user-facing SELECT policy — only the service role key can read tokens.
Server-side operations (Netlify Functions) use `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS.

## Notes

- `daily_logs` uses `log_date DATE` (not `date` — reserved word)
- `profiles` PK is `user_id` (not `id`)
- `fitness_tokens` PK is `user_id`
- `user_tokens.user_id` has a UNIQUE constraint (one token per user)
