#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder-anon-key}"
export NEXT_PUBLIC_TMDB_API_KEY="${NEXT_PUBLIC_TMDB_API_KEY:-placeholder-tmdb-key}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-placeholder-service-role-key}"
export TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-placeholder-turnstile-secret}"
export UNOSEND_API_KEY="${UNOSEND_API_KEY:-placeholder-unosend-key}"
export UNOSEND_FROM="${UNOSEND_FROM:-noreply@example.com}"
export WATCH_REMINDER_CRON_SECRET="${WATCH_REMINDER_CRON_SECRET:-placeholder-watch-reminder-secret}"

if [[ ! -f .next/BUILD_ID ]]; then
  npm run build
fi

exec npm run start -- --hostname 0.0.0.0 --port "${PORT:-3000}"
