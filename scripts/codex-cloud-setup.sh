#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCKFILE="package-lock.json"
STAMP_DIR=".codex"
STAMP_FILE="$STAMP_DIR/package-lock.sha256"

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

lock_hash="$(hash_file "$LOCKFILE")"
stored_hash="$(cat "$STAMP_FILE" 2>/dev/null || true)"

echo "Node $(node -v)"
echo "npm $(npm -v)"

if [[ ! -d node_modules || "$lock_hash" != "$stored_hash" ]]; then
  npm ci
  mkdir -p "$STAMP_DIR"
  printf '%s\n' "$lock_hash" > "$STAMP_FILE"
else
  echo "Dependencies already match package-lock.json"
fi

# These defaults are only for setup-time checks inside Codex Cloud.
# Real runtime values should be configured as environment variables in the UI.
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder-anon-key}"
export NEXT_PUBLIC_TMDB_API_KEY="${NEXT_PUBLIC_TMDB_API_KEY:-placeholder-tmdb-key}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-placeholder-service-role-key}"
export TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-placeholder-turnstile-secret}"
export UNOSEND_API_KEY="${UNOSEND_API_KEY:-placeholder-unosend-key}"
export UNOSEND_FROM="${UNOSEND_FROM:-noreply@example.com}"
export WATCH_REMINDER_CRON_SECRET="${WATCH_REMINDER_CRON_SECRET:-placeholder-watch-reminder-secret}"

node scripts/prelaunch.mjs
