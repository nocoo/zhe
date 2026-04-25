#!/usr/bin/env bash
# UT bench: L1 unit tests with coverage.
# Primary metric: unit_cov_s (wall-clock seconds for vitest run + coverage).
# Quality gate: coverage thresholds must remain >= 95/85/90/95 (lines/branches/functions/statements)
#   AND vitest config thresholds must NOT be lowered.
set -uo pipefail
cd "$(dirname "$0")"

# Load env
set -a
source .env.local 2>/dev/null || true
set +a

now() { python3 -c 'import time; print(time.time())'; }
elapsed() { python3 -c "print(round($2-$1,2))"; }

UNIT_LOG=$(mktemp)
COV_LOG=$(mktemp)

# ---- Plain unit run (no coverage) ----
U_START=$(now)
bun run test:unit > "$UNIT_LOG" 2>&1
U_EXIT=$?
U_END=$(now)
U_S=$(elapsed "$U_START" "$U_END")

# ---- With coverage ----
C_START=$(now)
bun run test:unit:coverage --coverage.reporter=text --coverage.reporter=json-summary > "$COV_LOG" 2>&1
C_EXIT=$?
C_END=$(now)
C_S=$(elapsed "$C_START" "$C_END")

# Counts + coverage
# Strip ANSI escape codes before parsing (vitest 4 emits color codes even in non-tty pipes).
STRIP_ANSI='s/\x1b\[[0-9;]*[mGKH]//g'
TF_PASS=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -oE 'Test Files +[0-9]+ passed' | tail -1 | grep -oE '[0-9]+' || echo 0)
TF_FAIL=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -oE 'Test Files .*[0-9]+ failed' | tail -1 | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0)
T_PASS=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -E '^ +Tests +[0-9]+ passed' | tail -1 | grep -oE '[0-9]+' | head -1 || echo 0)
T_FAIL=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -E '^ +Tests +.*[0-9]+ failed' | tail -1 | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0)

# Parse from coverage-summary.json (json-summary reporter)
COV_JSON=coverage/coverage-summary.json
read_pct() { python3 -c "import json,sys; d=json.load(open('$COV_JSON'))['total']; print(d['$1']['pct'])" 2>/dev/null || echo 0; }
if [ -f "$COV_JSON" ]; then
  COV_LINES=$(read_pct lines)
  COV_STMTS=$(read_pct statements)
  COV_BRANCH=$(read_pct branches)
  COV_FUNCS=$(read_pct functions)
else
  COV_LINES=0; COV_STMTS=0; COV_BRANCH=0; COV_FUNCS=0
fi

# Quality gate: coverage thresholds must hold (95/85/90/95)
QUALITY_OK=1
python3 - <<EOF || QUALITY_OK=0
import sys
lines=$COV_LINES; stmts=$COV_STMTS; br=$COV_BRANCH; fn=$COV_FUNCS
ok = (lines >= 95 and stmts >= 95 and br >= 85 and fn >= 90)
sys.exit(0 if ok else 1)
EOF

# Verify thresholds in vitest config not lowered
THRESH_OK=1
python3 - <<'EOF' || THRESH_OK=0
import re,sys
src=open('vitest.config.ts').read()
m=re.search(r'thresholds:\s*\{([^}]+)\}', src)
if not m: sys.exit(1)
body=m.group(1)
def grab(k):
    mm=re.search(rf'{k}\s*:\s*([0-9]+)', body); return int(mm.group(1)) if mm else 0
ok=(grab('lines')>=95 and grab('statements')>=95 and grab('branches')>=85 and grab('functions')>=90)
sys.exit(0 if ok else 1)
EOF

echo "---- unit tail ----"; tail -8 "$UNIT_LOG"
echo "---- coverage tail ----"; tail -12 "$COV_LOG"

# Anti-cheat: ensure full suite ran. Lock to current totals (98 files / 2411 tests).
# If a config change silently drops files/tests (e.g. deps.optimizer breaks vi.mock),
# this catches it instead of declaring a phantom speed win.
MIN_FILES=98
MIN_TESTS=2411
SUITE_OK=1
if [ "${TF_PASS:-0}" -lt "$MIN_FILES" ] || [ "${T_PASS:-0}" -lt "$MIN_TESTS" ]; then
  SUITE_OK=0
fi

echo "---- METRICS ----"
echo "METRIC unit_cov_s=$C_S"
echo "METRIC unit_s=$U_S"
echo "METRIC cov_lines=${COV_LINES:-0}"
echo "METRIC cov_statements=${COV_STMTS:-0}"
echo "METRIC cov_branches=${COV_BRANCH:-0}"
echo "METRIC cov_functions=${COV_FUNCS:-0}"
echo "METRIC test_files=${TF_PASS:-0}"
echo "METRIC tests_passed=${T_PASS:-0}"
echo "METRIC tests_failed=${T_FAIL:-0}"
echo "METRIC unit_exit=$U_EXIT"
echo "METRIC cov_exit=$C_EXIT"
echo "METRIC quality_ok=$QUALITY_OK"
echo "METRIC threshold_ok=$THRESH_OK"
echo "METRIC suite_ok=$SUITE_OK"

cp "$UNIT_LOG" /tmp/last-unit-run.log
cp "$COV_LOG" /tmp/last-cov-run.log
rm -f "$UNIT_LOG" "$COV_LOG"

# Fail-out conditions: any test failed, any quality gate broken.
if [ "$U_EXIT" -ne 0 ] || [ "$C_EXIT" -ne 0 ] || [ "$QUALITY_OK" -ne 1 ] || [ "$THRESH_OK" -ne 1 ] || [ "$SUITE_OK" -ne 1 ]; then
  exit 1
fi
exit 0
