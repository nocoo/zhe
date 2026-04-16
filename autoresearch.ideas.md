# Autoresearch Ideas: Test Performance Optimization

## Completed
- [x] Remove unnecessary setTimeout in beforeEach (~1s improvement)

## Promising but Deferred

### High Impact
1. **Create shared mock factories** - Extract common vi.mock patterns into shared files (e.g., `tests/mocks/actions.ts`, `tests/mocks/contexts.ts`). Many test files mock the same modules with identical patterns.

2. **Use test.concurrent for independent tests** - Tests that don't share state could run concurrently. Need to identify which tests are truly isolated.

3. **Optimize setup.ts D1 mock** - The 1670-line D1 mock is parsed for every test file. Could potentially be lazy-loaded or split by domain (links, uploads, etc.).

4. **Component test batching** - Component tests have ~2-3s overhead each. Could consolidate related component tests into single files to reduce React Testing Library initialization overhead.

### Medium Impact
5. **Remove unused mock setups** - Some test files mock modules they don't actually test. Audit and remove unused mocks.

6. **Parameterized auth tests** - 36+ tests check "returns Unauthorized". Could use `it.each` for table-driven tests.

7. **Split slow test files** - Files like `scoped-db.test.ts` (159 tests, 1982 lines) could be split by domain for better parallelization.

### Low Impact
8. **Remove console.error suppression** - Some tests suppress console.error globally which adds overhead. Could be more targeted.

9. **Use vitest workspace** - Split into workspaces (unit, integration, component) with different configs optimized for each type.

## Rejected Ideas
- `isolate: false` - Causes test pollution, makes results unreliable
- `pool: 'forks'` - Slightly slower than threads for this project

## Notes
- Baseline: 10.80s (2092 tests, 821 pass)
- Current: ~9.7s (same tests, same pass count)
- Component tests are the slowest (2.5-3.5s each, mostly failing)
- Worker tests are most efficient (72 tests in 64ms)
