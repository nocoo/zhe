README.md

## Versioning

### Single Source of Truth

The **only** authoritative version number lives in `package.json` `"version"` field (format: `1.2.3`).

- **Storage format**: bare semver `1.2.3` (in `package.json`)
- **Display format**: `v1.2.3` (git tags, GitHub releases, CHANGELOG headers, UI/docs)
- All runtime references import `APP_VERSION` from `lib/version.ts`, which reads `package.json` at build time
- **No hardcoded version strings anywhere** — `package.json` is the only place to update

### Version References

| File | Role |
|------|------|
| `package.json` | `"version"` field — **the only place to update** |
| `lib/version.ts` | Reads `package.json` and exports `APP_VERSION` |
| `app/api/health/route.ts` | Uses `APP_VERSION` (auto-updated) |
| `app/api/live/route.ts` | Uses `APP_VERSION` (auto-updated) |
| `tests/unit/live-route.test.ts` | Asserts against `APP_VERSION` (auto-updated) |
| `tests/e2e/api.test.ts` | Asserts against `APP_VERSION` (auto-updated) |

Before committing a version bump, run `rg 'OLD_VERSION' --glob '*.ts' --glob '*.tsx'` to catch any stragglers.

### Semantic Versioning (SemVer)

Follow strict [SemVer 2.0.0](https://semver.org/):

| Bump | When | Example |
|------|------|---------|
| **major** (X.0.0) | Breaking change to public API, DB schema migration, auth flow change | 1.0.0 -> 2.0.0 |
| **minor** (x.Y.0) | New feature, new API endpoint, new page/module | 1.0.0 -> 1.1.0 |
| **patch** (x.y.Z) | Bug fix, typo, refactor, dependency update, docs/config change | 1.0.0 -> 1.0.1 |

**Default**: If the user does not specify a bump level, default to **patch** (`x.y.Z`).

### Release Workflow

When the user requests a version bump (do NOT proactively suggest or create version bumps):

1. **Determine version**: Read current version from `package.json`. Apply the requested bump (default: patch). E.g. `1.2.0` -> `1.2.1`
2. **Search & update all version references**: Update every file in the checklist above. Verify with `rg` that no old version remains in source files
3. **Update CHANGELOG.md**: Prepend a new `## [vx.y.z] - YYYY-MM-DD` section. Content is derived from `git log` commits since the last tag
4. **Commit**: `chore: bump version to x.y.z`
5. **Push**: `git push` — triggers Vercel/Railway auto-deploy if configured
6. **Tag**: `git tag -a vx.y.z -m "vx.y.z"` (annotated, `v`-prefixed)
7. **Push tag**: `git push --tags`
8. **GitHub Release**: `gh release create vx.y.z --title "vx.y.z"` with CHANGELOG section as release notes

### CHANGELOG.md Format

Follow [Keep a Changelog](https://keepachangelog.com/) convention:

```markdown
## [vx.y.z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Fixed
- Bug fixes

### Removed
- Removed features
```

Only include sections that have entries. Use imperative mood ("add", not "added").

## Retrospective

- **Atomic commits**: Never bundle multiple logical changes (infra, model, viewmodel, view) into a single commit. Always split by layer/concern, even if they're part of the same feature. Each commit must be independently buildable and testable.
- **E2E port isolation**: E2E tests must use a dedicated port (17005) separate from the dev server (7005). Never reuse an existing dev server for E2E — Playwright always starts its own with `PLAYWRIGHT=1`. This avoids env-var mismatch bugs where the CredentialsProvider is missing.
- **Version bump find-replace safety**: When bumping versions in `package.json`, never use naive substring replacement (e.g. `sd '1.2.1' '1.2.2'`) because it can corrupt dependency versions (e.g. `^1.2.10` becomes `^1.2.20` when `1.2.1` is matched as a substring). Always use targeted edits scoped to the `"version"` field, or use word-boundary-aware regex.
- **HighlightText breaks `getByText`**: When a component splits text across multiple DOM elements (e.g. `<span>zhe.to/</span><mark>abc</mark>`), `screen.getByText("zhe.to/abc")` fails because no single element contains the full text. Use `data-value` attributes on parent elements (e.g. `[cmdk-item][data-value="slug"]`) to locate items, then assert on `element.textContent` which concatenates all child text nodes.
- **eslint-disable placement**: `// eslint-disable-next-line` only suppresses the immediately following line. If placed before a variable declaration but the lint violation is on a JSX return two lines below, it has no effect and creates an "unused eslint-disable" warning. Always place the directive directly above the offending line.

## Testing

### Unit & Integration (Vitest)

| Command | Description |
|---------|-------------|
| `bun run test` | Watch mode |
| `bun run test:run` | Single run (all tests) |
| `bun run test:unit` | Unit tests only (excludes `tests/e2e/`) |
| `bun run test:e2e` | Vitest-based E2E tests (mock-level) |
| `bun run test:coverage` | Coverage report |

### E2E (Playwright)

Playwright tests run a **dedicated** Next.js dev server on **port 17005** with `PLAYWRIGHT=1` and `AUTH_URL=http://localhost:17005`. This is completely isolated from the regular dev server (port 7005).

| Command | Description |
|---------|-------------|
| `bun run test:e2e:pw` | Run all 27 Playwright specs headless |
| `bun run test:e2e:pw:ui` | Open Playwright UI mode for debugging |

**How it works:**
- `playwright.config.ts` defines `webServer` that auto-starts a fresh Next.js instance on port 17005
- `reuseExistingServer: false` — always starts its own server, never reuses an existing one
- `PLAYWRIGHT=1` activates the `e2e-credentials` CredentialsProvider in `auth.ts`
- `AUTH_URL` is set to `http://localhost:17005` so NextAuth uses non-secure cookies
- Global setup inserts the test user into D1; global teardown cleans up

**Pre-push hook** (`bun run test:run` + `bun run lint` + `bun run test:e2e:pw`) runs automatically via husky.

### Port Allocation

| Port | Purpose |
|------|---------|
| 7005 | Development server (`bun run dev`) |
| 17005 | Playwright E2E test server (auto-managed) |
