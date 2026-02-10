-- Top 10 Picks per user + language

CREATE TABLE IF NOT EXISTS top_10_picks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE CASCADE NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 10),
  language TEXT NOT NULL DEFAULT 'Unknown',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One movie per rank per language per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_top_10_picks_user_lang_rank
  ON top_10_picks (user_id, language, rank);

-- Prevent same movie from being added twice in the same language
CREATE UNIQUE INDEX IF NOT EXISTS idx_top_10_picks_user_movie_lang
  ON top_10_picks (user_id, recommendation_id, language);

ALTER TABLE top_10_picks ENABLE ROW LEVEL SECURITY;

-- Anyone can view top picks (public profiles)
CREATE POLICY "Anyone can view top picks" ON top_10_picks
  FOR SELECT USING (true);

-- Users can manage their own top picks
CREATE POLICY "Users can insert their own top picks" ON top_10_picks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own top picks" ON top_10_picks
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own top picks" ON top_10_picks
  FOR DELETE USING (auth.uid() = user_id);
