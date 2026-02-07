-- Fix: Allow multiple movies per friend (different movies = different rows)
-- The previous constraints used NULLS NOT DISTINCT, so (sender, recipient, null) allowed only ONE row
-- when sending TMDB movies (recommendation_id is always null). That blocked sending movie B after movie A.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- 1. List current constraints (run this first if DROP fails to find names):
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.friend_recommendations'::regclass AND contype = 'u';

-- 2. Drop the old unique constraints
ALTER TABLE friend_recommendations
  DROP CONSTRAINT IF EXISTS friend_recommendations_sender_id_recipient_id_recommendation_id_key;

ALTER TABLE friend_recommendations
  DROP CONSTRAINT IF EXISTS friend_recommendations_sender_id_recipient_id_tmdb_id_key;

-- 3. Add partial unique indexes: same movie can't be sent twice, but different movies can.
-- For user-created recommendations (recommendation_id set): one row per (sender, recipient, recommendation_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_rec_unique_recommendation
  ON friend_recommendations (sender_id, recipient_id, recommendation_id)
  WHERE recommendation_id IS NOT NULL;

-- For TMDB movies (tmdb_id set): one row per (sender, recipient, tmdb_id). Different movies = different tmdb_id = allowed.
-- Works whether tmdb_id column is TEXT or INTEGER.
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_rec_unique_tmdb
  ON friend_recommendations (sender_id, recipient_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;
