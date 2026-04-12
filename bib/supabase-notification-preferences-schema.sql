-- Push notification category preferences for BiB accounts.
-- Default-on model: missing rows should be treated as all categories enabled.

create extension if not exists pgcrypto;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  chats_enabled boolean not null default true,
  recommendations_enabled boolean not null default true,
  schedule_enabled boolean not null default true,
  announcements_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can view own notification preferences" on public.notification_preferences;
create policy "Users can view own notification preferences" on public.notification_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own notification preferences" on public.notification_preferences;
create policy "Users can insert own notification preferences" on public.notification_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own notification preferences" on public.notification_preferences;
create policy "Users can update own notification preferences" on public.notification_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own notification preferences" on public.notification_preferences;
create policy "Users can delete own notification preferences" on public.notification_preferences
  for delete
  using (auth.uid() = user_id);

create or replace function public.touch_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at
  before update on public.notification_preferences
  for each row execute function public.touch_notification_preferences_updated_at();
