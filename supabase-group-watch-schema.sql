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
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.watch_group_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.watch_groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT watch_group_invites_no_self CHECK (inviter_id <> invitee_id)
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

CREATE OR REPLACE FUNCTION public.respond_watch_group_invite(
  p_invite_id UUID,
  p_decision TEXT
)
RETURNS TABLE (
  invite_id UUID,
  group_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.watch_group_invites%ROWTYPE;
  v_status TEXT;
BEGIN
  IF p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid invite decision.';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.watch_group_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found.';
  END IF;

  IF v_invite.invitee_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to respond to this invite.';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN QUERY
      SELECT v_invite.id, v_invite.group_id, v_invite.status;
    RETURN;
  END IF;

  v_status := p_decision;

  IF v_status = 'accepted' THEN
    -- Use dynamic SQL to avoid PL/pgSQL name conflicts with the output column `group_id`.
    EXECUTE
      'INSERT INTO public.watch_group_members (group_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO NOTHING'
    USING v_invite.group_id, v_invite.invitee_id, 'member';
  END IF;

  UPDATE public.watch_group_invites
  SET status = v_status,
      updated_at = NOW(),
      responded_at = NOW()
  WHERE id = v_invite.id;

  RETURN QUERY
    SELECT v_invite.id, v_invite.group_id, v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_watch_group_seen(p_group_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.watch_group_members AS m
  SET last_seen_at = NOW()
  WHERE m.group_id = p_group_id
    AND m.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_watch_group_unseen_counts(p_group_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  group_id UUID,
  unseen_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.group_id,
    COUNT(*)::BIGINT AS unseen_count
  FROM public.watch_group_members m
  JOIN public.watch_group_picks p
    ON p.group_id = m.group_id
  WHERE m.user_id = auth.uid()
    AND (p_group_ids IS NULL OR m.group_id = ANY (p_group_ids))
    AND p.created_at > m.last_seen_at
    AND p.sender_id <> m.user_id
  GROUP BY m.group_id;
$$;

DROP TRIGGER IF EXISTS watch_groups_after_insert ON public.watch_groups;
CREATE TRIGGER watch_groups_after_insert
  AFTER INSERT ON public.watch_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_watch_group();

ALTER TABLE public.watch_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_group_invites ENABLE ROW LEVEL SECURITY;
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
      USING (
        owner_id = auth.uid()
        OR public.is_watch_group_member(id)
      );
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
    WHERE tablename = 'watch_group_invites'
      AND policyname = 'watch_group_invites_select_related'
  ) THEN
    CREATE POLICY watch_group_invites_select_related
      ON public.watch_group_invites
      FOR SELECT
      USING (
        auth.uid() = invitee_id OR
        auth.uid() = inviter_id OR
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
    WHERE tablename = 'watch_group_invites'
      AND policyname = 'watch_group_invites_insert_owner'
  ) THEN
    CREATE POLICY watch_group_invites_insert_owner
      ON public.watch_group_invites
      FOR INSERT
      WITH CHECK (
        status = 'pending'
        AND inviter_id = auth.uid()
        AND auth.uid() = (
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
    WHERE tablename = 'watch_group_invites'
      AND policyname = 'watch_group_invites_update_invitee_or_owner'
  ) THEN
    CREATE POLICY watch_group_invites_update_invitee_or_owner
      ON public.watch_group_invites
      FOR UPDATE
      USING (
        auth.uid() = invitee_id OR
        auth.uid() = inviter_id
      )
      WITH CHECK (
        (
          auth.uid() = invitee_id
          AND status IN ('accepted', 'rejected')
        ) OR (
          auth.uid() = inviter_id
          AND status IN ('pending', 'canceled')
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

CREATE INDEX IF NOT EXISTS idx_watch_group_members_last_seen
  ON public.watch_group_members (group_id, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_watch_group_invites_group_id
  ON public.watch_group_invites (group_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_invites_invitee_id
  ON public.watch_group_invites (invitee_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_invites_inviter_id
  ON public.watch_group_invites (inviter_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_group_invites_pending
  ON public.watch_group_invites (group_id, invitee_id)
  WHERE status = 'pending';

REVOKE ALL ON FUNCTION public.respond_watch_group_invite(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_watch_group_invite(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_watch_group_seen(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_watch_group_seen(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_watch_group_unseen_counts(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_watch_group_unseen_counts(UUID[]) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_watch_group_picks_group_created
  ON public.watch_group_picks (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_group_pick_votes_pick
  ON public.watch_group_pick_votes (pick_id);
