-- Top 10 Ratings (per language)
-- Run this in Supabase SQL Editor

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

-- Anyone can view ratings (including logged out users)
CREATE POLICY "Public can view Top 10 ratings" ON top_10_ratings
  FOR SELECT USING (true);

-- Only authenticated users can create/update/delete their own rating
CREATE POLICY "Users can rate others" ON top_10_ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_id);

CREATE POLICY "Users can update their rating" ON top_10_ratings
  FOR UPDATE USING (auth.uid() = rater_id)
  WITH CHECK (auth.uid() = rater_id);

CREATE POLICY "Users can delete their rating" ON top_10_ratings
  FOR DELETE USING (auth.uid() = rater_id);

