> CynexGP is stable and ready for production. If it breaks, you probably forgot to set `SESSION_SECRET` -_-

# CynexGP Panel

**Open-source game server management that actually works -_-**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)

---

## What is this?

CynexGP Panel is a web-based control center for deploying, monitoring, and managing game servers across multiple machines.

**What you get:**
- Full web UI for admins and users (EJS templates)
- Node-based architecture - one panel, many daemons, infinite game servers
- Addon system for extending functionality without touching core code
- REST API for automation and third-party integrations
- Real-time console, file manager, backups, SFTP, and more

---

## Prerequisites

- Node.js v18 or later
- pnpm v8 or later (`npm install -g pnpm`)
- Git

---

## Installation

### Option 1 - Installer script (recommended)

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/xAyan55/cynex/main/installer.sh)
```

Manage with systemd:

```bash
systemctl start cynexgp-panel
systemctl stop cynexgp-panel
systemctl restart cynexgp-panel
journalctl -u cynexgp-panel -f
```

### Option 2 - Manual

```bash
cd /var/www/
git clone https://github.com/xAyan55/cynex.git
cd cynex/airlink-panel

# Set permissions
chown -R www-data:www-data /var/www/cynex
chmod -R 755 /var/www/cynex

# Install dependencies
pnpm install

# Set up environment
cp example.env .env
# Edit .env - set PORT, URL, SESSION_SECRET, and DATABASE_URL

# One command to rule them all
pnpm run setup

# Start the panel
pnpm run start
```

`pnpm run setup` does the heavy lifting: installs deps, generates Prisma client, pushes database schema, and builds TypeScript + CSS.

### Running with pm2

```bash
npm install -g pm2
pm2 start "pnpm run start" --name cynexgp-panel
pm2 save
pm2 startup
```

---

## Configuration

Copy `example.env` to `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NAME` | No | Panel display name (default: CynexGP) |
| `NODE_ENV` | Yes | Set to `production` for live deployments |
| `URL` | Yes | Full URL the panel is served from |
| `PORT` | Yes | Port to listen on |
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./storage/dev.db` |
| `SESSION_SECRET` | Yes | Random secret for session signing |

`DATABASE_URL` must be an **absolute path** in production. `URL` should be the actual IP or hostname the panel is accessible from.

---

## API Reference

See [`docs/specsheet.md`](docs/specsheet.md) for the complete route catalog with request/response formats, authentication details, and how the panel talks to the daemon.

---

## Addon System

Addons extend the panel without modifying core files. They live under `storage/addons/` and are managed from `/admin/addons`.

See [`storage/addons/README.md`](storage/addons/README.md) for structure and API reference.

---

## Development

```bash
# Install deps
pnpm install

# Start in dev mode (auto-restart on changes)
pnpm run dev

# Typecheck
pnpm run typecheck

# Lint
pnpm run lint

# Build for production
pnpm run build
```

---

## License

MIT - see [`LICENSE`](LICENSE) for details.
