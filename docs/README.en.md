<p align="center">
  <img src="../assets/brand/icon-rounded.png" width="128" height="128" alt="Zhe" />
</p>

<h1 align="center">Zhe</h1>

<p align="center">Organize short links, ideas, and todos in a searchable personal workspace.</p>

<p align="center">
  <a href="https://zhe.to">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Zhe is a personal link and information manager. Save webpages, create short links, write Markdown ideas, organize nested todos, and find content through a shared search dialog. The web dashboard uses Google sign-in, while short links can be shared directly with other people.

The repository contains a Next.js application, a Cloudflare Worker for redirects and database proxying, and a command-line client for zhe.to. Data queries are scoped to the signed-in user; self-hosting requires authentication and storage configuration.

## Features

- Create and edit short links with custom slugs, expiration dates, notes, folders, and tags; sort uncategorized links through the Inbox.
- Inspect click records and source or regional statistics. The edge Worker reads KV first, then looks up uncached links through the origin and fills the cache.
- Write and search Markdown ideas with tags; create and update them through the API or CLI.
- Manage nested todos with dates, tags, icons, completion states, and move or reorder operations.
- Use Cmd/Ctrl + K to search links, ideas, and todos and open the matching content.
- Upload files to R2 for public URLs or temporary sharing; manage storage, import and export data, and connect Backy backups.
- Configure an AI provider, model, and key to suggest folders and tags for links, then review suggestions before applying them.
- Create scoped API keys for the REST API and CLI; retain access to the existing Webhook integration.

## Usage

Open [zhe.to](https://zhe.to) and sign in with an allowed Google account. Enter a target URL to create a link, optionally choosing its folder, tags, slug, and expiration. Ideas and todos have separate sections in the sidebar.

For command-line access, first create a key with the required scopes on the dashboard's API Keys page:

```bash
npm install -g @nocoo/zhe
zhe login
zhe create https://example.com/article --slug reading
zhe list
zhe idea list
```

The CLI stores its key in `~/.config/zhe/config.json`. Its API address is currently fixed to `https://zhe.to/api/v1`. Login verification needs link read access; creating or changing content also needs the corresponding write scope. See the [CLI README](../cli/README.md) and `zhe --help` for additional commands.

## Development

Install Bun and Node.js ≥ 22. Local end-to-end tests also need Wrangler on PATH. The main application, Worker, and CLI manage their dependencies separately:

```bash
git clone https://github.com/nocoo/zhe.git
cd zhe
bun install --frozen-lockfile
bun install --cwd worker --frozen-lockfile
bun install --cwd cli --frozen-lockfile
cp .env.example .env.local
```

Prepare your own Google OAuth application and an initialized D1 database, then configure D1, KV, and the origin using the [Worker configuration template](../worker/wrangler.toml.example). Next.js currently accesses D1 through the Worker proxy; Cloudflare REST API credentials alone are insufficient for database queries.

| Configuration | Purpose |
| --- | --- |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Auth.js and Google sign-in; local callback: `http://localhost:7006/api/auth/callback/google` |
| `D1_PROXY_URL`, `D1_PROXY_SECRET` | Next.js access to the Worker's D1 proxy |
| `AUTH_ALLOWED_EMAILS` | Comma-separated sign-in allowlist; when empty, any account completing Google sign-in is allowed |
| `R2_*` | Upload endpoint, bucket, credentials, public domain, and user-path salt |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_KV_NAMESPACE_ID` | Origin writes to KV; these cache writes are skipped when unconfigured |
| `WORKER_SECRET` | Authentication between the origin and Worker for analytics, cleanup, and cache synchronization |
| `TRUSTED_ORIGINS`, `PUBLIC_ORIGIN` | Trusted hosts and public URL behind a reverse proxy |

The Worker uses the `DB` and `LINKS_KV` bindings plus `ORIGIN_URL`, `WORKER_SECRET`, and `D1_PROXY_SECRET`. Every half hour it triggers temporary-file cleanup and a catch-up KV sync when data has changed. For a new deployment, check the [database schema](../lib/db/schema.ts) against the [migration files](../drizzle/migrations/). Historical migrations include differences from manual schema changes; the local test bootstrap compensates for them and should not be used directly as a production installer.

```bash
bun run dev
bun run lint
bun run typecheck
bun run build
bun run start
```

Development and production start on port `7006`. Configure AI and Backy separately in the dashboard; basic link, idea, and todo features work without them.

## Tests

| Layer | Run from the repository root |
| --- | --- |
| Unit and component tests | `bun run test:unit` |
| Application integration tests | `bun run test:integration` |
| API end-to-end tests | `bun run test:api` |
| Browser end-to-end tests | `bun run test:e2e:pw` |
| Worker unit tests | `bun run --cwd worker test` |
| CLI unit tests | `bun run --cwd cli test` |

Run `bunx playwright install chromium` before browser tests. API and browser tests use ports `17006` and `27006`, respectively, and automatically start a local D1 / KV Worker (`8788`) and an R2 file server (`18788`). Data lives in `.test-storage/`. Run the two end-to-end suites separately because they share these local resources. No remote D1, KV, or R2 test accounts or credentials are required. See [scripts/test-stack.ts](../scripts/test-stack.ts) for startup and cleanup behavior.

Browser tests still need a nonempty `AUTH_SECRET` in the environment or `.env.local`; the API runner supplies a test value when it is absent. Tests sign in through a test Credentials provider and do not verify real Google OAuth.

## Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)

| Area | Implementation |
| --- | --- |
| Web and UI | Next.js, React, TypeScript, Tailwind CSS, Basalt |
| Authentication and data | Auth.js / Google OAuth, Cloudflare D1, Drizzle schema |
| Redirects and files | Cloudflare Workers, KV, R2, S3 API |
| Optional AI | Vercel AI SDK, @nocoo/next-ai |
| CLI and testing | Bun, @nocoo/base-cli, Vitest, Testing Library, Playwright, Biome |

## Documentation

- [Ideas](19-ideas-feature.md)
- [Todos](21-todos-feature.md)
- [Unified search](23-global-search-unification.md)
- [AI link organization suggestions](24-ai-link-suggestions.md)
- [Backy integration](10-backy.md)
- [CLI usage](../cli/README.md)

## License

The repository currently has no root license file. The CLI package metadata declares MIT.
