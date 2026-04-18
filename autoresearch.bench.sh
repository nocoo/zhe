#!/usr/bin/env bash
# Benchmark the actual git hook scripts end-to-end.
set -uo pipefail

cd "$(dirname "$0")"

INDEX_BACKUP=$(mktemp)
cp .git/index "$INDEX_BACKUP"
git add lib/version.ts >/dev/null 2>&1 || true

cleanup() {
  cp "$INDEX_BACKUP" .git/index
  rm -f "$INDEX_BACKUP"
}
trap cleanup EXIT

now() { python3 -c 'import time;print(time.time())'; }
dur() { python3 -c "print(f'{$2-$1:.3f}')"; }

T0=$(now)

PRE_T0=$(now)
bash .husky/pre-commit >/tmp/ar_precommit.log 2>&1
PRE_STATUS=$?
PRE_T1=$(now)
echo "METRIC pre_commit_s=$(dur $PRE_T0 $PRE_T1)"
if [ $PRE_STATUS -ne 0 ]; then
  echo "❌ pre-commit failed" >&2
  tail -120 /tmp/ar_precommit.log >&2
  exit $PRE_STATUS
fi

PUSH_T0=$(now)
bash .husky/pre-push >/tmp/ar_prepush.log 2>&1
PUSH_STATUS=$?
PUSH_T1=$(now)
echo "METRIC pre_push_s=$(dur $PUSH_T0 $PUSH_T1)"
if [ $PUSH_STATUS -ne 0 ]; then
  echo "❌ pre-push failed" >&2
  tail -120 /tmp/ar_prepush.log >&2
  exit $PUSH_STATUS
fi

T1=$(now)
echo "METRIC total_seconds=$(dur $T0 $T1)"
