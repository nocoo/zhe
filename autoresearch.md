# Autoresearch Rules

## Goal
Optimize total wall-clock time of L2 (API E2E), L3 (Playwright BDD), and Worker test suites without weakening coverage or stability.

## Primary Metric
- `total_seconds`: sum of worker + L2 + L3 wall-time (lower is better)

Secondary: `worker_s`, `l2_s`, `l3_s`, plus pass/fail/flake counts per layer.

## Benchmark Command
`bash autoresearch.bench.sh` — runs Worker, L2, L3 sequentially against current HEAD; emits METRIC lines.

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
