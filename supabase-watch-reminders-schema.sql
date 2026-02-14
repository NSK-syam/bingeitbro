-- Watch reminders schema for "Schedule movie when to watch"
-- Run this in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.watch_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  movie_poster TEXT,
  movie_year INTEGER,
  remind_at TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT watch_reminders_unique_movie_per_user UNIQUE (user_id, movie_id)
);

ALTER TABLE public.watch_reminders
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

ALTER TABLE public.watch_reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'watch_reminders'
      AND policyname = 'Users can view own watch reminders'
  ) THEN
    CREATE POLICY "Users can view own watch reminders"
      ON public.watch_reminders
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'watch_reminders'
      AND policyname = 'Users can insert own watch reminders'
  ) THEN
    CREATE POLICY "Users can insert own watch reminders"
      ON public.watch_reminders
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'watch_reminders'
      AND policyname = 'Users can update own watch reminders'
  ) THEN
    CREATE POLICY "Users can update own watch reminders"
      ON public.watch_reminders
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'watch_reminders'
      AND policyname = 'Users can delete own watch reminders'
  ) THEN
    CREATE POLICY "Users can delete own watch reminders"
      ON public.watch_reminders
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watch_reminders_user_remind_at
  ON public.watch_reminders (user_id, remind_at);

CREATE INDEX IF NOT EXISTS idx_watch_reminders_due
  ON public.watch_reminders (user_id, remind_at)
  WHERE canceled_at IS NULL AND notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watch_reminders_email_due
  ON public.watch_reminders (remind_at)
  WHERE canceled_at IS NULL AND email_sent_at IS NULL;
