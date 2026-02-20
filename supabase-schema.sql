-- Cinema Chudu Database Schema for Supabase
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (linked to Supabase Auth)
CREATE TABLE users (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  avatar TEXT DEFAULT '',
  theme TEXT DEFAULT 'gold',
  birthdate DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recommendations table
CREATE TABLE recommendations (
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies

-- Enable RLS on both tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Users: Anyone can read user profiles
CREATE POLICY "Public profiles are viewable by everyone" ON users
  FOR SELECT USING (true);

-- Users: Users can update their own profile
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Users: Users can insert their own profile (on signup)
CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Recommendations: Anyone can read recommendations
CREATE POLICY "Recommendations are viewable by everyone" ON recommendations
  FOR SELECT USING (true);

-- Recommendations: Authenticated users can insert
CREATE POLICY "Authenticated users can create recommendations" ON recommendations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Recommendations: Users can update their own recommendations
CREATE POLICY "Users can update their own recommendations" ON recommendations
  FOR UPDATE USING (auth.uid() = user_id);

-- Recommendations: Users can delete their own recommendations
CREATE POLICY "Users can delete their own recommendations" ON recommendations
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX idx_recommendations_created_at ON recommendations(created_at DESC);
CREATE INDEX idx_recommendations_type ON recommendations(type);
CREATE INDEX idx_recommendations_language ON recommendations(language);
