#!/usr/bin/env bash
# Complexity bench: counts file/function violations and verifies unit tests pass.
# Primary metric: violations = files_over_400 + funcs_over_100 (lower is better).
# Quality gate: ALL unit tests must pass.
set -uo pipefail
cd "$(dirname "$0")"

now() { python3 -c 'import time; print(time.time())'; }
elapsed() { python3 -c "print(round($2-$1,2))"; }

# ---- Complexity scan ----
SCAN_JSON=$(mktemp)
python3 scripts/complexity_check.py > "$SCAN_JSON" 2>/dev/null
SCAN_EXIT=$?

read_metric() { python3 -c "import json; d=json.load(open('$SCAN_JSON')); print(d.get('$1',0))" 2>/dev/null || echo 0; }
VIOLATIONS=$(read_metric violations)
FILES_OVER=$(read_metric files_over_400)
FUNCS_OVER=$(read_metric funcs_over_100)
MAX_FILE=$(read_metric max_file_lines)
MAX_FUNC=$(read_metric max_func_lines)
FILES_SCANNED=$(read_metric total_files_scanned)

# Show top violators for visibility
python3 -c "
import json
d=json.load(open('$SCAN_JSON'))
print('--- top file violations ---')
for path,n in d['file_violations'][:10]:
    print(f'  {n:5d}  {path}')
print('--- top function violations ---')
for path,line,length in d['func_violations'][:10]:
    print(f'  {length:5d}  {path}:{line}')
" 2>/dev/null || true

# ---- Unit tests ----
UNIT_LOG=$(mktemp)
U_START=$(now)
bun run test:unit > "$UNIT_LOG" 2>&1
U_EXIT=$?
U_END=$(now)
U_S=$(elapsed "$U_START" "$U_END")

STRIP_ANSI='s/\x1b\[[0-9;]*[mGKH]//g'
TF_PASS=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -oE 'Test Files +[0-9]+ passed' | tail -1 | grep -oE '[0-9]+' || echo 0)
TF_FAIL=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -oE 'Test Files .*[0-9]+ failed' | tail -1 | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0)
T_PASS=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -E '^ +Tests +[0-9]+ passed' | tail -1 | grep -oE '[0-9]+' | head -1 || echo 0)
T_FAIL=$(sed -E "$STRIP_ANSI" "$UNIT_LOG" | grep -E '^ +Tests +.*[0-9]+ failed' | tail -1 | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0)

# Anti-cheat: lock to current totals (100 files / 2444 tests). Refactor must not
# silently drop tests; if a test file accidentally stops being collected, fail.
MIN_FILES=100
MIN_TESTS=2444
SUITE_OK=1
if [ "${TF_PASS:-0}" -lt "$MIN_FILES" ] || [ "${T_PASS:-0}" -lt "$MIN_TESTS" ]; then
  SUITE_OK=0
fi

echo "---- unit tail ----"; tail -8 "$UNIT_LOG"

echo "---- METRICS ----"
echo "METRIC violations=$VIOLATIONS"
echo "METRIC files_over_400=$FILES_OVER"
echo "METRIC funcs_over_100=$FUNCS_OVER"
echo "METRIC max_file_lines=$MAX_FILE"
echo "METRIC max_func_lines=$MAX_FUNC"
echo "METRIC files_scanned=$FILES_SCANNED"
echo "METRIC unit_s=$U_S"
echo "METRIC test_files=${TF_PASS:-0}"
echo "METRIC tests_passed=${T_PASS:-0}"
echo "METRIC tests_failed=${T_FAIL:-0}"
echo "METRIC unit_exit=$U_EXIT"
echo "METRIC suite_ok=$SUITE_OK"

cp "$UNIT_LOG" /tmp/last-unit-run.log
cp "$SCAN_JSON" /tmp/last-complexity.json
rm -f "$UNIT_LOG" "$SCAN_JSON"

if [ "$U_EXIT" -ne 0 ] || [ "$SUITE_OK" -ne 1 ] || [ "$SCAN_EXIT" -ne 0 ]; then
  exit 1
fi
exit 0
