-- Invite-only group join flow migration.
-- Run this once in Supabase SQL editor for existing projects.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE INDEX IF NOT EXISTS idx_watch_group_invites_group_id
  ON public.watch_group_invites (group_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_invites_invitee_id
  ON public.watch_group_invites (invitee_id);

CREATE INDEX IF NOT EXISTS idx_watch_group_invites_inviter_id
  ON public.watch_group_invites (inviter_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_group_invites_pending
  ON public.watch_group_invites (group_id, invitee_id)
  WHERE status = 'pending';

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
    INSERT INTO public.watch_group_members (group_id, user_id, role)
    VALUES (v_invite.group_id, v_invite.invitee_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;
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

ALTER TABLE public.watch_group_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watch_group_invites_select_related ON public.watch_group_invites;
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

DROP POLICY IF EXISTS watch_group_invites_insert_owner ON public.watch_group_invites;
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

DROP POLICY IF EXISTS watch_group_invites_update_invitee_or_owner ON public.watch_group_invites;
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

REVOKE ALL ON FUNCTION public.respond_watch_group_invite(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_watch_group_invite(UUID, TEXT) TO authenticated;
