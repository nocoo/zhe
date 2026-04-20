#!/usr/bin/env bash
# Unified bench: L2 (API E2E) + L3 (Playwright) + Worker tests.
# Runs each layer sequentially against the shared test D1 to avoid races.
# Primary metric (total_seconds) = sum of the three layers, so each
# component's improvement is visible. CI may run them in parallel separately.
set -uo pipefail
cd "$(dirname "$0")"

# Load env
set -a
source .env.local
set +a
export D1_PROXY_URL="${D1_TEST_PROXY_URL:-$D1_PROXY_URL}"
export D1_PROXY_SECRET="${D1_TEST_PROXY_SECRET:-$D1_PROXY_SECRET}"

# Kill stragglers
lsof -ti:17006 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:27006 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 1

now() { python3 -c 'import time; print(time.time())'; }
elapsed() { python3 -c "print(round($2-$1,2))"; }

WORKER_LOG=$(mktemp)
L2_LOG=$(mktemp)
L3_LOG=$(mktemp)

# --- Worker
WK_START=$(now)
( cd worker && bun run test ) > "$WORKER_LOG" 2>&1
WK_EXIT=$?
WK_END=$(now)
WK_S=$(elapsed "$WK_START" "$WK_END")

# --- L2 API E2E
L2_START=$(now)
bun run test:api > "$L2_LOG" 2>&1
L2_EXIT=$?
L2_END=$(now)
L2_S=$(elapsed "$L2_START" "$L2_END")

# --- L3 Playwright
L3_START=$(now)
bun x playwright test --reporter=line > "$L3_LOG" 2>&1
L3_EXIT=$?
L3_END=$(now)
L3_S=$(elapsed "$L3_START" "$L3_END")

TOTAL=$(python3 -c "print(round($WK_S + $L2_S + $L3_S, 2))")

# Counts
L2_PASS=$(grep -oE 'Tests +[0-9]+ passed' "$L2_LOG" | tail -1 | grep -oE '[0-9]+' || echo 0)
L2_FAIL=$(grep -oE '[0-9]+ failed' "$L2_LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
L3_PASS=$(grep -oE '[0-9]+ passed' "$L3_LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
L3_FAIL=$(grep -oE '[0-9]+ failed' "$L3_LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
L3_FLAKY=$(grep -oE '[0-9]+ flaky' "$L3_LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
WK_PASS=$(grep -oE 'Tests +[0-9]+ passed' "$WORKER_LOG" | tail -1 | grep -oE '[0-9]+' || echo 0)

echo "---- worker tail ----"; tail -10 "$WORKER_LOG"
echo "---- L2 tail ----"; tail -20 "$L2_LOG"
echo "---- L3 tail ----"; tail -20 "$L3_LOG"

echo "---- METRICS ----"
echo "METRIC total_seconds=$TOTAL"
echo "METRIC worker_s=$WK_S"
echo "METRIC l2_s=$L2_S"
echo "METRIC l3_s=$L3_S"
echo "METRIC l2_passed=${L2_PASS:-0}"
echo "METRIC l2_failed=${L2_FAIL:-0}"
echo "METRIC l3_passed=${L3_PASS:-0}"
echo "METRIC l3_failed=${L3_FAIL:-0}"
echo "METRIC l3_flaky=${L3_FLAKY:-0}"
echo "METRIC worker_passed=${WK_PASS:-0}"
echo "METRIC worker_exit=$WK_EXIT"
echo "METRIC l2_exit=$L2_EXIT"
echo "METRIC l3_exit=$L3_EXIT"

cp "$WORKER_LOG" /tmp/last-worker-run.log
cp "$L2_LOG" /tmp/last-l2-run.log
cp "$L3_LOG" /tmp/last-l3-run.log
rm -f "$WORKER_LOG" "$L2_LOG" "$L3_LOG"

exit 0
