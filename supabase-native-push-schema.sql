-- Native app push tokens for the Expo mobile shell.
-- Run this in the Supabase SQL Editor before testing app notifications.

create extension if not exists pgcrypto;

create table if not exists public.native_push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  token text unique not null,
  provider text not null default 'expo',
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.native_push_subscriptions enable row level security;

drop policy if exists "Users can manage their native push subscriptions" on public.native_push_subscriptions;
create policy "Users can manage their native push subscriptions" on public.native_push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists native_push_subscriptions_user_id_idx on public.native_push_subscriptions(user_id);
create index if not exists native_push_subscriptions_platform_idx on public.native_push_subscriptions(platform);

create or replace function public.touch_native_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists native_push_subscriptions_touch_updated_at on public.native_push_subscriptions;
create trigger native_push_subscriptions_touch_updated_at
  before update on public.native_push_subscriptions
  for each row execute function public.touch_native_push_subscriptions_updated_at();
