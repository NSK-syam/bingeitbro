-- Trivia feature schema (weekly quiz + leaderboard).
-- Run in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.trivia_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'te', 'hi', 'ta')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0 AND duration_ms < 3600000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trivia_attempts_week_language
  ON public.trivia_attempts (week_key, language);

CREATE INDEX IF NOT EXISTS idx_trivia_attempts_rank
  ON public.trivia_attempts (week_key, language, score DESC, duration_ms ASC, created_at ASC);

ALTER TABLE public.trivia_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trivia_attempts'
      AND policyname = 'trivia_attempts_insert_self'
  ) THEN
    CREATE POLICY trivia_attempts_insert_self
      ON public.trivia_attempts
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trivia_attempts'
      AND policyname = 'trivia_attempts_select_self'
  ) THEN
    CREATE POLICY trivia_attempts_select_self
      ON public.trivia_attempts
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Submit attempt via RPC (prevents exposing the attempts table for leaderboard reads).
CREATE OR REPLACE FUNCTION public.submit_trivia_attempt(
  p_week_key TEXT,
  p_language TEXT,
  p_score INTEGER,
  p_duration_ms INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_language NOT IN ('en', 'te', 'hi', 'ta') THEN
    RAISE EXCEPTION 'Invalid language.';
  END IF;

  IF p_score < 0 OR p_score > 10 THEN
    RAISE EXCEPTION 'Invalid score.';
  END IF;

  IF p_duration_ms < 0 OR p_duration_ms >= 3600000 THEN
    RAISE EXCEPTION 'Invalid duration.';
  END IF;

  INSERT INTO public.trivia_attempts (user_id, week_key, language, score, duration_ms)
  VALUES (auth.uid(), p_week_key, p_language, p_score, p_duration_ms)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_trivia_attempt(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_trivia_attempt(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Leaderboard RPC: best attempt per user for that week/language, ranked by score desc then time asc.
CREATE OR REPLACE FUNCTION public.get_trivia_leaderboard(
  p_week_key TEXT,
  p_language TEXT
)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  username TEXT,
  avatar TEXT,
  score INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT DISTINCT ON (a.user_id)
      a.user_id,
      COALESCE(u.name, 'User') AS name,
      u.username,
      u.avatar,
      a.score,
      a.duration_ms,
      a.created_at
    FROM public.trivia_attempts a
    JOIN public.users u
      ON u.id = a.user_id
    WHERE a.week_key = p_week_key
      AND a.language = p_language
    ORDER BY a.user_id, a.score DESC, a.duration_ms ASC, a.created_at ASC
  )
  SELECT *
  FROM ranked
  ORDER BY score DESC, duration_ms ASC, created_at ASC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_trivia_leaderboard(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trivia_leaderboard(TEXT, TEXT) TO authenticated;

