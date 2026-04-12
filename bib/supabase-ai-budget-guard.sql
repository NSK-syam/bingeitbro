-- AI budget guard for Gemini "what to watch" calls
-- Hard-stops API usage once cumulative spend reaches configured limit.

create table if not exists public.ai_budget_guard (
  scope text primary key,
  spent_usd numeric(12,6) not null default 0,
  hard_limit_usd numeric(12,2) not null default 5,
  updated_at timestamptz not null default now()
);

insert into public.ai_budget_guard (scope, spent_usd, hard_limit_usd)
values ('what_to_watch_gemini', 0, 5)
on conflict (scope) do nothing;

alter table public.ai_budget_guard enable row level security;

grant select, insert, update on table public.ai_budget_guard to service_role;

create or replace function public.ai_budget_status(
  p_scope text,
  p_default_limit numeric default 5
)
returns table(
  spent_usd numeric,
  limit_usd numeric,
  remaining_usd numeric,
  blocked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_limit numeric;
begin
  insert into public.ai_budget_guard(scope, hard_limit_usd)
  values (p_scope, p_default_limit)
  on conflict (scope) do nothing;

  select g.spent_usd, g.hard_limit_usd
  into v_spent, v_limit
  from public.ai_budget_guard g
  where g.scope = p_scope;

  if v_limit is null then
    v_limit := p_default_limit;
  end if;
  if v_spent is null then
    v_spent := 0;
  end if;

  return query
  select
    v_spent,
    v_limit,
    greatest(v_limit - v_spent, 0),
    (v_spent >= v_limit);
end;
$$;

create or replace function public.consume_ai_budget(
  p_scope text,
  p_amount numeric,
  p_default_limit numeric default 5
)
returns table(
  allowed boolean,
  spent_usd numeric,
  limit_usd numeric,
  remaining_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_limit numeric;
  v_next numeric;
begin
  if p_amount is null or p_amount < 0 then
    p_amount := 0;
  end if;

  insert into public.ai_budget_guard(scope, hard_limit_usd)
  values (p_scope, p_default_limit)
  on conflict (scope) do nothing;

  select g.spent_usd, g.hard_limit_usd
  into v_spent, v_limit
  from public.ai_budget_guard g
  where g.scope = p_scope
  for update;

  if v_limit is null then
    v_limit := p_default_limit;
  end if;
  if v_spent is null then
    v_spent := 0;
  end if;

  v_next := v_spent + p_amount;

  if v_next > v_limit then
    return query
    select false, v_spent, v_limit, greatest(v_limit - v_spent, 0);
    return;
  end if;

  update public.ai_budget_guard
  set spent_usd = v_next, updated_at = now()
  where scope = p_scope;

  return query
  select true, v_next, v_limit, greatest(v_limit - v_next, 0);
end;
$$;

revoke all on function public.ai_budget_status(text, numeric) from public;
revoke all on function public.consume_ai_budget(text, numeric, numeric) from public;
grant execute on function public.ai_budget_status(text, numeric) to service_role;
grant execute on function public.consume_ai_budget(text, numeric, numeric) to service_role;
