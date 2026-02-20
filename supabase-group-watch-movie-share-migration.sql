-- Movie share metadata for group watch chat.
-- Run this once in Supabase SQL editor for existing projects.

ALTER TABLE public.watch_group_messages
  ADD COLUMN IF NOT EXISTS shared_media_type TEXT,
  ADD COLUMN IF NOT EXISTS shared_tmdb_id TEXT,
  ADD COLUMN IF NOT EXISTS shared_title TEXT,
  ADD COLUMN IF NOT EXISTS shared_poster TEXT,
  ADD COLUMN IF NOT EXISTS shared_release_year INTEGER;

ALTER TABLE public.watch_group_messages
  ALTER COLUMN body DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'watch_group_messages_shared_media_type_check'
      AND conrelid = 'public.watch_group_messages'::regclass
  ) THEN
    ALTER TABLE public.watch_group_messages
      ADD CONSTRAINT watch_group_messages_shared_media_type_check
      CHECK (shared_media_type IS NULL OR shared_media_type IN ('movie', 'show'));
  END IF;
END $$;

DO $$
DECLARE
  legacy_constraint_name TEXT;
BEGIN
  FOR legacy_constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.watch_group_messages'::regclass
      AND contype = 'c'
      AND conname NOT IN (
        'watch_group_messages_body_or_share',
        'watch_group_messages_shared_fields_consistent',
        'watch_group_messages_shared_media_type_check'
      )
      AND pg_get_constraintdef(oid) ILIKE '%char_length(trim(body)) BETWEEN 1 AND 1200%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.watch_group_messages DROP CONSTRAINT IF EXISTS %I',
      legacy_constraint_name
    );
  END LOOP;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'watch_group_messages_body_or_share'
      AND conrelid = 'public.watch_group_messages'::regclass
  ) THEN
    ALTER TABLE public.watch_group_messages
      ADD CONSTRAINT watch_group_messages_body_or_share
      CHECK (
        (
          body IS NOT NULL
          AND char_length(trim(body)) BETWEEN 1 AND 1200
        )
        OR (
          shared_media_type IS NOT NULL
          AND shared_tmdb_id IS NOT NULL
          AND shared_title IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'watch_group_messages_shared_fields_consistent'
      AND conrelid = 'public.watch_group_messages'::regclass
  ) THEN
    ALTER TABLE public.watch_group_messages
      ADD CONSTRAINT watch_group_messages_shared_fields_consistent
      CHECK (
        (
          shared_media_type IS NULL
          AND shared_tmdb_id IS NULL
          AND shared_title IS NULL
          AND shared_poster IS NULL
          AND shared_release_year IS NULL
        )
        OR (
          shared_media_type IN ('movie', 'show')
          AND char_length(trim(shared_tmdb_id)) > 0
          AND char_length(trim(shared_title)) > 0
        )
      );
  END IF;
END $$;
