#!/usr/bin/env bash
# Compiles and runs the standalone WidgetOwnerGate tests with the host Swift toolchain.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
xcrun swiftc \
  "$ROOT/ios/App/App/WidgetOwnerGate.swift" \
  "$ROOT/scripts/mobile/widget-owner-gate-tests/main.swift" \
  -o "$OUT/widget-owner-gate-tests"
"$OUT/widget-owner-gate-tests"
