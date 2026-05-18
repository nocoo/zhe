# Autoresearch Rules — Complexity Refactor

## Goal
Reduce code complexity by lowering the count of oversized files and functions in production code.

## Primary Metric
- `violations` = `files_over_400` + `funcs_over_100` (lower is better)

Secondary: `files_over_400`, `funcs_over_100`, `max_file_lines`, `max_func_lines`, `tests_passed`, `tests_failed`, `unit_s`.

## Targets (hard limits)
- Every production `.ts`/`.tsx` file must be ≤ 400 lines.
- Every function (declaration, expression, arrow, method) must be ≤ 100 lines.

## Scope
Production code only — analyzed by `scripts/complexity_check.py`:
- `app/`, `actions/`, `components/`, `viewmodels/`, `models/`, `hooks/`, `contexts/`, `lib/`
- `worker/src/`, `cli/src/`, `auth.ts`, `proxy.ts`
- Excludes: tests/, scripts/, *.d.ts, *.test.ts(x), *.spec.ts(x), node_modules/, .next/, coverage/

## Benchmark Command
`bash autoresearch.bench.sh` — runs complexity scan + unit tests; emits METRIC lines.

## Constraints (no cheating)
- **All unit tests must pass.** `tests_passed` ≥ 2444, `test_files` ≥ 100 (locked at baseline).
- **No silent test removal/skip.** Anti-cheat compares against locked totals.
- **No functional damage.** Refactors must preserve behavior — extract helpers, split modules, decompose JSX into subcomponents.
- **No fake reductions:**
  - Do NOT artificially split lines (e.g. one-statement-per-line expansion run in reverse). Refactors must produce meaningfully separated units.
  - Do NOT exclude files from the analyzer to "fix" violations.
  - Do NOT lower the 400/100 thresholds.
  - Do NOT move production code into `tests/` or `scripts/` to escape scanning.
- **Public API stability.** Re-export from original module paths when splitting, so importers don't break.

## Workflow
- One atomic commit per kept improvement (`log_experiment` with `keep` auto-commits).
- Do NOT push.
- Append deferred ideas to `autoresearch.ideas.md`.
- Time budget: 2 hours, ~20 iterations.
