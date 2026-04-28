#!/usr/bin/env bash
set -euo pipefail

# Ensure .next/types exists and is up-to-date.
# tsc --noEmit does NOT generate .next/types — only next dev/build does.
# tsconfig.json includes .next/types/**/*.ts for route type checking.
# Without this directory, tsc silently skips route type validation.
#
# Next 16 collapsed per-route .next/types/app/**/route.ts files into a
# single .next/types/routes.d.ts, so freshness is checked by comparing
# its mtime against the newest source file under app/.

needs_rebuild=false
ROUTES_DTS=".next/types/routes.d.ts"

if [ ! -f "$ROUTES_DTS" ]; then
  echo "⚠️  .next/types/routes.d.ts not found — rebuild needed."
  needs_rebuild=true
else
  if command -v fd &>/dev/null; then
    newest_app=$(fd -e ts -e tsx . app/ -x stat -f '%m %N' 2>/dev/null | sort -nr | head -1 | awk '{print $1}')
  else
    newest_app=$(find app -type f \( -name '*.ts' -o -name '*.tsx' \) -exec stat -f '%m' {} \; 2>/dev/null | sort -nr | head -1)
  fi
  routes_mtime=$(stat -f '%m' "$ROUTES_DTS" 2>/dev/null || echo 0)
  if [ -n "${newest_app:-}" ] && [ "$newest_app" -gt "$routes_mtime" ]; then
    echo "⚠️  .next/types/routes.d.ts is older than newest app/ source — rebuilding..."
    needs_rebuild=true
  fi
fi

if [ "$needs_rebuild" = true ]; then
  echo "   Running next build to regenerate route types..."
  rm -rf .next/types
  bun run build
fi

exec bun x tsc --noEmit
