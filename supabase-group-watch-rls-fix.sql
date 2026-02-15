-- Hotfix for existing projects where watch group creation fails with:
-- "new row violates row-level security policy for table watch_groups"
--
-- Run this once in Supabase SQL editor.

ALTER TABLE public.watch_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watch_groups_select_member ON public.watch_groups;
CREATE POLICY watch_groups_select_member
  ON public.watch_groups
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_watch_group_member(id)
  );

DROP POLICY IF EXISTS watch_groups_insert_owner ON public.watch_groups;
CREATE POLICY watch_groups_insert_owner
  ON public.watch_groups
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS watch_groups_update_owner ON public.watch_groups;
CREATE POLICY watch_groups_update_owner
  ON public.watch_groups
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS watch_groups_delete_owner ON public.watch_groups;
CREATE POLICY watch_groups_delete_owner
  ON public.watch_groups
  FOR DELETE
  USING (auth.uid() = owner_id);
