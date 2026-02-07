-- Push notifications schema for BiB
-- Run this in Supabase SQL Editor.

create extension if not exists pg_net;
create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users can manage their push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- Optional: trigger to call Edge Function when a recommendation is inserted
-- Replace <YOUR_FUNCTION_URL> and <YOUR_FUNCTION_SECRET> with real values.
create or replace function public.notify_recommendation_push()
returns trigger
language plpgsql
as $$
begin
  -- Skip if not configured
  if '<YOUR_FUNCTION_URL>' = '' or '<YOUR_FUNCTION_SECRET>' = '' then
    return new;
  end if;

  -- Never block inserts if push fails
  begin
    perform
      net.http_post(
        url := '<YOUR_FUNCTION_URL>',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-secret', '<YOUR_FUNCTION_SECRET>'
        ),
        body := jsonb_build_object(
          'recipient_id', new.recipient_id,
          'sender_id', new.sender_id,
          'movie_title', new.movie_title
        )
      );
  exception when others then
    -- Swallow errors so recommendations still insert
    return new;
  end;

  return new;
end;
$$;

drop trigger if exists friend_rec_push_notify on public.friend_recommendations;
create trigger friend_rec_push_notify
  after insert on public.friend_recommendations
  for each row execute function public.notify_recommendation_push();
