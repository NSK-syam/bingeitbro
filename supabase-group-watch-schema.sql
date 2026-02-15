-- Group watch feature schema.
-- Run this in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.watch_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.watch_group_members (
  group_id UUID NOT NULL REFERENCES public.watch_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.watch_group_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.watch_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'show')),
  tmdb_id TEXT NOT NULL,
  title TEXT NOT NULL,
  poster TEXT,
  release_year INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT watch_group_picks_unique_pick UNIQUE (group_id, media_type, tmdb_id)
);

CREATE TABLE IF NOT EXISTS public.watch_group_pick_votes (
  pick_id UUID NOT NULL REFERENCES public.watch_group_picks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pick_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_watch_group_member(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.watch_group_members m
    WHERE m.group_id = target_group_id
      AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_watch_group_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_watch_group_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_watch_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.watch_group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watch_groups_after_insert ON public.watch_groups;
CREATE TRIGGER watch_groups_after_insert
  AFTER INSERT ON public.watch_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_watch_group();

ALTER TABLE public.watch_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_group_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_group_pick_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_groups'
      AND policyname = 'watch_groups_select_member'
  ) THEN
    CREATE POLICY watch_groups_select_member
      ON public.watch_groups
      FOR SELECT
      USING (public.is_watch_group_member(id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_groups'
      AND policyname = 'watch_groups_insert_owner'
  ) THEN
    CREATE POLICY watch_groups_insert_owner
      ON public.watch_groups
      FOR INSERT
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_groups'
      AND policyname = 'watch_groups_update_owner'
  ) THEN
    CREATE POLICY watch_groups_update_owner
      ON public.watch_groups
      FOR UPDATE
      USING (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_groups'
      AND policyname = 'watch_groups_delete_owner'
  ) THEN
    CREATE POLICY watch_groups_delete_owner
      ON public.watch_groups
      FOR DELETE
      USING (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_members'
      AND policyname = 'watch_group_members_select_member'
  ) THEN
    CREATE POLICY watch_group_members_select_member
      ON public.watch_group_members
      FOR SELECT
      USING (public.is_watch_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_members'
      AND policyname = 'watch_group_members_insert_owner'
  ) THEN
    CREATE POLICY watch_group_members_insert_owner
      ON public.watch_group_members
      FOR INSERT
      WITH CHECK (
        auth.uid() = (
          SELECT g.owner_id
          FROM public.watch_groups g
          WHERE g.id = group_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_members'
      AND policyname = 'watch_group_members_delete_owner_or_self'
  ) THEN
    CREATE POLICY watch_group_members_delete_owner_or_self
      ON public.watch_group_members
      FOR DELETE
      USING (
        auth.uid() = user_id OR
        auth.uid() = (
          SELECT g.owner_id
          FROM public.watch_groups g
          WHERE g.id = group_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_picks'
      AND policyname = 'watch_group_picks_select_member'
  ) THEN
    CREATE POLICY watch_group_picks_select_member
      ON public.watch_group_picks
      FOR SELECT
      USING (public.is_watch_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_picks'
      AND policyname = 'watch_group_picks_insert_member'
  ) THEN
    CREATE POLICY watch_group_picks_insert_member
      ON public.watch_group_picks
      FOR INSERT
      WITH CHECK (
        auth.uid() = sender_id
        AND public.is_watch_group_member(group_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_picks'
      AND policyname = 'watch_group_picks_delete_sender_or_owner'
  ) THEN
    CREATE POLICY watch_group_picks_delete_sender_or_owner
      ON public.watch_group_picks
      FOR DELETE
      USING (
        auth.uid() = sender_id OR
        auth.uid() = (
          SELECT g.owner_id
          FROM public.watch_groups g
          WHERE g.id = group_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_pick_votes'
      AND policyname = 'watch_group_pick_votes_select_member'
  ) THEN
    CREATE POLICY watch_group_pick_votes_select_member
      ON public.watch_group_pick_votes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.watch_group_picks p
          WHERE p.id = pick_id
            AND public.is_watch_group_member(p.group_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_pick_votes'
      AND policyname = 'watch_group_pick_votes_insert_self'
  ) THEN
    CREATE POLICY watch_group_pick_votes_insert_self
      ON public.watch_group_pick_votes
      FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.watch_group_picks p
          WHERE p.id = pick_id
            AND public.is_watch_group_member(p.group_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_pick_votes'
      AND policyname = 'watch_group_pick_votes_update_self'
  ) THEN
    CREATE POLICY watch_group_pick_votes_update_self
      ON public.watch_group_pick_votes
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_pick_votes'
      AND policyname = 'watch_group_pick_votes_delete_self'
  ) THEN
    CREATE POLICY watch_group_pick_votes_delete_self
      ON public.watch_group_pick_votes
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watch_groups_owner_id
  ON public.watch_groups (owner_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_members_user_id
  ON public.watch_group_members (user_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_members_group_id
  ON public.watch_group_members (group_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_picks_group_created
  ON public.watch_group_picks (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_group_pick_votes_pick
  ON public.watch_group_pick_votes (pick_id);
