# Autoresearch ideas (deferred / candidate optimizations)

## Current focus: L1 unit tests (vitest)

### Active backlog

- **Real baseline ~4.7s, not 4.21s.** Re-baselined with 5 trials at HEAD (#97): 4.62 / 4.68 / 4.71 / 4.97 / 6.62 — median 4.71. Earlier "best" 4.11–4.21 runs were lucky single trials. Noise envelope is ±0.5s with P99 occasionally jumping to 6.6s (probably GC + worker startup variance).

### ✅ Confirmed wins this session (#98–#119): 4.71s → 2.88s (−39%)
  - **#98–#101**: waitFor interval=5 (52 sites) + userEvent.type/click → fireEvent (~115 sites across 7 files).
  - **#107**: esbuild `target=esnext` + `legalComments=none` in vitest config.
  - **#108–#109**: jsdom → happy-dom (47 files + clipboard polyfill); removed jsdom devDep.
  - **#112**: `pool: 'vmThreads'` instead of `'threads'` — 0.76s median win. ⭐ biggest single config win.
  - **#115**: Lazy-load `@testing-library/jest-dom/vitest` matchers only when DOM env present (skip ~50 node-env files). −0.65s median (3.67 → 3.02s).
  - **#119**: `deps.optimizer.web` enabled with `include: ['react', 'react-dom', 'react-dom/client', '@testing-library/react']` — pre-bundles core React/RTL into a single optimized bundle so each vmThread context avoids re-resolving 100s of CJS deep-imports. −0.14s median (3.02 → 2.88s).

### Dead ends in #113–#140 (don't retry)
  - `vmThreads.useAtomics:true` (also tried with optimizer.web) — within noise / slightly worse.
  - `vmThreads.memoryLimit=0.5` — worse + higher variance (recycle cost).
  - `server.deps.inline=['cmdk']` and `optimizer.web.include` adding cmdk / @testing-library/dom / lucide-react / next-auth / sonner / cva / @radix-ui/react-dialog / react/jsx-runtime — each addition made it *slower* than the React/RTL core. The optimizer.web include set is a sweet spot.
  - `optimizer.web.exclude:['lucide-react']` — tightens variance (P90 ~3.05 vs 3.5+) but worsens median by ~0.08s.
  - `holdUntilCrawlEnd:false` and/or `noDiscovery:true` — worse, lets test start before bundle is ready and triggers re-bundle on miss.
  - `pool='threads'` even with optimizer.web — still loses to vmThreads (~3.6s median).
  - `pool='vmForks'` — worse (3.12s median); fork startup heavier than threads.
  - `isolate:false` for vmThreads — tests pass but median worse (3.18s) and 3/8 outliers >4s.
  - `vmThreads.minThreads=4` (with or without `maxThreads=8`) — pre-warm overhead exceeds savings.
  - `server.deps.fallbackCJS:true` — significantly worse (3.76s).
  - `react-dom` removed from `optimizer.web.include` (only `react-dom/client`) — catastrophic (4.9s).
  - Adding remaining 13 `vi.waitFor` sites with `interval:5` — within noise.
  - Extracting d1 mock factory body to `tests/mocks/d1-client-mock.ts` (reduces setup.ts 1695→82 lines) — worse + higher variance. Confirms idea #94: factory body transform is amortized; module-resolution overhead per file > savings.
  - `coverage.cleanOnRerun:false` and `coverage.processingConcurrency=1` — within noise / slightly worse.
  - `NODE_OPTIONS="--no-opt"` — Node rejects this flag in NODE_OPTIONS.

### Risks / gotchas hit
  - **shared-link-components.test.tsx**: `user.click` cannot be replaced by `fireEvent.click` because the CopyUrlButton checks state set by an awaited clipboard.writeText → setState. Without the await chain, the assertion fires before the success state lands.
  - Always remove unused `userEvent` imports after the conversion (eslint hard gate).

### Confirmed dead ends in this session (#89–#96)

### Remaining bottleneck (~2.85s wall floor)
  - Top files: inbox-triage 880ms, links-list 794ms, inbox-triage-interactions 775ms, sidebar 706ms, storage-page 650ms, link-card 635ms.
  - Per-happy-dom-file fixed overhead is ~470ms (transform 100ms + setup 65ms + import 160ms + environment 90ms). With 24 happy-dom files / 6 vm threads, that's ~1.9s of unavoidable overhead per worker pipeline.
  - Coverage v8 overhead: unit_s 2.15s vs unit_cov_s 2.88s = 0.73s.
  - Main run-to-run variance source: vite optimizer cache cold-start (occasional 4–5s outliers). Cache is in `node_modules/.vite/vitest/<hash>/deps_*`.

- **Try `poolOptions.vmThreads.useAtomics: true`** — untested, may further reduce sync overhead with vmThreads pool.
- **Try `poolOptions.vmThreads.memoryLimit`** — vmThreads can leak memory across files; tuning the recycling threshold may improve hot-path stability.
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
