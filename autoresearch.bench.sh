#!/usr/bin/env bash
<<<<<<< Updated upstream
# Benchmark pre-commit + pre-push hook wall-clock time.
# Emits METRIC lines parsed by autoresearch.
set -uo pipefail

run_stage() {
  local name="$1"; shift
  local start end dur status
  start=$(python3 -c 'import time;print(time.time())')
  "$@" >/tmp/ar_stage_${name}.log 2>&1
  status=$?
  end=$(python3 -c 'import time;print(time.time())')
  dur=$(python3 -c "print(f'{${end}-${start}:.3f}')")
  echo "METRIC ${name}_s=${dur}"
  if [ $status -ne 0 ]; then
    echo "STAGE_FAIL ${name} (exit=$status)" >&2
    tail -40 /tmp/ar_stage_${name}.log >&2
    return $status
  fi
  return 0
}

cd "$(dirname "$0")"

T0=$(python3 -c 'import time;print(time.time())')

# pre-commit stages
run_stage l1_unit_cov bun run test:unit:coverage || exit 1
run_stage l1_integration bun run test:integration || exit 1
run_stage g1_typecheck bun run typecheck || exit 1
# lint-staged needs staged files; emulate by linting the same set the hook would touch.
# Use eslint on changed files vs origin/main; fall back to nothing if no diff.
LINT_FILES=$(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | tr '\n' ' ')
if [ -z "${LINT_FILES// }" ]; then
  # No diff — lint a small representative sample so the timing is non-zero & realistic.
  LINT_FILES="lib/version.ts"
fi
run_stage g1_lint bun x eslint --max-warnings=0 $LINT_FILES || exit 1

if command -v gitleaks &>/dev/null; then
  run_stage g2_gitleaks gitleaks detect --no-banner --no-git || exit 1
fi

# pre-push stages
run_stage l2_api bun run test:api || exit 1

if command -v osv-scanner &>/dev/null; then
  run_stage g2_osv osv-scanner scan --lockfile=bun.lock || exit 1
=======
# Benchmark the actual git hook scripts end-to-end.
# Measures pre-commit + pre-push wall-clock time as a developer would experience.
set -uo pipefail

cd "$(dirname "$0")"

# Make sure the hooks see at least one staged TS file so lint-staged does work.
# Stage a representative file (lib/version.ts) without disturbing user state.
STASH_NEEDED=0
if ! git diff --cached --quiet || ! git diff --quiet; then
  git stash push --keep-index --include-untracked -m "autoresearch-bench-$$" >/dev/null 2>&1 || true
  STASH_NEEDED=1
fi
RESTORE_STAGE=$(mktemp)
git diff --cached --name-only > "$RESTORE_STAGE"
git add lib/version.ts >/dev/null 2>&1 || true

cleanup() {
  # Restore staging area to original
  git reset >/dev/null 2>&1 || true
  while IFS= read -r f; do [ -n "$f" ] && git add "$f" 2>/dev/null || true; done < "$RESTORE_STAGE"
  rm -f "$RESTORE_STAGE"
  if [ "$STASH_NEEDED" = "1" ]; then
    git stash pop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

T0=$(python3 -c 'import time;print(time.time())')

# pre-commit
PRE_T0=$(python3 -c 'import time;print(time.time())')
bash .husky/pre-commit >/tmp/ar_precommit.log 2>&1
PRE_STATUS=$?
PRE_T1=$(python3 -c 'import time;print(time.time())')
PRE_DUR=$(python3 -c "print(f'{${PRE_T1}-${PRE_T0}:.3f}')")
echo "METRIC pre_commit_s=${PRE_DUR}"
if [ $PRE_STATUS -ne 0 ]; then
  echo "❌ pre-commit failed" >&2
  tail -100 /tmp/ar_precommit.log >&2
  exit $PRE_STATUS
fi

# pre-push
PUSH_T0=$(python3 -c 'import time;print(time.time())')
bash .husky/pre-push >/tmp/ar_prepush.log 2>&1
PUSH_STATUS=$?
PUSH_T1=$(python3 -c 'import time;print(time.time())')
PUSH_DUR=$(python3 -c "print(f'{${PUSH_T1}-${PUSH_T0}:.3f}')")
echo "METRIC pre_push_s=${PUSH_DUR}"
if [ $PUSH_STATUS -ne 0 ]; then
  echo "❌ pre-push failed" >&2
  tail -100 /tmp/ar_prepush.log >&2
  exit $PUSH_STATUS
>>>>>>> Stashed changes
fi

T1=$(python3 -c 'import time;print(time.time())')
TOTAL=$(python3 -c "print(f'{${T1}-${T0}:.3f}')")
echo "METRIC total_seconds=${TOTAL}"
