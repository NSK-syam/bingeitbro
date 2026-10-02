-- Native app (iOS/Android) push tokens for Firebase Cloud Messaging.
-- Run this in the Supabase SQL Editor (safe to re-run).
--
-- The server (src/app/api/native-push/register, src/lib/server/fcm.ts) uses the
-- service role key, which bypasses RLS. The policies below only allow a signed-in
-- user to see and manage their own rows if the table is ever used from a client.

create table if not exists public.native_push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_push_tokens_user_id_idx
  on public.native_push_tokens (user_id, updated_at desc);

alter table public.native_push_tokens enable row level security;

drop policy if exists "Users can view own native push tokens" on public.native_push_tokens;
create policy "Users can view own native push tokens" on public.native_push_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own native push tokens" on public.native_push_tokens;
create policy "Users can insert own native push tokens" on public.native_push_tokens
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own native push tokens" on public.native_push_tokens;
create policy "Users can update own native push tokens" on public.native_push_tokens
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own native push tokens" on public.native_push_tokens;
create policy "Users can delete own native push tokens" on public.native_push_tokens
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No anon access.
revoke all on public.native_push_tokens from anon;
