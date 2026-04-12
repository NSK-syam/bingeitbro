-- Admin recommendation seed
-- This keeps the "Paradise" Hulu pick available in Supabase as a saved recommendation.
-- Replace admin_user_id before running in the Supabase SQL Editor.

DO $$
DECLARE
  admin_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF admin_user_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Set admin_user_id in supabase-admin-recommendations-seed.sql before running it.';
  END IF;

  INSERT INTO public.recommendations (
    user_id,
    title,
    original_title,
    year,
    type,
    poster,
    backdrop,
    genres,
    language,
    duration,
    rating,
    personal_note,
    mood,
    watch_with,
    ott_links,
    tmdb_id
  )
  SELECT
    admin_user_id,
    'Paradise',
    NULL,
    2025,
    'series',
    'https://image.tmdb.org/t/p/w500/l8RqfhqEk04W5sSOjQ9zeWU1DyM.jpg',
    'https://image.tmdb.org/t/p/original/5QsLvWh8J1mXl1W05wNJknMmhzR.jpg',
    ARRAY['Drama', 'Thriller'],
    'English',
    NULL,
    NULL,
    'Admin pick for the weekly series shelf.',
    ARRAY[]::text[],
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'platform', 'Hulu',
        'url', '/show/tmdbtv-245927'
      )
    ),
    245927
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.recommendations
    WHERE user_id = admin_user_id
      AND tmdb_id = 245927
      AND type = 'series'
  );
END $$;
