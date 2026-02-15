-- Fix: "column reference group_id is ambiguous" when accepting a group invite.
-- Supabase does not allow setting plpgsql.variable_conflict at the function level,
-- so we avoid the conflict by using dynamic SQL for the INSERT.

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

REVOKE ALL ON FUNCTION public.respond_watch_group_invite(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_watch_group_invite(UUID, TEXT) TO authenticated;

