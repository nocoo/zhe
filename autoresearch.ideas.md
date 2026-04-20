# Autoresearch ideas (deferred / candidate optimizations)

## Current focus: L1 unit tests (vitest)

### Active backlog

- **Real baseline ~4.7s, not 4.21s.** Re-baselined with 5 trials at HEAD (#97): 4.62 / 4.68 / 4.71 / 4.97 / 6.62 — median 4.71. Earlier "best" 4.11–4.21 runs were lucky single trials. Noise envelope is ±0.5s with P99 occasionally jumping to 6.6s (probably GC + worker startup variance).

### ✅ Confirmed wins this session (#98–#112): 4.71s → 2.92s (−38%)
  - **#98**: `{ interval: 5 }` to all 52 waitFor calls in viewmodel + component tests.
  - **#99**: Replace 47 `userEvent.type` with `fireEvent.change` in `search-command-dialog{,-search}.test.tsx`.
  - **#100**: Replace remaining 8 `user.type` with `fireEvent.change` in 5 component files.
  - **#101**: Replace ~60 `user.click` + 2 `user.clear` with `fireEvent.click/change` in 5 component files.
  - **#107**: esbuild `target=esnext` + `legalComments=none` in vitest config.
  - **#108**: jsdom → happy-dom (47 files + clipboard polyfill). Biggest jsdom→DOM-impl swap win.
  - **#109**: Removed unused jsdom devDep.
  - **#112**: `pool: 'vmThreads'` instead of `'threads'` — 0.76s median win, all 97 files / 2401 tests still green. VM contexts have lower per-file startup cost than full worker_threads. ⭐ biggest single config win.
  - The earlier ideas.md note claiming `waitFor` interval doesn't matter was **WRONG**. Per-file timing improved dramatically (ideas-viewmodel 1.36→0.78s, search-command-dialog 1.6→0.5s).
  - **#111 dead end**: `pool: 'forks'` — 4.04s median, fork startup heavier than threads.

### Risks / gotchas hit
  - **shared-link-components.test.tsx**: `user.click` cannot be replaced by `fireEvent.click` because the CopyUrlButton checks state set by an awaited clipboard.writeText → setState. Without the await chain, the assertion fires before the success state lands.
  - Always remove unused `userEvent` imports after the conversion (eslint hard gate).

### Confirmed dead ends in this session (#89–#96)
  - Conditional jest-dom import (skip in node env) — no improvement; setup transform is amortized.
  - Extracting d1 mock factory body to sibling file (~1600 lines out of setup.ts) — transform is cached per worker.
  - `deps.optimizer.web` pre-bundling React/RTL/cmdk — significantly worse (+1.5s).
  - `@vitejs/plugin-react-swc` instead of `plugin-react` — slightly worse for this workload.
  - `coverage.processingConcurrency=8` — within noise.
  - Splitting `search-command-dialog.test.tsx` further — per-file overhead ≥ savings.
  - `vi.mock('@testing-library/dom')` to lower waitFor interval globally — vi.mock factory has high per-file overhead.
  - Dropping html+json coverage reporters — reporters write at end, not on hot path.

### Remaining bottleneck (~2.9s wall floor with vmThreads + happy-dom)
  - Top files (post-#112): inbox-triage 836ms, links-list 780ms, inbox-triage-interactions 705ms, sidebar 698ms, storage-page 653ms, link-card 625ms.
  - Critical path: ceil(N_dom_files / workers) × max_file_time. With ~6 vm threads and 836ms longest, floor ≈ 0.85–1.0s + ~1.5s setup/transform.
  - Coverage v8 overhead is now smaller relative to total (unit_s 2.17s vs unit_cov_s 2.92s = 0.75s).

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
