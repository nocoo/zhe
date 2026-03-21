#!/usr/bin/env bash
set -euo pipefail

# Ensure .next/types exists and is up-to-date.
# tsc --noEmit does NOT generate .next/types — only next dev/build does.
# tsconfig.json includes .next/types/**/*.ts for route type checking.
# Without this directory, tsc silently skips route type validation.

needs_rebuild=false

if [ ! -d ".next/types" ]; then
  echo "⚠️  .next/types not found — rebuild needed."
  needs_rebuild=true
else
  # Detect stale .next/types: compare route file structure.
  # If a route was renamed/deleted but .next/types still has the old entry,
  # tsc will report false-positive TS2307 errors.
  if command -v fd &>/dev/null; then
    actual_routes=$(fd 'route\.ts$' app/ 2>/dev/null | sort)
    cached_routes=$(fd 'route\.ts$' .next/types/app/ 2>/dev/null | sed 's|^\.next/types/||' | sort)
  else
    actual_routes=$(find app/ -name 'route.ts' 2>/dev/null | sort)
    cached_routes=$(find .next/types/app/ -name 'route.ts' 2>/dev/null | sed 's|^\.next/types/||' | sort)
  fi

  if [ "$actual_routes" != "$cached_routes" ]; then
    echo "⚠️  .next/types is stale — route files changed since last build."
    echo "   Actual routes and cached types differ. Rebuilding..."
    needs_rebuild=true
  fi
fi

if [ "$needs_rebuild" = true ]; then
  echo "   Running next build to regenerate route types..."
  rm -rf .next/types
  bun run build --no-lint
fi

exec bun x tsc --noEmit
