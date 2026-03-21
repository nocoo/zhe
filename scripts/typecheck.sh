#!/usr/bin/env bash
set -euo pipefail

# Ensure .next/types exists and is up-to-date.
# tsc --noEmit does NOT generate .next/types — only next dev/build does.
# tsconfig.json includes .next/types/**/*.ts for route type checking.
# Without this directory, tsc silently skips route type validation.
if [ ! -d ".next/types" ]; then
  echo "⚠️  .next/types not found — running next build to generate route types..."
  bun run build --no-lint
fi

exec bun x tsc --noEmit
