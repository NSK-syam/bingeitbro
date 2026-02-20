-- Direct (1:1) chat messages between friends.
-- Run this once in Supabase SQL editor for existing projects.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT direct_messages_no_self CHECK (sender_id <> recipient_id)
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'direct_messages'
      AND policyname = 'direct_messages_select_participant'
  ) THEN
    CREATE POLICY direct_messages_select_participant
      ON public.direct_messages
      FOR SELECT
      USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'direct_messages'
      AND policyname = 'direct_messages_insert_sender_friend_only'
  ) THEN
    CREATE POLICY direct_messages_insert_sender_friend_only
      ON public.direct_messages
      FOR INSERT
      WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
          SELECT 1
          FROM public.friends f
          WHERE (
            f.user_id = auth.uid()
            AND f.friend_id = recipient_id
          ) OR (
            f.user_id = recipient_id
            AND f.friend_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'direct_messages'
      AND policyname = 'direct_messages_delete_sender_only'
  ) THEN
    CREATE POLICY direct_messages_delete_sender_only
      ON public.direct_messages
      FOR DELETE
      USING (auth.uid() = sender_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_created
  ON public.direct_messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_created
  ON public.direct_messages (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_pair_created
  ON public.direct_messages (sender_id, recipient_id, created_at DESC);
