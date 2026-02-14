-- Schedule watch reminder email dispatch from Supabase (every 5 minutes).
-- Run this in Supabase SQL Editor after:
-- 1) creating watch_reminders table schema
-- 2) setting WATCH_REMINDER_CRON_SECRET in Cloudflare
-- 3) replacing <YOUR_SECRET_VALUE> below with the same secret

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_watch_reminder_emails_http()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := 'https://bingeitbro.com/api/watch-reminders/dispatch-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-watch-reminder-secret', 'bib_wr_v1_9f2d7c4a1e8b6f3d0a5c9e2f7b4d8a1c6e3f0b9d2a7c4e1f'
      ),
      body := jsonb_build_object(
        'limit', 100
      )
    );
  exception when others then
    -- Never fail cron loop because of transient HTTP failures.
    return;
  end;
end;
$$;

-- Remove older job if it exists.
select cron.unschedule('dispatch_watch_reminder_emails_5min')
where exists (
  select 1 from cron.job where jobname = 'dispatch_watch_reminder_emails_5min'
);

-- Every 5 minutes
select cron.schedule(
  'dispatch_watch_reminder_emails_5min',
  '*/5 * * * *',
  $$select public.dispatch_watch_reminder_emails_http();$$
);
