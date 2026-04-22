-- =============================================================================
-- Walk or Pay — Initial Schema
-- Apply with: supabase db push  OR  paste into Supabase SQL Editor
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- Auto-created by handle_new_user trigger on auth.users INSERT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  welcome_bonus_used BOOLEAN NOT NULL DEFAULT FALSE,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own row select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profiles: own row update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenges (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL CHECK (status IN ('pending_payment', 'active', 'closing', 'completed', 'cancelled')),
  daily_goal               INTEGER NOT NULL,
  amount_cents             INTEGER NOT NULL,
  effective_amount_cents   INTEGER NOT NULL,
  grace_days               INTEGER NOT NULL DEFAULT 0,
  grace_days_used          INTEGER NOT NULL DEFAULT 0,
  welcome_bonus_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  start_date               DATE NOT NULL,
  end_date                 DATE NOT NULL,
  stripe_payment_intent_id TEXT,
  penalty_cents            INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges: own rows select"
  ON public.challenges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "challenges: own rows insert"
  ON public.challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Updates (grace day, status) are done server-side via service role key — no user UPDATE policy needed

-- ---------------------------------------------------------------------------
-- daily_logs
-- UNIQUE(challenge_id, log_date) prevents duplicate entries per day
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id   UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date       DATE NOT NULL,
  steps          INTEGER NOT NULL DEFAULT 0,
  goal_met       BOOLEAN NOT NULL DEFAULT FALSE,
  grace_day_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, log_date)
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_logs: own rows select"
  ON public.daily_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts and upserts are done server-side via service role key

-- ---------------------------------------------------------------------------
-- fitness_tokens
-- Stored server-side only — never exposed to frontend
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fitness_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fitness_tokens ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for users — tokens are accessed only via service role key
-- Frontend checks token existence via the get-steps function, never the raw token

-- ---------------------------------------------------------------------------
-- penalty_pool
-- Records the penalty amount when a challenge closes with failed days
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.penalty_pool (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.penalty_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "penalty_pool: own rows select"
  ON public.penalty_pool FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_tokens
-- Personal tokens used by the iOS Shortcut to log steps without a session JWT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_tokens: own row select"
  ON public.user_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: auto-create profile on new user signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
