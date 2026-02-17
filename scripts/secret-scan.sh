#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---staged}"
if [[ "$MODE" != "--staged" && "$MODE" != "--all" ]]; then
  echo "Usage: bash scripts/secret-scan.sh [--staged|--all]" >&2
  exit 2
fi

PATTERN_HARD='-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z\-_]{20,}'
PATTERN_ASSIGN="(API[_-]?KEY|SECRET|TOKEN|PASSWORD|PRIVATE[_-]?KEY)[A-Z0-9_]*[[:space:]]*[:=][[:space:]]*[\"'][^\"']{20,}[\"']"
PATTERN_ALLOW='your[_-]|example|placeholder|changeme|dummy|sample|localhost|127\.0\.0\.1|test[_-]?key'

fail=0

scan_blob() {
  local display_path="$1"
  local content_file="$2"

  if ! grep -Iq . "$content_file"; then
    return
  fi

  local hard_hits
  hard_hits="$(grep -nE -- "$PATTERN_HARD" "$content_file" || true)"

  local assign_hits
  assign_hits="$(grep -nE -- "$PATTERN_ASSIGN" "$content_file" | grep -viE -- "$PATTERN_ALLOW" || true)"

  if [[ -n "$hard_hits" || -n "$assign_hits" ]]; then
    echo "Potential secrets found in $display_path:" >&2
    if [[ -n "$hard_hits" ]]; then
      echo "$hard_hits" | sed 's/^/  /' >&2
    fi
    if [[ -n "$assign_hits" ]]; then
      echo "$assign_hits" | sed 's/^/  /' >&2
    fi
    fail=1
  fi
}

scan_path_on_disk() {
  local path="$1"

  case "$path" in
    node_modules/*|.next/*|out/*|.open-next/*|build/*|dist/*|.git/*|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf|*.mp4|*.mov|*.zip|*.lock|package-lock.json)
      return
      ;;
  esac

  [[ -f "$path" ]] || return
  scan_blob "$path" "$path"
}

scan_staged_path() {
  local path="$1"

  case "$path" in
    node_modules/*|.next/*|out/*|.open-next/*|build/*|dist/*|.git/*|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf|*.mp4|*.mov|*.zip|*.lock|package-lock.json)
      return
      ;;
  esac

  local tmp
  tmp="$(mktemp)"
  if ! git show ":$path" > "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    return
  fi

  scan_blob "$path (staged)" "$tmp"
  rm -f "$tmp"
}

if [[ "$MODE" == "--all" ]]; then
  while IFS= read -r -d '' path; do
    scan_path_on_disk "$path"
  done < <(git ls-files -z)
else
  while IFS= read -r -d '' path; do
    scan_staged_path "$path"
  done < <(git diff --cached --name-only -z --diff-filter=ACM)
fi

if [[ "$fail" -ne 0 ]]; then
  echo >&2
  echo "Secret scan failed. Move credentials to env vars/secrets manager and rotate exposed values." >&2
  exit 1
fi

echo "Secret scan passed ($MODE)."
