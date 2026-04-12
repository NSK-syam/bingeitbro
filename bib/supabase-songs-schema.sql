-- Songs: public playlist links + profile ratings
-- Run this in Supabase SQL Editor.

-- Public playlist links per user
CREATE TABLE IF NOT EXISTS song_playlists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, url)
);

ALTER TABLE song_playlists ENABLE ROW LEVEL SECURITY;

-- Anyone can read public playlists
CREATE POLICY "Song playlists are viewable by everyone" ON song_playlists
  FOR SELECT USING (is_public = true);

-- Users can manage their own playlists
CREATE POLICY "Users can add own playlists" ON song_playlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists" ON song_playlists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists" ON song_playlists
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS song_playlists_user_id_idx ON song_playlists(user_id);
CREATE INDEX IF NOT EXISTS song_playlists_public_idx ON song_playlists(is_public) WHERE is_public = true;

-- Rating per user's songs profile (1..5)
CREATE TABLE IF NOT EXISTS song_profile_ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  rater_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (profile_user_id, rater_id)
);

ALTER TABLE song_profile_ratings ENABLE ROW LEVEL SECURITY;

-- Anyone can read ratings (public)
CREATE POLICY "Song profile ratings are viewable by everyone" ON song_profile_ratings
  FOR SELECT USING (true);

-- Users can create/update/delete their own ratings
CREATE POLICY "Users can add own song profile rating" ON song_profile_ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_id);

CREATE POLICY "Users can update own song profile rating" ON song_profile_ratings
  FOR UPDATE USING (auth.uid() = rater_id);

CREATE POLICY "Users can delete own song profile rating" ON song_profile_ratings
  FOR DELETE USING (auth.uid() = rater_id);

CREATE INDEX IF NOT EXISTS song_profile_ratings_profile_user_id_idx ON song_profile_ratings(profile_user_id);

