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

# Manage tags
zhe tag list
zhe tag create urgent --color "#ef4444"
zhe tag update urgent --name important --color 3b82f6
zhe tag delete important --yes

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
| `zhe tag list` | List all tags (recommended) |
| `zhe tag create <name> [--color <hex>]` | Create a new tag |
| `zhe tag update <name\|id> [--name <new>] [--color <hex>]` | Update a tag |
| `zhe tag delete <name\|id> [--yes]` | Delete a tag (confirms unless `--yes`) |
| `zhe tags` | Alias for `zhe tag list` |
| `zhe open <slug>` | Open short URL in browser |

## Configuration

Config file location: `~/.config/zhe/config.json`

## License

MIT
