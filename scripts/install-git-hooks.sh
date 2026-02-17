#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

chmod +x scripts/secret-scan.sh .githooks/pre-commit

git config core.hooksPath .githooks

echo "Installed git hooks path: .githooks"
echo "Pre-commit secret scan is now active for this clone."
