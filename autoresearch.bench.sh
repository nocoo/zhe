#!/usr/bin/env bash
# L3 Playwright benchmark — total wall time of full suite.
set -uo pipefail
cd "$(dirname "$0")"

# Load test proxy creds
set -a
source .env.local
set +a
export D1_PROXY_URL="${D1_TEST_PROXY_URL:-$D1_PROXY_URL}"
export D1_PROXY_SECRET="${D1_TEST_PROXY_SECRET:-$D1_PROXY_SECRET}"

# Kill any lingering servers
lsof -ti:27006 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 1

LOG=$(mktemp)
START=$(python3 -c 'import time; print(time.time())')
bun x playwright test --reporter=line > "$LOG" 2>&1
EXIT=$?
END=$(python3 -c 'import time; print(time.time())')

TOTAL=$(python3 -c "print(round($END-$START,2))")

PASSED=$(grep -oE '[0-9]+ passed' "$LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
FAILED=$(grep -oE '[0-9]+ failed' "$LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
FLAKY=$(grep -oE '[0-9]+ flaky' "$LOG" | head -1 | grep -oE '[0-9]+' || echo 0)
SKIPPED=$(grep -oE '[0-9]+ skipped' "$LOG" | head -1 | grep -oE '[0-9]+' || echo 0)

echo "---- tail of log ----"
tail -40 "$LOG"
echo "---- METRICS ----"
echo "METRIC total_seconds=$TOTAL"
echo "METRIC passed=${PASSED:-0}"
echo "METRIC failed=${FAILED:-0}"
echo "METRIC flaky=${FLAKY:-0}"
echo "METRIC skipped=${SKIPPED:-0}"
echo "METRIC exit_code=$EXIT"

cp "$LOG" /tmp/last-l3-run.log
rm "$LOG"

# Treat flaky/failed as "successful run for benchmarking" — we want to optimize even broken state
exit 0
