# Zhe — URL Shortener

A minimal, self-hosted URL shortener built with Next.js, Cloudflare D1, and Auth.js.

## Development

```bash
bun install
bun run dev          # Start dev server on port 7005
```

## Testing, Linting & Git Hooks

This project enforces code quality through automated testing, linting, and git hooks. **All checks must pass before code can be committed or pushed.**

### Quick start

```bash
bun install              # Install deps + set up git hooks automatically
bun run test             # Watch mode (interactive development)
bun run lint             # ESLint with zero warnings tolerance
bun run test:coverage    # Full test suite with coverage report
```

### Test commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `bun run test`          | Watch mode (interactive development) |
| `bun run test:run`      | Run all tests once (UT + E2E)        |
| `bun run test:unit`     | Run unit/integration tests only      |
| `bun run test:e2e`      | Run E2E tests only                   |
| `bun run test:coverage` | Run all tests with coverage report   |

### Coverage

Coverage is enforced by Vitest with the following thresholds (CI and `test:coverage` will fail if not met):

| Metric       | Threshold |
| ------------ | --------- |
| Lines        | 90%       |
| Statements   | 90%       |
| Functions    | 85%       |
| Branches     | 80%       |

**Included**: `lib/`, `models/`, `actions/`, `viewmodels/`, `hooks/`, `components/` (non-UI), `app/` routes and pages, `middleware.ts`.

**Excluded**: Shadcn UI primitives (`components/ui/`), config/schema files, type declarations, `node_modules/`, `tests/`, auth catch-all route.

If a module is difficult to test, prefer splitting it into a testable pure-logic layer and a thin I/O wrapper rather than suppressing coverage.

### Linting

```bash
bun run lint             # ESLint with zero warnings tolerance
```

Key rules:

- **Zero warnings** policy (`--max-warnings=0`) — warnings are treated as errors
- **No `.skip` or `.only`** in test files (enforced via `no-restricted-syntax`) — every test must run, skipping tests is not allowed
- Unused variables must be prefixed with `_`
- Extends `next/core-web-vitals` and `next/typescript`

### Git hooks (Husky)

Hooks are checked into the repo under `.husky/` and **automatically installed** when you run `bun install` (the `prepare` script runs `husky`). No manual setup required for new team members.

| Hook         | What runs                              | Purpose                                      |
| ------------ | -------------------------------------- | --------------------------------------------- |
| `pre-commit` | `bun run test:unit` + `bunx lint-staged` | Unit tests must pass; staged files are linted |
| `pre-push`   | `bun run test:run` + `bun run lint`    | Full test suite (UT + E2E) and full lint      |

**lint-staged** is configured in `package.json` to run `eslint --max-warnings=0` on staged `*.{ts,tsx}` files, providing fast incremental lint feedback on every commit.

> **Note**: Hooks cannot be bypassed. The `--no-verify` flag is discouraged; the ESLint config enforces that `.skip` and `.only` are compile errors, and coverage thresholds are enforced in CI.

### Test structure

```
tests/
├── setup.ts                  # Global test setup (D1 mock, jsdom config)
├── mocks/
│   └── db-storage.ts         # In-memory SQL mock for D1
├── unit/                     # Unit tests for lib, models, viewmodels, hooks
├── components/               # Component tests (React Testing Library)
├── integration/              # Integration tests (multi-module flows)
└── e2e/                      # E2E tests (API route handlers)
```

### Writing tests

- Tests use **Vitest** + **React Testing Library** + **jsdom**
- The global mock in `tests/setup.ts` intercepts `@/lib/db/d1-client` with an in-memory SQL parser
- Call `clearMockStorage()` from `tests/mocks/db-storage.ts` in `beforeEach` to reset state
- To test `d1-client.ts` itself, call `vi.unmock('@/lib/db/d1-client')` at the top of the test file
- **Do not use** `describe.skip`, `it.skip`, `test.skip`, `describe.only`, `it.only`, or `test.only` — these are lint errors
- Individual lint suppressions (`// eslint-disable-next-line`) are allowed when justified with a comment
