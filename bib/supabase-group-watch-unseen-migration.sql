-- Unseen picks counters for Group Watch.
-- Run this once in Supabase SQL editor for existing projects.

ALTER TABLE public.watch_group_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_watch_group_members_last_seen
  ON public.watch_group_members (group_id, last_seen_at);

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

REVOKE ALL ON FUNCTION public.mark_watch_group_seen(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_watch_group_seen(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_watch_group_unseen_counts(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_watch_group_unseen_counts(UUID[]) TO authenticated;
