# Autoresearch Rules

## Goal
Optimize pre-commit + pre-push hook total wall-clock time without weakening test/lint coverage.

## Primary Metric
- `total_seconds`: sum of pre-commit + pre-push hook execution time (lower is better)

## Benchmark Command
`bash autoresearch.bench.sh` — runs both hooks end-to-end against the current HEAD, captures per-stage timing, prints METRIC lines.

## Constraints (no cheating)
- All five quality layers must keep running and passing: L1 unit+integration+coverage gate (≥90%), G1 typecheck+lint, G2 gitleaks, L2 API E2E, G2 osv-scanner.
- Coverage thresholds (`lines:90 functions:85 branches:80 statements:90`) must NOT be lowered.
- ESLint `--max-warnings=0` must NOT be relaxed.
- Tests may be parallelized, cached, restructured, or moved between layers, but no test may be deleted or skipped silently.
- Hooks must still fail on the same conditions as before (broken tests, lint errors, secrets, vulnerabilities, type errors).

## Workflow
- One atomic commit per kept improvement.
- Do NOT push (user instruction).
- Append deferred ideas to `autoresearch.ideas.md`.
