# Autoresearch ideas (deferred / candidate optimizations)

## Current focus: L1 unit tests (vitest)

### Active backlog

- **Real baseline ~4.7s, not 4.21s.** Re-baselined with 5 trials at HEAD (#97): 4.62 / 4.68 / 4.71 / 4.97 / 6.62 — median 4.71. Earlier "best" 4.11–4.21 runs were lucky single trials. Noise envelope is ±0.5s with P99 occasionally jumping to 6.6s (probably GC + worker startup variance). To find more wins, **either fix the noise source (e.g. force minWorkers=maxWorkers + warm pool) OR target ≥0.7s structural reductions.**
- **Confirmed dead ends in this session (#89–#96):**
  - Conditional jest-dom import (skip in node env) — no improvement; saved transform but didn't move wall.
  - Extracting d1 mock factory body to sibling file (~1600 lines out of setup.ts) — no improvement; transform is cached per worker, not per file.
  - `deps.optimizer.web` pre-bundling React/RTL/cmdk — significantly worse (+1.5s); optimizer pre-bundle path adds startup cost.
  - `@vitejs/plugin-react-swc` instead of `plugin-react` — slightly worse for this workload.
  - `coverage.processingConcurrency=8` — within noise.
  - Splitting `search-command-dialog.test.tsx` further (after the first split) — no win; per-file overhead ≥ savings.
  - `vi.mock('@testing-library/dom')` to lower waitFor interval 50→5ms — significantly worse; vi.mock factory has high per-file overhead.
  - Dropping html+json coverage reporters — no win; reporters write at end, not on hot path.

- **Vitest `projects` with mixed `isolate` settings.** Move tests/unit/* (node) into a project with `isolate: false` to skip per-file thread reuse cost (saves ~50ms × ~50 files = ~2.5s aggregate). Currently fails on 6 `*-actions.test.ts` files due to shared `vi.mock('@/lib/db/scoped')` collisions — would need to rewrite those files to use `vi.doMock` inside `beforeEach` or scoped fake adapters before the switch.
- **Split `inbox-triage.test.tsx` (43 tests, 1.4s wall).** Largest remaining jsdom file after the search-command-dialog split. Same approach as the dialog split: extract to two siblings with duplicated `vi.mock` boilerplate (mocks must be hoisted per-file; cannot live in a shared helper).
- **Split `ideas-viewmodel.test.ts` (26 tests, 1.4s wall).** Each test costs ~50ms because of one `waitFor` per test. Splitting alone won't help unless `waitFor` is also fast-pathed.
- **Replace `userEvent.type(input, "abc")` with `fireEvent.change`.** `userEvent.type` simulates each keystroke (~10ms each); for tests asserting only the final state, `fireEvent.change(input, { target: { value: "abc" } })` is ~1ms. Tradeoff: loses keyboard-event coverage. Apply only to tests that have explicit keyboard assertions elsewhere.
- **Audit other tests for real `setTimeout` / network waits.** d1-client's retry tests were the biggest offender (saved ~1s). `scoped-db.test.ts:1561` has a 10ms sleep for `updatedAt` deduping — could be replaced by `vi.setSystemTime`.
- **Investigate whether `@testing-library/jest-dom/vitest` matchers can be lazy-imported only by jsdom files.** Currently loaded for every test file via `tests/setup.ts`. Splitting setup into base (always) and dom (jsdom-only) would shave per-worker import cost — but vitest 4 lacks per-environment `setupFiles`; would require `projects`.
- **Pre-bundle vite deps for vitest.** Long `import 9s` aggregate suggests transform/resolve overhead. `cacheDir` is on by default; explicit `deps.optimizer.web.include` for heavy deps (react, testing-library, cmdk, radix) might amortize.

### Deferred (from earlier autoresearch session, L2/L3/Worker)

- Pre-build `.next` once before the bench (L3 webServer) and reuse via custom command.
- Switch L3 from `next dev --turbopack` to `next start` after pre-building.
- Persist Playwright `.auth/user.json` between bench runs and skip the auth.setup project.
- Single shared dev server for L2 + L3.
- Move per-route `networkidle` waits in long L3 specs to deterministic locator waits.
