-- Friend Recommendations Schema for Cinema Chudu
-- This enables users to send personalized movie recommendations to their friends
-- Run this in your Supabase SQL Editor

CREATE TABLE friend_recommendations (
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
  -- Optional scheduled reminder set by sender for the recipient.
  remind_at TIMESTAMP WITH TIME ZONE,
  reminder_notified_at TIMESTAMP WITH TIME ZONE,
  reminder_email_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints: prevent duplicate recommendations to same friend
  CONSTRAINT valid_movie_reference CHECK (
    (recommendation_id IS NOT NULL) OR 
    (tmdb_id IS NOT NULL AND movie_title IS NOT NULL)
  ),
  
  -- Prevent sending the *same* movie twice to the same friend (different movies = allowed)
  -- Use partial unique indexes so multiple rows per (sender, recipient) are allowed when movie differs
);

CREATE UNIQUE INDEX idx_friend_rec_unique_recommendation
  ON friend_recommendations (sender_id, recipient_id, recommendation_id)
  WHERE recommendation_id IS NOT NULL;

CREATE UNIQUE INDEX idx_friend_rec_unique_tmdb
  ON friend_recommendations (sender_id, recipient_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- Enable RLS
ALTER TABLE friend_recommendations ENABLE ROW LEVEL SECURITY;

-- Users can view recommendations they sent
CREATE POLICY "Users can view sent recommendations" ON friend_recommendations
  FOR SELECT USING (auth.uid() = sender_id);

-- Users can view recommendations sent to them
CREATE POLICY "Users can view received recommendations" ON friend_recommendations
  FOR SELECT USING (auth.uid() = recipient_id);

-- Users can send recommendations (only to their friends)
CREATE POLICY "Users can send recommendations to friends" ON friend_recommendations
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM friends 
      WHERE user_id = auth.uid() AND friend_id = recipient_id
    )
  );

-- Users can update read status on recommendations sent to them
CREATE POLICY "Users can mark received recommendations as read" ON friend_recommendations
  FOR UPDATE USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Users can delete recommendations they sent
CREATE POLICY "Users can delete sent recommendations" ON friend_recommendations
  FOR DELETE USING (auth.uid() = sender_id);

-- Indexes for performance
CREATE INDEX idx_friend_recommendations_recipient ON friend_recommendations(recipient_id, is_read);
CREATE INDEX idx_friend_recommendations_sender ON friend_recommendations(sender_id);
CREATE INDEX idx_friend_recommendations_created ON friend_recommendations(created_at DESC);
CREATE INDEX idx_friend_recommendations_watched ON friend_recommendations(recipient_id, is_watched);
CREATE INDEX idx_friend_recommendations_due
  ON friend_recommendations(recipient_id, remind_at)
  WHERE remind_at IS NOT NULL AND reminder_notified_at IS NULL;
CREATE INDEX idx_friend_recommendations_email_due
  ON friend_recommendations(remind_at)
  WHERE remind_at IS NOT NULL AND reminder_email_sent_at IS NULL;

ALTER TABLE friend_recommendations
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE friend_recommendations
  ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE friend_recommendations
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMP WITH TIME ZONE;

-- Helper view for unread count
CREATE OR REPLACE VIEW friend_recommendations_unread_count AS
SELECT 
  recipient_id,
  COUNT(*) as unread_count
FROM friend_recommendations
WHERE is_read = FALSE
GROUP BY recipient_id;
