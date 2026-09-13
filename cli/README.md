# zhe CLI

CLI for managing zhe.to short links.

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
| `zhe connector status` | Show the X enrichment queue and shared key expiry |
| `zhe connector once` | Enrich one saved X bookmark |
| `zhe connector watch` | Poll for saved X bookmarks every 20 seconds |
| `zhe connector start` | Start the background Connector at macOS login |
| `zhe connector stop` | Stop and remove the macOS background service |

## Automatic X enrichment

Save a link through the website, Webhook, API, or `zhe create`. The Connector picks up saved X posts in the background, reads the exact post through your local browser session, and archives its text, images, and videos in Zhe. The card updates automatically without a page reload. No LLM or separate Connector installation is required.

Use Node.js ≥ 22.16. OpenCLI is included as a pinned dependency; install its [browser extension](https://github.com/jackwener/opencli), sign in to X in that browser, and install FFmpeg with `ffprobe` on PATH (`brew install ffmpeg` on macOS).

On Zhe's API Keys page, create one key with `links:read` and `connector:write`. Add `links:write` to create links from the CLI too. Then:

```bash
zhe login
zhe connector status
zhe connector start
```

The Connector reads the same login configuration on every poll. Its permission expires 30 days after key creation; rotate the key through the API Keys page, then run `zhe logout` and `zhe login`. Revoking the key stops further Connector mutations. The background service contains no key or X cookies.

On Linux or Windows, run `zhe connector watch` under your normal process supervisor. Keep the browser extension connected and the machine awake. Failed media does not prevent saving the post text; retry is available on the card. The current limits are 64 MiB per video and 10 MiB per image. Protected accounts and browser challenges are not supported.

Archived files use Zhe's existing R2 file-sharing behavior. Delete a video to remove its poster too; delete a bookmark to remove all of its archived attachments. Removing an attachment explicitly prevents a later retry from restoring it.

See the [implementation and operations guide](../docs/25-x-bookmark-connector.md) for the job lifecycle, storage cleanup, and verification procedure.

## Configuration

Config file location: `~/.config/zhe/config.json`

## License

MIT
