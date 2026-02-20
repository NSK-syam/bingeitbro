-- Allow all group members to rename their group safely via RPC.
-- Run this once in Supabase SQL editor for existing projects.

CREATE OR REPLACE FUNCTION public.rename_watch_group(
  p_group_id UUID,
  p_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := btrim(COALESCE(p_name, ''));
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
    RAISE EXCEPTION 'Group name must be between 2 and 60 characters.';
  END IF;

  IF NOT public.is_watch_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not allowed to rename this group.';
  END IF;

  UPDATE public.watch_groups
  SET name = v_name,
      updated_at = NOW()
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_watch_group(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_watch_group(UUID, TEXT) TO authenticated;
