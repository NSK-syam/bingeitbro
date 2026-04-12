-- Weekly trivia top-3 migration.
-- Run this once in Supabase SQL Editor.

BEGIN;

-- Compute current ISO week key in UTC, matching app format like 2026-W09.
WITH current_week AS (
  SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'IYYY-"W"IW') AS week_key
)
DELETE FROM public.trivia_attempts t
USING current_week cw
WHERE t.week_key <> cw.week_key;

-- Keep only top 3 per language for the current week.
WITH current_week AS (
  SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'IYYY-"W"IW') AS week_key
),
ranked AS (
  SELECT
    a.id,
    ROW_NUMBER() OVER (
      PARTITION BY a.week_key, a.language
      ORDER BY a.score DESC, a.duration_ms ASC, a.created_at ASC
    ) AS rn
  FROM public.trivia_attempts a
  JOIN current_week cw
    ON a.week_key = cw.week_key
)
DELETE FROM public.trivia_attempts t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 3;

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

  DELETE FROM public.trivia_attempts
  WHERE week_key <> p_week_key;

  INSERT INTO public.trivia_attempts (user_id, week_key, language, score, duration_ms)
  VALUES (auth.uid(), p_week_key, p_language, p_score, p_duration_ms)
  RETURNING id INTO v_id;

  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY week_key, language
        ORDER BY score DESC, duration_ms ASC, created_at ASC
      ) AS rn
    FROM public.trivia_attempts
    WHERE week_key = p_week_key
      AND language = p_language
  )
  DELETE FROM public.trivia_attempts t
  USING ranked r
  WHERE t.id = r.id
    AND r.rn > 3;

  RETURN v_id;
END;
$$;

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
  SELECT
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
  ORDER BY a.score DESC, a.duration_ms ASC, a.created_at ASC
  LIMIT 3;
$$;

COMMIT;
