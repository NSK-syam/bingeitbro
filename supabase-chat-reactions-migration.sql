-- Chat message reactions for direct and group messages.
-- Prerequisite: direct_messages and watch_group_messages migrations are already applied.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.direct_message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (char_length(trim(reaction)) BETWEEN 1 AND 24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT direct_message_reactions_unique_user_per_message UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.watch_group_message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.watch_group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (char_length(trim(reaction)) BETWEEN 1 AND 24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT watch_group_message_reactions_unique_user_per_message UNIQUE (message_id, user_id)
);

ALTER TABLE public.direct_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_group_message_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'direct_message_reactions'
      AND policyname = 'direct_message_reactions_select_participant'
  ) THEN
    CREATE POLICY direct_message_reactions_select_participant
      ON public.direct_message_reactions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.direct_messages dm
          WHERE dm.id = message_id
            AND (auth.uid() = dm.sender_id OR auth.uid() = dm.recipient_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'direct_message_reactions'
      AND policyname = 'direct_message_reactions_insert_own_participant'
  ) THEN
    CREATE POLICY direct_message_reactions_insert_own_participant
      ON public.direct_message_reactions
      FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.direct_messages dm
          WHERE dm.id = message_id
            AND (auth.uid() = dm.sender_id OR auth.uid() = dm.recipient_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'direct_message_reactions'
      AND policyname = 'direct_message_reactions_update_own'
  ) THEN
    CREATE POLICY direct_message_reactions_update_own
      ON public.direct_message_reactions
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'direct_message_reactions'
      AND policyname = 'direct_message_reactions_delete_own'
  ) THEN
    CREATE POLICY direct_message_reactions_delete_own
      ON public.direct_message_reactions
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_message_reactions'
      AND policyname = 'watch_group_message_reactions_select_member'
  ) THEN
    CREATE POLICY watch_group_message_reactions_select_member
      ON public.watch_group_message_reactions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.watch_group_messages wgm
          WHERE wgm.id = message_id
            AND public.is_watch_group_member(wgm.group_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_message_reactions'
      AND policyname = 'watch_group_message_reactions_insert_member_own'
  ) THEN
    CREATE POLICY watch_group_message_reactions_insert_member_own
      ON public.watch_group_message_reactions
      FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.watch_group_messages wgm
          WHERE wgm.id = message_id
            AND public.is_watch_group_member(wgm.group_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_message_reactions'
      AND policyname = 'watch_group_message_reactions_update_own'
  ) THEN
    CREATE POLICY watch_group_message_reactions_update_own
      ON public.watch_group_message_reactions
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_message_reactions'
      AND policyname = 'watch_group_message_reactions_delete_own'
  ) THEN
    CREATE POLICY watch_group_message_reactions_delete_own
      ON public.watch_group_message_reactions
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_direct_message_reactions_message
  ON public.direct_message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_direct_message_reactions_user
  ON public.direct_message_reactions (user_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_message_reactions_message
  ON public.watch_group_message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_watch_group_message_reactions_user
  ON public.watch_group_message_reactions (user_id);
