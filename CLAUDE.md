README.md

## Versioning

### Single Source of Truth

The **only** authoritative version number lives in `package.json` `"version"` field. All runtime references must read from `process.env.npm_package_version` (auto-injected by npm/bun at runtime) with the current `package.json` version as fallback. **Never hardcode version strings elsewhere.**

### Semantic Versioning (SemVer)

Follow strict [SemVer 2.0.0](https://semver.org/):

| Bump | When | Example |
|------|------|---------|
| **major** (X.0.0) | Breaking change to public API, DB schema migration, auth flow change | 1.0.0 -> 2.0.0 |
| **minor** (x.Y.0) | New feature, new API endpoint, new page/module | 1.0.0 -> 1.1.0 |
| **patch** (x.y.Z) | Bug fix, typo, refactor, dependency update, UI text change | 1.0.0 -> 1.0.1 |

### Release Workflow

When the user requests a version bump (do NOT proactively suggest or create version bumps):

1. **Update version** in `package.json` via `npm version <major|minor|patch> --no-git-tag-version`
2. **Update fallback** version strings in `app/api/health/route.ts` and `app/api/live/route.ts` to match
3. **Update test assertions** that reference the fallback version
4. **Update CHANGELOG.md** — prepend a new `## [x.y.z] - YYYY-MM-DD` section (see format below)
5. **Commit**: `chore: bump version to x.y.z`
6. **Tag**: `git tag -a vx.y.z -m "vx.y.z"` (annotated tag, prefixed with `v`)
7. **Push**: `git push && git push --tags`
8. **GitHub Release**: `gh release create vx.y.z --title "vx.y.z" --notes-file -` piping the changelog section

### CHANGELOG.md Format

Follow [Keep a Changelog](https://keepachangelog.com/) convention:

```markdown
## [x.y.z] - YYYY-MM-DD

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

### Tag & Release Naming

- Git tag: `vx.y.z` (e.g., `v1.0.0`)
- GitHub release title: `vx.y.z`
- GitHub release body: copy the CHANGELOG.md section for that version

## Retrospective

- **Atomic commits**: Never bundle multiple logical changes (infra, model, viewmodel, view) into a single commit. Always split by layer/concern, even if they're part of the same feature. Each commit must be independently buildable and testable.
