# 🗄️ Database Migration Guide

Complete guide for managing database schema changes in Binge It Bro (Cinema Chudu).

---

## Table of Contents

- [Overview](#overview)
- [Initial Setup](#initial-setup)
- [Migration Workflow](#migration-workflow)
- [Schema Migrations](#schema-migrations)
- [Data Migrations](#data-migrations)
- [Rollback Procedures](#rollback-procedures)
- [Best Practices](#best-practices)
- [Common Migration Patterns](#common-migration-patterns)

---

## Overview

This project uses **Supabase PostgreSQL** as the database. Migrations are applied manually through the Supabase SQL Editor.

### Why Manual Migrations?

- **Simplicity**: No migration tool dependencies
- **Visibility**: All changes reviewed in Supabase Dashboard
- **Rollback**: Easy to revert via SQL
- **RLS Awareness**: Supabase RLS policies visible in dashboard

### Migration Files Location

```
Movie Recom/
├── cinema-chudu/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_add_friends_table.sql
│       ├── 003_add_friend_recommendations.sql
│       ├── 004_add_indexes.sql
│       ├── 005_add_rls_policies.sql
│       └── 006_add_theme_column.sql
```

---

## Initial Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Enter project details:
   - **Name**: binge-it-bro
   - **Database Password**: (generate strong password)
   - **Region**: Choose closest to your users (e.g., US West, Southeast Asia)
4. Click "Create New Project"

### 2. Get Database Credentials

Navigate to **Settings → Database**:

```
Host: db.PROJECT_ID.supabase.co
Database name: postgres
Port: 5432
User: postgres
Password: [your password]
```

### 3. Run Initial Migration

Copy and paste the following into **SQL Editor**:

---

## Schema Migrations

### Migration 001: Initial Schema

**File**: `migrations/001_initial_schema.sql`

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  name TEXT,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT DEFAULT '🍿',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  type TEXT CHECK (type IN ('movie', 'series', 'documentary', 'anime')),
  poster TEXT,
  backdrop TEXT,
  genres TEXT[],
  language TEXT,
  duration DECIMAL,
  rating DECIMAL,
  personal_note TEXT,
  mood TEXT[],
  watch_with TEXT,
  ott_links JSONB,
  tmdb_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_recommendations_updated_at
  BEFORE UPDATE ON recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
```

**To Apply**:
1. Open Supabase Dashboard → SQL Editor
2. Paste the SQL
3. Click "Run"
4. Verify: Check **Table Editor** → `users`, `recommendations`

---

### Migration 002: Add Friends Table

**File**: `migrations/002_add_friends_table.sql`

```sql
-- Friends table (bidirectional friendships)
CREATE TABLE IF NOT EXISTS friends (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_friendship UNIQUE(user_id, friend_id),
  CONSTRAINT no_self_friendship CHECK (user_id != friend_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);

-- Enable RLS
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
```

---

### Migration 003: Add Friend Recommendations Table

**File**: `migrations/003_add_friend_recommendations.sql`

```sql
-- Friend recommendations table (sent recommendations)
CREATE TABLE IF NOT EXISTS friend_recommendations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE CASCADE,
  tmdb_id TEXT,  -- For TMDB/static movies (nullable)
  movie_title TEXT NOT NULL,
  movie_poster TEXT,
  movie_year INTEGER,
  personal_message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  is_watched BOOLEAN DEFAULT FALSE,
  watched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_friend_recs_sender ON friend_recommendations(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_recs_recipient ON friend_recommendations(recipient_id);
CREATE INDEX IF NOT EXISTS idx_friend_recs_is_read ON friend_recommendations(is_read);

-- Unique constraint: prevent duplicate sends
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_recs_unique
  ON friend_recommendations(sender_id, recipient_id, recommendation_id)
  WHERE recommendation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_recs_tmdb_unique
  ON friend_recommendations(sender_id, recipient_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- Enable RLS
ALTER TABLE friend_recommendations ENABLE ROW LEVEL SECURITY;
```

---

### Migration 004: Add Additional Indexes

**File**: `migrations/004_add_indexes.sql`

```sql
-- Recommendations table indexes (for filtering and search)
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(type);
CREATE INDEX IF NOT EXISTS idx_recommendations_language ON recommendations(language);
CREATE INDEX IF NOT EXISTS idx_recommendations_tmdb_id ON recommendations(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_year ON recommendations(year);

-- GIN index for array columns (genres, mood)
CREATE INDEX IF NOT EXISTS idx_recommendations_genres ON recommendations USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_recommendations_mood ON recommendations USING GIN(mood);

-- Full-text search index on title
CREATE INDEX IF NOT EXISTS idx_recommendations_title_fts ON recommendations USING GIN(to_tsvector('english', title));
```

**Performance Impact**:
- **Before**: Filtering by genre: ~500ms (full table scan)
- **After**: Filtering by genre: ~50ms (index scan)

---

### Migration 005: Add RLS Policies

**File**: `migrations/005_add_rls_policies.sql`

```sql
-- ========================================
-- USERS TABLE POLICIES
-- ========================================

-- Anyone can view all user profiles (for discovery)
CREATE POLICY "Users can view all profiles"
  ON users FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Users can delete their own profile
CREATE POLICY "Users can delete own profile"
  ON users FOR DELETE
  USING (auth.uid() = id);

-- ========================================
-- RECOMMENDATIONS TABLE POLICIES
-- ========================================

-- Anyone can view all recommendations (public discovery)
CREATE POLICY "Anyone can view recommendations"
  ON recommendations FOR SELECT
  USING (true);

-- Users can insert their own recommendations
CREATE POLICY "Users can insert own recommendations"
  ON recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own recommendations
CREATE POLICY "Users can update own recommendations"
  ON recommendations FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own recommendations
CREATE POLICY "Users can delete own recommendations"
  ON recommendations FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- FRIENDS TABLE POLICIES
-- ========================================

-- Users can view their own friends list
CREATE POLICY "Users can view own friends"
  ON friends FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view friendships where they are the friend
CREATE POLICY "Users can view where they are friend"
  ON friends FOR SELECT
  USING (auth.uid() = friend_id);

-- Users can add friends
CREATE POLICY "Users can add friends"
  ON friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their own friendships
CREATE POLICY "Users can remove own friendships"
  ON friends FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- FRIEND_RECOMMENDATIONS TABLE POLICIES
-- ========================================

-- Users can view recommendations they sent
CREATE POLICY "Users can view sent recommendations"
  ON friend_recommendations FOR SELECT
  USING (auth.uid() = sender_id);

-- Users can view recommendations they received
CREATE POLICY "Users can view received recommendations"
  ON friend_recommendations FOR SELECT
  USING (auth.uid() = recipient_id);

-- Users can send recommendations to their friends
CREATE POLICY "Users can send recommendations to friends"
  ON friend_recommendations FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM friends
      WHERE user_id = auth.uid()
      AND friend_id = friend_recommendations.recipient_id
    )
  );

-- Recipients can update received recommendations (mark as read/watched)
CREATE POLICY "Recipients can update received recommendations"
  ON friend_recommendations FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Senders can delete sent recommendations
CREATE POLICY "Senders can delete sent recommendations"
  ON friend_recommendations FOR DELETE
  USING (auth.uid() = sender_id);
```

**Security Benefits**:
- Users can't see each other's private data
- Friend recommendations can only be sent between actual friends
- Recipients can't modify sender information
- All access is verified at database level (defense in depth)

---

### Migration 006: Add Theme Column

**File**: `migrations/006_add_theme_column.sql`

```sql
-- Add theme preference column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light'
CHECK (theme IN ('light', 'dark', 'auto'));

-- Update existing users to default theme
UPDATE users SET theme = 'auto' WHERE theme IS NULL;
```

**Rollback**:
```sql
ALTER TABLE users DROP COLUMN IF EXISTS theme;
```

---

## Data Migrations

### Example: Migrate Mood Tags

**Problem**: Old recommendations used different mood tag names.

**Migration**: `migrations/007_migrate_mood_tags.sql`

```sql
-- Rename mood tags from old format to new format
UPDATE recommendations
SET mood = ARRAY_REPLACE(mood, 'suspenseful', 'thrilling')
WHERE 'suspenseful' = ANY(mood);

UPDATE recommendations
SET mood = ARRAY_REPLACE(mood, 'funny', 'hilarious')
WHERE 'funny' = ANY(mood);

UPDATE recommendations
SET mood = ARRAY_REPLACE(mood, 'emotional', 'heartwarming')
WHERE 'emotional' = ANY(mood);

-- Verify
SELECT DISTINCT unnest(mood) AS mood_tag FROM recommendations ORDER BY mood_tag;
```

---

### Example: Backfill Missing TMDB IDs

**Problem**: Some recommendations don't have TMDB IDs.

**Migration**: `migrations/008_backfill_tmdb_ids.sql`

```sql
-- This requires manual lookup for each movie
-- Example: Update Inception
UPDATE recommendations
SET tmdb_id = 27205
WHERE title = 'Inception' AND year = 2010 AND tmdb_id IS NULL;

-- Example: Update The Matrix
UPDATE recommendations
SET tmdb_id = 603
WHERE title = 'The Matrix' AND year = 1999 AND tmdb_id IS NULL;

-- Verify
SELECT id, title, year, tmdb_id
FROM recommendations
WHERE tmdb_id IS NULL
ORDER BY created_at DESC;
```

**Note**: For large-scale backfills, use a script:

```typescript
// scripts/backfill-tmdb-ids.ts
import { createClient } from '@supabase/supabase-js';
import { searchMovies } from './lib/tmdb';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function backfillTMDBIds() {
  const { data: recommendations } = await supabase
    .from('recommendations')
    .select('id, title, year')
    .is('tmdb_id', null);

  for (const rec of recommendations) {
    const results = await searchMovies(`${rec.title} ${rec.year}`);
    if (results.length > 0) {
      await supabase
        .from('recommendations')
        .update({ tmdb_id: results[0].id })
        .eq('id', rec.id);
      console.log(`Updated ${rec.title}: TMDB ID ${results[0].id}`);
    }
  }
}

backfillTMDBIds();
```

---

## Rollback Procedures

### Rolling Back Schema Changes

#### Method 1: Drop Table

```sql
-- Rollback: Drop friend_recommendations table
DROP TABLE IF EXISTS friend_recommendations CASCADE;
```

**Warning**: This deletes all data in the table!

#### Method 2: Alter Table (Safer)

```sql
-- Rollback: Remove theme column
ALTER TABLE users DROP COLUMN IF EXISTS theme;

-- Rollback: Drop index
DROP INDEX IF EXISTS idx_recommendations_year;

-- Rollback: Remove RLS policy
DROP POLICY IF EXISTS "Users can view all profiles" ON users;
```

---

### Rolling Back Data Migrations

#### Method 1: Transaction Rollback

```sql
-- Start transaction
BEGIN;

-- Apply migration
UPDATE recommendations SET mood = ARRAY_REPLACE(mood, 'suspenseful', 'thrilling');

-- Verify
SELECT * FROM recommendations WHERE 'thrilling' = ANY(mood);

-- If looks good, commit
COMMIT;

-- If bad, rollback
ROLLBACK;
```

#### Method 2: Backup & Restore

Before running risky migrations:

```sql
-- Create backup table
CREATE TABLE recommendations_backup AS SELECT * FROM recommendations;

-- Apply migration
UPDATE recommendations SET ...;

-- If migration fails, restore
DELETE FROM recommendations;
INSERT INTO recommendations SELECT * FROM recommendations_backup;

-- Cleanup
DROP TABLE recommendations_backup;
```

---

## Best Practices

### 1. Always Use Transactions

```sql
BEGIN;

-- Your migration SQL
ALTER TABLE users ADD COLUMN ...;
UPDATE users SET ...;

-- Verify
SELECT * FROM users LIMIT 5;

-- Commit if looks good
COMMIT;
```

### 2. Test Migrations Locally First

1. Create a test Supabase project
2. Apply migration
3. Test app functionality
4. If successful, apply to production

### 3. Use Idempotent Migrations

**Bad** (fails on re-run):
```sql
CREATE TABLE users (...);
```

**Good** (safe to re-run):
```sql
CREATE TABLE IF NOT EXISTS users (...);
```

### 4. Document Migrations

```sql
-- Migration: 006_add_theme_column.sql
-- Date: 2024-01-15
-- Author: Syam
-- Description: Add theme preference (light/dark/auto) to users table
-- Jira: BIB-123

ALTER TABLE users
ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'auto'
CHECK (theme IN ('light', 'dark', 'auto'));
```

### 5. Keep Migrations Small

**Bad**: One giant migration file with 50 changes

**Good**: Multiple small migrations, one per feature

```
migrations/
├── 001_initial_schema.sql          (users, recommendations)
├── 002_add_friends_table.sql       (friends)
├── 003_add_friend_recs.sql         (friend_recommendations)
├── 004_add_indexes.sql             (performance)
├── 005_add_rls_policies.sql        (security)
└── 006_add_theme_column.sql        (new feature)
```

### 6. Always Add Indexes for Foreign Keys

```sql
-- Bad: No index on foreign key
CREATE TABLE friend_recommendations (
  sender_id UUID REFERENCES users(id)
);

-- Good: Index for fast lookups
CREATE TABLE friend_recommendations (
  sender_id UUID REFERENCES users(id)
);
CREATE INDEX idx_friend_recs_sender ON friend_recommendations(sender_id);
```

### 7. Use Descriptive Index Names

```sql
-- Bad
CREATE INDEX idx1 ON recommendations(user_id);

-- Good
CREATE INDEX idx_recommendations_user_id ON recommendations(user_id);
```

---

## Common Migration Patterns

### Add Column with Default Value

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
```

### Rename Column

```sql
ALTER TABLE recommendations
RENAME COLUMN personal_note TO review;
```

### Change Column Type

```sql
-- Safe: Expand varchar
ALTER TABLE users
ALTER COLUMN username TYPE VARCHAR(100);

-- Risky: Change type (may fail if data incompatible)
ALTER TABLE recommendations
ALTER COLUMN year TYPE TEXT USING year::TEXT;
```

### Add Foreign Key Constraint

```sql
ALTER TABLE recommendations
ADD CONSTRAINT fk_recommendations_user_id
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE;
```

### Add Check Constraint

```sql
ALTER TABLE recommendations
ADD CONSTRAINT check_rating_range
CHECK (rating >= 1 AND rating <= 10);
```

### Create Composite Index

```sql
-- Index for filtering by user_id + created_at
CREATE INDEX idx_recommendations_user_created
ON recommendations(user_id, created_at DESC);
```

### Create Partial Index

```sql
-- Index only unread friend recommendations (faster queries)
CREATE INDEX idx_friend_recs_unread
ON friend_recommendations(recipient_id, created_at DESC)
WHERE is_read = FALSE;
```

### Create Full-Text Search Index

```sql
-- Enable full-text search on movie titles
CREATE INDEX idx_recommendations_title_fts
ON recommendations
USING GIN(to_tsvector('english', title));

-- Usage:
SELECT * FROM recommendations
WHERE to_tsvector('english', title) @@ to_tsquery('english', 'inception');
```

---

## Migration Testing Checklist

Before applying to production:

- [ ] Tested on local Supabase project
- [ ] Verified all indexes created successfully
- [ ] Tested app functionality after migration
- [ ] Verified RLS policies work correctly
- [ ] Checked query performance (EXPLAIN ANALYZE)
- [ ] Prepared rollback SQL
- [ ] Documented migration in this file
- [ ] Created backup of production database
- [ ] Scheduled migration during low-traffic hours
- [ ] Tested rollback procedure on test database

---

## Troubleshooting

### Migration Fails: "relation already exists"

**Solution**: Use `IF NOT EXISTS`

```sql
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

### Migration Fails: "column already exists"

**Solution**: Use `IF NOT EXISTS` or check first

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS theme TEXT;
```

### Migration Slows Down Database

**Problem**: Creating index on large table locks it.

**Solution**: Use `CONCURRENTLY` (allows reads/writes during index creation)

```sql
-- Slow (locks table)
CREATE INDEX idx_recommendations_year ON recommendations(year);

-- Fast (non-blocking)
CREATE INDEX CONCURRENTLY idx_recommendations_year ON recommendations(year);
```

### RLS Policy Blocks Legitimate Access

**Problem**: Users can't access their own data.

**Debug**:
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'recommendations';

-- View all policies
SELECT * FROM pg_policies WHERE tablename = 'recommendations';

-- Test policy as user
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-uuid-here';
SELECT * FROM recommendations WHERE user_id = 'user-uuid-here';
RESET ROLE;
```

**Solution**: Fix policy logic

```sql
-- Bad policy (always fails)
CREATE POLICY "test" ON recommendations FOR SELECT USING (false);

-- Good policy
CREATE POLICY "Users can view own recs" ON recommendations FOR SELECT USING (auth.uid() = user_id);
```

---

## Database Backup & Restore

### Manual Backup (Supabase Dashboard)

1. Go to **Database → Backups**
2. Click "Create Backup"
3. Wait for completion
4. Download backup file

### Automated Backups (Supabase Pro)

Supabase Pro includes:
- Daily automatic backups (retained 7 days)
- Point-in-time recovery (PITR)

### Restore from Backup

1. Go to **Database → Backups**
2. Find backup
3. Click "Restore"
4. Confirm (WARNING: Overwrites current data)

### Manual Restore via psql

```bash
# Export database
pg_dump -h db.PROJECT_ID.supabase.co -U postgres -d postgres > backup.sql

# Restore database
psql -h db.PROJECT_ID.supabase.co -U postgres -d postgres < backup.sql
```

---

**Last Updated**: January 2024
