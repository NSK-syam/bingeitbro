-- Supabase linter/security warning fixes
-- Run in Supabase SQL Editor.

begin;

-- 1) Keep extensions out of public schema.
create schema if not exists extensions;

do $$
declare
  ext_name text;
begin
  foreach ext_name in array array['citext', 'pg_net']
  loop
    if exists (
      select 1
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      where e.extname = ext_name
        and n.nspname = 'public'
    ) then
      begin
        execute format('alter extension %I set schema extensions', ext_name);
        raise notice 'Moved extension % to schema "extensions".', ext_name;
      exception
        when others then
          -- Keep migration safe; report but do not fail whole transaction.
          raise notice 'Could not move extension %: %', ext_name, sqlerrm;
      end;
    end if;
  end loop;
end $$;

commit;

-- Verification
select e.extname as extension_name, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('citext', 'pg_net')
order by e.extname;

