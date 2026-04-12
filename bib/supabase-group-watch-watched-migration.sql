-- Group watched state for watch group picks.
-- Run this once in Supabase SQL editor for existing projects.

CREATE TABLE IF NOT EXISTS public.watch_group_pick_watches (
  pick_id UUID NOT NULL REFERENCES public.watch_group_picks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pick_id, user_id)
);

ALTER TABLE public.watch_group_pick_watches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watch_group_pick_watches'
      AND policyname = 'watch_group_pick_watches_select_member'
  ) THEN
    CREATE POLICY watch_group_pick_watches_select_member
      ON public.watch_group_pick_watches
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
    WHERE tablename = 'watch_group_pick_watches'
      AND policyname = 'watch_group_pick_watches_insert_self'
  ) THEN
    CREATE POLICY watch_group_pick_watches_insert_self
      ON public.watch_group_pick_watches
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
    WHERE tablename = 'watch_group_pick_watches'
      AND policyname = 'watch_group_pick_watches_delete_self'
  ) THEN
    CREATE POLICY watch_group_pick_watches_delete_self
      ON public.watch_group_pick_watches
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watch_group_pick_watches_pick
  ON public.watch_group_pick_watches (pick_id);
