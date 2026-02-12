-- ============================================================================
-- Cinema Chudu - Production Database Migration
-- ============================================================================
-- This script creates all required tables for the Cinema Chudu application
-- including the "Send to Friend" feature.
--
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Stores user profiles linked to Supabase Auth

CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  avatar TEXT DEFAULT '🎬',
  theme TEXT DEFAULT 'gold',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns for existing installs
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'gold';
UPDATE users SET theme = 'gold' WHERE theme IS NULL;

-- Birthday (optional, used for in-app celebration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate DATE;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Public profiles are viewable by everyone'
  ) THEN
    CREATE POLICY "Public profiles are viewable by everyone" ON users
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" ON users
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile" ON users
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ============================================================================
-- RECOMMENDATIONS TABLE
-- ============================================================================
-- Stores user-created custom movie recommendations

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'series', 'documentary', 'anime')),
  poster TEXT NOT NULL,
  backdrop TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL,
  duration TEXT,
  rating DECIMAL(3,1),
  personal_note TEXT NOT NULL,
  mood TEXT[] DEFAULT '{}',
  watch_with TEXT,
  ott_links JSONB DEFAULT '[]',
  tmdb_id INTEGER,
  certification TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recommendations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recommendations' AND policyname = 'Recommendations are viewable by everyone'
  ) THEN
    CREATE POLICY "Recommendations are viewable by everyone" ON recommendations
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recommendations' AND policyname = 'Authenticated users can create recommendations'
  ) THEN
    CREATE POLICY "Authenticated users can create recommendations" ON recommendations
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recommendations' AND policyname = 'Users can update their own recommendations'
  ) THEN
    CREATE POLICY "Users can update their own recommendations" ON recommendations
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recommendations' AND policyname = 'Users can delete their own recommendations'
  ) THEN
    CREATE POLICY "Users can delete their own recommendations" ON recommendations
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Indexes for recommendations
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(type);
CREATE INDEX IF NOT EXISTS idx_recommendations_language ON recommendations(language);

-- ============================================================================
-- FRIENDS TABLE
-- ============================================================================
-- Stores friend relationships between users

CREATE TABLE IF NOT EXISTS friends (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Enable RLS
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- RLS Policies for friends
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friends' AND policyname = 'Users can view their own friends'
  ) THEN
    CREATE POLICY "Users can view their own friends" ON friends
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friends' AND policyname = 'Users can add friends'
  ) THEN
    CREATE POLICY "Users can add friends" ON friends
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friends' AND policyname = 'Users can remove friends'
  ) THEN
    CREATE POLICY "Users can remove friends" ON friends
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Indexes for friends
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);

-- ============================================================================
-- FRIEND_RECOMMENDATIONS TABLE (THE SEND TO FRIEND FEATURE!)
-- ============================================================================
-- Enables users to send personalized movie recommendations to their friends

CREATE TABLE IF NOT EXISTS friend_recommendations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- Link to an existing recommendation (user-created)
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE CASCADE,
  
  -- For TMDB or static movies that don't have a recommendation entry
  tmdb_id TEXT,
  movie_title TEXT,
  movie_poster TEXT,
  movie_year INTEGER,
  
  -- Personal message from sender to recipient
  personal_message TEXT NOT NULL,
  
  -- Read status
  is_read BOOLEAN DEFAULT FALSE,
  -- Watched status (recipient watched the recommendation)
  is_watched BOOLEAN DEFAULT FALSE,
  watched_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints: prevent duplicate recommendations to same friend
  CONSTRAINT valid_movie_reference CHECK (
    (recommendation_id IS NOT NULL) OR 
    (tmdb_id IS NOT NULL AND movie_title IS NOT NULL)
  ),
  
  -- Unique constraints handled via partial indexes (see below)
);

-- Drop legacy unique constraints (they block multiple different recommendations)
ALTER TABLE friend_recommendations
  DROP CONSTRAINT IF EXISTS friend_recommendations_sender_id_recipient_id_recommendation_id_key;
ALTER TABLE friend_recommendations
  DROP CONSTRAINT IF EXISTS friend_recommendations_sender_id_recipient_id_tmdb_id_key;

