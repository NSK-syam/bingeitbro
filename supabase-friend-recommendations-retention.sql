-- Retention policy for friend_recommendations
-- 1) Delete watched recommendations after 10 days
-- 2) Keep only the latest 10 recommendations per sender -> recipient pair (FIFO)
-- Run in Supabase SQL Editor.

-- Optional but recommended for performance
create index if not exists idx_friend_recommendations_pair_created_at
  on public.friend_recommendations (sender_id, recipient_id, created_at desc);

create or replace function public.cleanup_friend_recommendations()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Delete watched items older than 10 days
  delete from public.friend_recommendations
  where is_watched = true
    and watched_at is not null
    and watched_at < now() - interval '10 days';

  -- Keep only latest 10 per sender -> recipient pair
  with ranked as (
    select id,
           row_number() over (partition by sender_id, recipient_id order by created_at desc, id desc) as rn
    from public.friend_recommendations
  )
  delete from public.friend_recommendations
  where id in (select id from ranked where rn > 10);
end;
$$;

revoke all on function public.cleanup_friend_recommendations() from public;

-- Schedule daily cleanup at 3:00 AM (optional)
-- If pg_cron isn't enabled, skip this and run the function from an Edge Function instead.
create extension if not exists pg_cron;
select cron.schedule(
  'cleanup_friend_recommendations_daily',
  '0 3 * * *',
  $$select public.cleanup_friend_recommendations();$$
);
