create extension if not exists pgcrypto;

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  added_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists watchlist_items_user_added_at_idx
  on public.watchlist_items (user_id, added_at desc);

alter table public.watchlist_items enable row level security;

drop policy if exists "watchlist_items_select_own" on public.watchlist_items;
create policy "watchlist_items_select_own"
  on public.watchlist_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "watchlist_items_insert_own" on public.watchlist_items;
create policy "watchlist_items_insert_own"
  on public.watchlist_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "watchlist_items_update_own" on public.watchlist_items;
create policy "watchlist_items_update_own"
  on public.watchlist_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "watchlist_items_delete_own" on public.watchlist_items;
create policy "watchlist_items_delete_own"
  on public.watchlist_items
  for delete
  using (auth.uid() = user_id);
