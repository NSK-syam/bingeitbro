# Codex Security Setup

Use Codex Security against the `NSK-syam/bingeitbro` repository, not the wrapper repo `NSK-syam/Movie-Recom`.

Reason: in `Movie-Recom`, the `bib/` directory is a Git submodule entry, so a scan there would not analyze the real Next.js application code.

## Recommended Codex Cloud environment

- Repository: `NSK-syam/bingeitbro`
- Branch: `main`
- Setup script: `bash scripts/codex-cloud-setup.sh`
- Maintenance script: `bash scripts/codex-cloud-maintenance.sh`
- Optional app start command: `bash scripts/codex-cloud-start.sh`
- Optional app URL: `http://127.0.0.1:3000`

## Environment variables

For a safe first pass, placeholders are enough:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
NEXT_PUBLIC_TMDB_API_KEY=placeholder-tmdb-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
TURNSTILE_SECRET_KEY=placeholder-turnstile-secret
UNOSEND_API_KEY=placeholder-unosend-key
UNOSEND_FROM=noreply@example.com
WATCH_REMINDER_CRON_SECRET=placeholder-watch-reminder-secret
```

If you later need live validation, replace placeholders with real values as environment variables in Codex Cloud.

Do not put required runtime values in the "Secrets" field only. Codex Cloud setup secrets are only available to setup scripts and are removed before the agent phase.

## Suggested first security invariants

- Unauthenticated signup attempts must fail without a valid CAPTCHA token.
- `POST /api/watch-reminders/dispatch-emails` must fail without the correct cron secret.
- `POST /api/stripe/webhook` must fail when the Stripe signature is missing or invalid.
- TMDB proxy routes must only forward requests to `api.themoviedb.org`.
