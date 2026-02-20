-- Create table to store chat themes
create table if not exists public.chat_themes (
  chat_id text primary key, -- Either 'direct:userId1_userId2' (sorted IDs) or 'group:groupId'
  theme_id text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.chat_themes enable row level security;

-- Drop existing policies if they exist (for idempotency)
drop policy if exists "Enable read access for all authenticated users" on public.chat_themes;
drop policy if exists "Enable insert/update for all authenticated users" on public.chat_themes;

-- Create policies
create policy "Enable read access for all authenticated users"
  on public.chat_themes for select
  to authenticated
  using (true);

create policy "Enable insert/update for all authenticated users"
  on public.chat_themes for insert
  to authenticated
  with check (true);

create policy "Enable insert/update for all authenticated users"
  on public.chat_themes for update
  to authenticated
  using (true)
  with check (true);
