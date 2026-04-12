#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCKFILE="package-lock.json"
STAMP_FILE=".codex/package-lock.sha256"

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

current_hash="$(hash_file "$LOCKFILE")"
stored_hash="$(cat "$STAMP_FILE" 2>/dev/null || true)"

if [[ ! -d node_modules || "$current_hash" != "$stored_hash" ]]; then
  bash scripts/codex-cloud-setup.sh
else
  echo "Codex Cloud maintenance: dependencies are current."
fi
