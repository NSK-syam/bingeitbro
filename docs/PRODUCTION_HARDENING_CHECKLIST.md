# Production Hardening Checklist

Use this before and after deployment to keep BiB stable under growth.

## 1) Database (Supabase)

- Run `/Users/syam/Movie Recom/bib/supabase-performance-hardening.sql`.
- Confirm indexes exist:
  - `idx_watch_reminders_active_user_remind_at`
  - `idx_watch_reminders_email_due`
  - `idx_friend_recommendations_due_unwatched`
  - `idx_friend_recommendations_email_due_unwatched`
  - `idx_friend_recommendations_recipient_created`
- Verify cron SQL function uses current secret (no placeholder value).
- Keep `pg_cron` schedule for reminder dispatch every 5 minutes.

## 2) Critical Env Vars

- `SUPABASE_SERVICE_ROLE_KEY`
- `WATCH_REMINDER_CRON_SECRET`
- `UNOSEND_API_KEY`
- `UNOSEND_FROM`
- `UNOSEND_REPLY_TO` (recommended)
- `NEXT_PUBLIC_SITE_URL`

## 3) Email Deliverability

- SPF, DKIM, return-path records verified in Unosend.
- `hello@bingeitbro.com` domain shows **verified** in provider dashboard.
- Use a stable `From` name/email and do not rotate daily.
- Test Gmail + Outlook inbox placement from production domain.

## 4) Rate Limiting + Edge

- Keep app middleware limits enabled.
- Add Cloudflare dashboard rate limits for:
  - `/api/send-friend-recommendations`
  - `/api/notifications/friend-recommendations`
  - `/api/watch-reminders/dispatch-emails`
- Enable Cloudflare WAF managed rules.

## 5) Runtime Reliability

- API routes already use timeout + retry for external provider requests.
- Keep reminder/notification routes on `runtime = 'nodejs'`.
- Watch Cloudflare Workers error spikes (`1102`, `5xx`) after deploy.

## 6) Load-Test Smoke (Prelaunch)

- Signup burst (10-20 rps) should return clean validation + no 500 storm.
- Friend-send burst (5-10 rps) should stay below timeout limits.
- Reminder poll burst should stay fast (<500ms p95 typical).
- Run:
  - `npm run prelaunch`
  - `npm run build`

## 7) Post-Deploy Validation

- Manual checks:
  - Send friend recommendation email -> recipient receives.
  - Schedule watch reminder -> dispatch endpoint marks `email_sent_at`.
  - Scheduled friend reminder -> marks `reminder_email_sent_at`.
- DB sanity queries:
  - due-but-unsent rows decreasing after cron runs.
  - no large growth in failed reminder rows.

## 8) Monitoring Triggers

- Alert when:
  - Worker errors > 1% over 15 min.
  - `/api/watch-reminders/dispatch-emails` latency spikes.
  - Email provider 4xx/5xx increases.
- Keep weekly review of:
  - Supabase query performance
  - Cloudflare Worker error analytics
  - Email deliverability rate
