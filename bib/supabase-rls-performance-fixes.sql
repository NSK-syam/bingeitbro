-- Supabase RLS performance/linter cleanup
-- Safe to run multiple times.
-- Fixes:
-- 1) auth_rls_initplan warnings by wrapping auth.* calls as (select auth.*()) in policies
-- 2) multiple_permissive_policies warnings by consolidating overlapping SELECT policies
-- 3) duplicate_index warning on users(username)

begin;

-- 1) Rewrite policy expressions to avoid per-row re-evaluation of auth helpers.
DO $$
DECLARE
  rec RECORD;
  using_expr TEXT;
  check_expr TEXT;
  new_using TEXT;
  new_check TEXT;
BEGIN
  FOR rec IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      p.polname AS policy_name,
      pg_get_expr(p.polqual, p.polrelid) AS using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    using_expr := rec.using_expr;
    check_expr := rec.check_expr;

    new_using := using_expr;
    IF new_using IS NOT NULL THEN
      new_using := replace(new_using, 'auth.uid()', '(select auth.uid())');
      new_using := replace(new_using, 'auth.role()', '(select auth.role())');
      new_using := replace(new_using, 'auth.jwt()', '(select auth.jwt())');
      new_using := replace(new_using, '(select (select auth.uid()))', '(select auth.uid())');
      new_using := replace(new_using, '(select (select auth.role()))', '(select auth.role())');
      new_using := replace(new_using, '(select (select auth.jwt()))', '(select auth.jwt())');
      new_using := regexp_replace(
        new_using,
        '\(select\s+\(select\s+auth\.uid\(\)\)\)',
        '(select auth.uid())',
        'gi'
      );
      new_using := regexp_replace(
        new_using,
        '\(select\s+\(select\s+auth\.role\(\)\)\)',
        '(select auth.role())',
        'gi'
      );
      new_using := regexp_replace(
        new_using,
        '\(select\s+\(select\s+auth\.jwt\(\)\)\)',
        '(select auth.jwt())',
        'gi'
      );
    END IF;

    new_check := check_expr;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, 'auth.jwt()', '(select auth.jwt())');
      new_check := replace(new_check, '(select (select auth.uid()))', '(select auth.uid())');
      new_check := replace(new_check, '(select (select auth.role()))', '(select auth.role())');
      new_check := replace(new_check, '(select (select auth.jwt()))', '(select auth.jwt())');
      new_check := regexp_replace(
        new_check,
        '\(select\s+\(select\s+auth\.uid\(\)\)\)',
        '(select auth.uid())',
        'gi'
      );
      new_check := regexp_replace(
        new_check,
        '\(select\s+\(select\s+auth\.role\(\)\)\)',
        '(select auth.role())',
        'gi'
      );
      new_check := regexp_replace(
        new_check,
        '\(select\s+\(select\s+auth\.jwt\(\)\)\)',
        '(select auth.jwt())',
        'gi'
      );
    END IF;

    IF using_expr IS NOT NULL AND new_using IS DISTINCT FROM using_expr THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        rec.policy_name,
        rec.schema_name,
        rec.table_name,
        new_using
      );
    END IF;

    IF check_expr IS NOT NULL AND new_check IS DISTINCT FROM check_expr THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        rec.policy_name,
        rec.schema_name,
        rec.table_name,
        new_check
      );
    END IF;
  END LOOP;
END $$;

-- 2a) Consolidate friend_recommendations SELECT policies.
DO $$
BEGIN
  IF to_regclass('public.friend_recommendations') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view sent recommendations" ON public.friend_recommendations';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view received recommendations" ON public.friend_recommendations';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'friend_recommendations'
        AND policyname = 'Users can view related recommendations'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY "Users can view related recommendations"
          ON public.friend_recommendations
          FOR SELECT
          USING (
            (select auth.uid()) = sender_id
            OR (select auth.uid()) = recipient_id
          )
      $sql$;
    END IF;
  END IF;
END $$;

-- 2b) Consolidate friends SELECT policies.
DO $$
BEGIN
  IF to_regclass('public.friends') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own friends" ON public.friends';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friends';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'friends'
        AND policyname = 'Users can view their own friendships'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY "Users can view their own friendships"
          ON public.friends
          FOR SELECT
          USING (
            (select auth.uid()) = user_id
            OR (select auth.uid()) = friend_id
          )
      $sql$;
    END IF;
  END IF;
END $$;

-- 2c) Consolidate nudges SELECT policies.
DO $$
BEGIN
  IF to_regclass('public.nudges') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view received nudges" ON public.nudges';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view sent nudges" ON public.nudges';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'nudges'
        AND policyname = 'Users can read related nudges'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY "Users can read related nudges"
          ON public.nudges
          FOR SELECT
          USING (
            (select auth.uid()) = to_user_id
            OR (select auth.uid()) = from_user_id
          )
      $sql$;
    END IF;
  END IF;
END $$;

-- 3) Remove duplicate users(username) index if it is not backing a constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'users_username_unique'
      AND c.relkind = 'i'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.conindid = 'public.users_username_unique'::regclass
  ) THEN
    DROP INDEX public.users_username_unique;
  END IF;
END $$;

commit;

-- Optional quick verification:
-- 1) auth wrappers now in policy text
-- select schemaname, tablename, policyname, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%');
--
-- 2) duplicate index gone
-- select indexname from pg_indexes where schemaname = 'public' and tablename = 'users' and indexname in ('users_username_key','users_username_unique');
