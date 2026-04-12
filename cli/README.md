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

## Configuration

Config file location: `~/.config/zhe/config.json`

## License

MIT
