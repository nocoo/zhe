# Zhe — URL Shortener

A minimal, self-hosted URL shortener built with Next.js, Cloudflare D1, and Auth.js.

## Development

```bash
bun install
bun run dev          # Start dev server on port 7005
```

## Testing, Linting & Git Hooks

### Test commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `bun run test`       | Watch mode (interactive development) |
| `bun run test:run`   | Run all tests once (UT + E2E)        |
| `bun run test:unit`  | Run unit/integration tests only      |
| `bun run test:e2e`   | Run E2E tests only                   |
| `bun run test:coverage` | Run all tests with coverage report |

### Coverage

Coverage is enforced by Vitest with the following thresholds:

- **Lines**: 90%
- **Statements**: 90%
- **Functions**: 85%
- **Branches**: 80%

Coverage includes source files (`lib/`, `models/`, `actions/`, `viewmodels/`, `hooks/`, `components/`, `app/` routes and pages) and excludes auto-generated code (Shadcn UI), config/schema files, and type declarations.

### Linting

```bash
bun run lint         # ESLint with zero warnings tolerance
```

Key rules:

- **Zero warnings** policy (`--max-warnings=0`)
- **No `.skip` or `.only`** in test files (enforced via `no-restricted-syntax`)
- Unused variables must be prefixed with `_`

### Git hooks (Husky)

Hooks are checked into the repo and automatically installed via `bun install` (the `prepare` script runs `husky`).

| Hook         | What runs                                  |
| ------------ | ------------------------------------------ |
| `pre-commit` | `bun run test:unit` — unit tests must pass |
| `pre-push`   | `bun run test:run` + `bun run lint` — full test suite and lint must pass |

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

- Tests use Vitest + React Testing Library + jsdom
- The global mock in `tests/setup.ts` intercepts `@/lib/db/d1-client` with an in-memory SQL parser
- Call `clearMockStorage()` from `tests/mocks/db-storage.ts` in `beforeEach` to reset state
- To test `d1-client.ts` itself, call `vi.unmock('@/lib/db/d1-client')` at the top of the test file
