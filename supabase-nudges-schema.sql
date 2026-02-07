-- Nudges table for reminding friends to watch movies
CREATE TABLE nudges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  from_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE CASCADE,
  friend_recommendation_id UUID REFERENCES friend_recommendations(id) ON DELETE CASCADE,
  tmdb_id TEXT,
  movie_title TEXT,
  movie_poster TEXT,
  movie_year INTEGER,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Unique constraints handled via partial indexes (see below)
);

-- Enable RLS
ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;

-- Users can view nudges sent to them
CREATE POLICY "Users can view received nudges" ON nudges
  FOR SELECT USING (auth.uid() = to_user_id);

-- Users can view nudges they sent
CREATE POLICY "Users can view sent nudges" ON nudges
  FOR SELECT USING (auth.uid() = from_user_id);

-- Users can send nudges
CREATE POLICY "Users can send nudges" ON nudges
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Users can mark their received nudges as read
CREATE POLICY "Users can update received nudges" ON nudges
  FOR UPDATE USING (auth.uid() = to_user_id);

-- Users can delete nudges they sent
CREATE POLICY "Users can delete sent nudges" ON nudges
  FOR DELETE USING (auth.uid() = from_user_id);

-- Index for faster queries
CREATE INDEX nudges_to_user_idx ON nudges(to_user_id);
CREATE INDEX nudges_from_user_idx ON nudges(from_user_id);

-- Prevent duplicate nudges for the same movie
CREATE UNIQUE INDEX nudges_unique_recommendation
  ON nudges(from_user_id, to_user_id, recommendation_id)
  WHERE recommendation_id IS NOT NULL;
CREATE UNIQUE INDEX nudges_unique_tmdb
  ON nudges(from_user_id, to_user_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;
