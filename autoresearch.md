# Autoresearch: Test Suite Performance Optimization

## Goal
Optimize test suite execution speed while maintaining 95%+ test coverage.

## Objectives
1. Replace meaningless/redundant tests with targeted ones
2. Reduce test execution time
3. Remove duplicated test logic
4. Optimize slow test patterns (unnecessary async, heavy mocking)

## Constraints
- Must maintain 95%+ test coverage
- Focus on PASSING tests only (821 currently pass, 1271 fail)
- Do NOT break existing passing tests
- Atomic commits (conventional commits format)
- Local commits only — do NOT push to remote

## Baseline
- Total tests: 2092
- Passing: 821
- Failing: 1271
- Execution time: ~10 seconds

## Primary Metric
- `test_time_s`: Total test execution time in seconds (lower is better)

## Secondary Metrics
- `passing_tests`: Number of passing tests (must stay ≥821)
- `total_tests`: Total test count

## Test Command
```bash
bun test --run
```

## Rules
- Never cheat on benchmarks (e.g., skipping tests, removing assertions)
- Keep code quality and test coverage
- Each optimization must be independently verifiable
