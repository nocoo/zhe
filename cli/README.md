# zhe CLI

CLI for managing zhe.to short links.

The built-in Connector enriches saved X posts, GitHub repositories, and missing webpage previews. GitHub snapshots include stars, default-branch commit counts and complete README text. It uses `GH_TOKEN` / `GITHUB_TOKEN` or your existing `gh auth login` in memory; public repositories also work without a GitHub login. GitHub collection needs no browser extension or FFmpeg. See [GitHub bookmarks](../docs/27-github-bookmarks.md).

## Installation

```bash
npm install -g @nocoo/zhe
# or
bun add -g @nocoo/zhe
```

## Usage

```bash
# Authenticate
zhe login

# Create a short link
zhe create https://example.com/long/url

# List your links
zhe list

# Get link details
zhe get 123

# Update a link
zhe update 123 --slug new-slug

# Delete a link
zhe delete 123

# Open a short link in browser
zhe open my-slug
```

## Commands

| Command | Description |
|---------|-------------|
| `zhe login` | Authenticate with API Key |
| `zhe logout` | Clear stored credentials |
| `zhe list` | List all links |
| `zhe create <url>` | Create a new short link |
| `zhe get <id>` | Get link details |
| `zhe update <id>` | Update a link |
| `zhe delete <id>` | Delete a link |
| `zhe open <slug>` | Open short URL in browser |
| `zhe connector status` | Show the combined enrichment queue and shared key expiry |
| `zhe connector once` | Process one X, GitHub, or webpage preview job |
| `zhe connector watch` | Poll the shared queue every 20 seconds |
| `zhe connector start` | Start the background Connector at macOS login |
| `zhe connector stop` | Stop and remove the macOS background service |
| `zhe connector eagle` | Configure the optional Eagle image sidecar |

## Automatic X enrichment

Save a link through the website, Webhook, API, or `zhe create`. The Connector picks up saved X posts in the background, reads the exact post through your local browser session, and archives its text, images, and videos in Zhe. The card updates automatically without a page reload. No LLM or separate Connector installation is required.

Use Node.js ≥ 22.16. OpenCLI is included as a pinned dependency; install its [browser extension](https://github.com/jackwener/opencli), sign in to X in that browser, and install FFmpeg with `ffprobe` on PATH (`brew install ffmpeg` on macOS).

On Zhe's API Keys page, create a key with `connector:write`; that is the only scope the Connector needs. Login accepts any valid key, including keys with a single read or write scope. Other commands enforce their own permissions: add `links:read` to list links and `links:write` to create them. Then:

```bash
zhe login
zhe connector status
zhe connector start
```

The Connector reads the same login configuration on every poll. API keys never expire by default; when creating one, you can explicitly choose 30, 7, 3 or 1 days. Connector and ordinary API requests honor that same expiry. Revoking the key stops further Connector mutations. The background service contains no key or X cookies.

On Linux or Windows, run `zhe connector watch` under your normal process supervisor. Keep the browser extension connected and the machine awake. Failed media does not prevent saving the post text; retry is available in the post details. The current limits are 64 MiB per video and 10 MiB per image. Protected accounts and browser challenges are not supported.

`watch` shows timestamped queue counts, the current link/post and retry attempt, text capture, media download percentages, verification, uploads, and poster generation. Slow stages continue to report activity every 10 seconds. Results include elapsed time and session totals for complete/partial/failed jobs, archived/skipped media, and confirmed upload bytes. Processing is serial, with a 20-second wait after each poll finishes. `Ctrl+C` prints the final totals and stops.

Use `zhe connector watch --json` for newline-delimited JSON events, or `zhe connector once` for a single job. `once --json` and `status --json` also support scripted use. Background logs contain no ANSI animation, API keys, browser cookies, post text, or raw upstream errors.

Archived files use Zhe's existing R2 file-sharing behavior. Delete a video to remove its poster too; delete a bookmark to remove all of its archived attachments. Removing an attachment explicitly prevents a later retry from restoring it.

See the [implementation and operations guide](../docs/25-x-bookmark-connector.md) for the job lifecycle, storage cleanup, and verification procedure.

The optional [Eagle sidecar](../docs/26-eagle-sidecar.md) writes 1–4 post images in parallel to a configured local GDrive Eagle library. It is off by default and requires macOS/Linux and Python 3.9+ in addition to FFmpeg. Enable it with `zhe connector eagle --library '/absolute/path/Collection.library' --enable`, then restart the Connector. Its queue, deadlines, retries and logs are independent of Zhe enrichment. The CLI is published to npm as `@nocoo/zhe` with the same version as the web application.

## Automatic webpage previews

The same `once`, `watch`, and background service discover ordinary saved links whose `screenshotUrl` is missing or blank. X/Twitter and GitHub domains, including their subdomains and profile pages, are excluded; GitHub keeps its shared preview. Existing screenshots are preserved. Install and connect the OpenCLI browser extension; webpage screenshots do not require FFmpeg.

Pages render at a 1280×960 desktop viewport with 2× device pixel density, then save as **1600×1200 WebP**. Quality starts at 80 and drops to 70 or 60 only if needed to fit **512 KiB**. The Connector saves the exact page viewport, including its path, rather than a full-page image. Zhe stores it at `{userHash}/YYYYMMDD/{uuid}.webp` and publishes the configured CDN URL. Cards refresh automatically while the dashboard is visible.

X, GitHub and previews share a serial scheduler: sources take turns, each account has at most one active job across clients and keys, and each poll waits for its job and cleanup to finish before the next 20-second pause. Lease renewal, bounded retries and idempotent uploads prevent duplicate work. URL changes, manual replacements, deletion and revoked keys fence out late writes. See [webpage previews](../docs/28-webpage-previews.md) for the storage and deployment contract.

## Configuration

Config file location: `~/.config/zhe/config.json`

Run `zhe login` in the same user or agent environment as `connector watch`: an isolated home directory has its own configuration. `missing_api_key` means the CLI could not find a saved key and sent no request. HTTP 401 means Zhe rejected the supplied key; use `zhe logout`, then `zhe login` in that environment to replace it.

## License

MIT
