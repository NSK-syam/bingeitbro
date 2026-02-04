-- Friends System Schema for Cinema Chudu
-- Run this in your Supabase SQL Editor

-- Friends table (stores friend relationships)
CREATE TABLE friends (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Enable RLS
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Users can view their own friends
CREATE POLICY "Users can view their own friends" ON friends
  FOR SELECT USING (auth.uid() = user_id);

-- Users can add friends
CREATE POLICY "Users can add friends" ON friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove friends
CREATE POLICY "Users can remove friends" ON friends
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_friends_user_id ON friends(user_id);
CREATE INDEX idx_friends_friend_id ON friends(friend_id);

-- Allow searching users by name (public profiles)
-- Already have SELECT policy on users table
