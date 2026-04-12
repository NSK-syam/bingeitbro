-- Username availability check (bypasses RLS safely).
-- Run this in Supabase SQL Editor.

create or replace function public.check_username_available(username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_taken boolean;
begin
  if username is null or length(trim(username)) < 3 then
    return false;
  end if;

  select exists (
    select 1
    from public.users
    where lower(username) = lower(trim(username))
  ) into is_taken;

  return not is_taken;
end;
$$;

revoke all on function public.check_username_available(text) from public;
grant execute on function public.check_username_available(text) to anon, authenticated;