-- Enable RLS
ALTER TABLE friend_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for friend_recommendations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friend_recommendations' AND policyname = 'Users can view sent recommendations'
  ) THEN
    CREATE POLICY "Users can view sent recommendations" ON friend_recommendations
      FOR SELECT USING (auth.uid() = sender_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friend_recommendations' AND policyname = 'Users can view received recommendations'
  ) THEN
    CREATE POLICY "Users can view received recommendations" ON friend_recommendations
      FOR SELECT USING (auth.uid() = recipient_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friend_recommendations' AND policyname = 'Users can send recommendations to friends'
  ) THEN
    CREATE POLICY "Users can send recommendations to friends" ON friend_recommendations
      FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
          SELECT 1 FROM friends 
          WHERE user_id = auth.uid() AND friend_id = recipient_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friend_recommendations' AND policyname = 'Users can mark received recommendations as read'
  ) THEN
    CREATE POLICY "Users can mark received recommendations as read" ON friend_recommendations
      FOR UPDATE USING (auth.uid() = recipient_id)
      WITH CHECK (auth.uid() = recipient_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friend_recommendations' AND policyname = 'Users can delete sent recommendations'
  ) THEN
    CREATE POLICY "Users can delete sent recommendations" ON friend_recommendations
      FOR DELETE USING (auth.uid() = sender_id);
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_friend_recommendations_recipient ON friend_recommendations(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_friend_recommendations_sender ON friend_recommendations(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_recommendations_created ON friend_recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_recommendations_watched ON friend_recommendations(recipient_id, is_watched);

-- Prevent duplicate sends for the same movie, but allow multiple different movies
CREATE UNIQUE INDEX IF NOT EXISTS friend_recs_unique_recommendation
  ON friend_recommendations(sender_id, recipient_id, recommendation_id)
  WHERE recommendation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS friend_recs_unique_tmdb
  ON friend_recommendations(sender_id, recipient_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- If table already existed, add watched columns safely
ALTER TABLE friend_recommendations
  ADD COLUMN IF NOT EXISTS is_watched BOOLEAN DEFAULT FALSE;
ALTER TABLE friend_recommendations
  ADD COLUMN IF NOT EXISTS watched_at TIMESTAMP WITH TIME ZONE;

-- Helper view for unread count
CREATE OR REPLACE VIEW friend_recommendations_unread_count AS
SELECT 
  recipient_id,
  COUNT(*) as unread_count
FROM friend_recommendations
WHERE is_read = FALSE
GROUP BY recipient_id;

-- ============================================================================
-- OPTIONAL TABLES (for additional features)
-- ============================================================================

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  movie_id TEXT NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'watchlist' AND policyname = 'Users can manage their own watchlist'
  ) THEN
    CREATE POLICY "Users can manage their own watchlist" ON watchlist
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);

-- Watched movies table
CREATE TABLE IF NOT EXISTS watched_movies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  movie_id TEXT NOT NULL,
  watched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE watched_movies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'watched_movies' AND policyname = 'Users can manage their watched movies'
  ) THEN
    CREATE POLICY "Users can manage their watched movies" ON watched_movies
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watched_movies_user_id ON watched_movies(user_id);

-- Nudges table
CREATE TABLE IF NOT EXISTS nudges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  movie_id TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sender_id, recipient_id, movie_id)
);

ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nudges' AND policyname = 'Users can view sent nudges'
  ) THEN
    CREATE POLICY "Users can view sent nudges" ON nudges
      FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nudges' AND policyname = 'Users can send nudges'
  ) THEN
    CREATE POLICY "Users can send nudges" ON nudges
      FOR INSERT WITH CHECK (auth.uid() = sender_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nudges' AND policyname = 'Users can update nudge status'
  ) THEN
    CREATE POLICY "Users can update nudge status" ON nudges
      FOR UPDATE USING (auth.uid() = recipient_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nudges_recipient ON nudges(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_nudges_sender ON nudges(sender_id);

-- ============================================================================
-- TOP 10 RATINGS (per language)
-- ============================================================================

CREATE TABLE IF NOT EXISTS top_10_ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  rater_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  language TEXT NOT NULL,
  rating INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT top_10_ratings_rating_range CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT top_10_ratings_no_self_rate CHECK (profile_user_id <> rater_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_top_10_ratings_unique
  ON top_10_ratings (profile_user_id, rater_id, language);

ALTER TABLE top_10_ratings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'top_10_ratings' AND policyname = 'Public can view Top 10 ratings'
  ) THEN
    CREATE POLICY "Public can view Top 10 ratings" ON top_10_ratings
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'top_10_ratings' AND policyname = 'Users can rate others'
  ) THEN
    CREATE POLICY "Users can rate others" ON top_10_ratings
      FOR INSERT WITH CHECK (auth.uid() = rater_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'top_10_ratings' AND policyname = 'Users can update their rating'
  ) THEN
    CREATE POLICY "Users can update their rating" ON top_10_ratings
      FOR UPDATE USING (auth.uid() = rater_id)
      WITH CHECK (auth.uid() = rater_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'top_10_ratings' AND policyname = 'Users can delete their rating'
  ) THEN
    CREATE POLICY "Users can delete their rating" ON top_10_ratings
      FOR DELETE USING (auth.uid() = rater_id);
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================
-- You can now:
-- 1. Create user profiles
-- 2. Add friends
-- 3. Send movie recommendations to friends
-- 4. Use watchlists and track watched movies
-- 5. Send nudges
-- ============================================================================
