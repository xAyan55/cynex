# CynexGP Daemon

The CynexGP Daemon is a lightweight agent that runs on each node server. It listens for commands from the panel, manages Docker containers, streams console output, handles file operations, and exposes SFTP access.

### Usage

```bash
git clone https://github.com/xAyan55/cynex.git
cd cynex/airlink-daemon
bun install
bun run src/app.ts
```

### Configuration

Configure via environment variables or CLI flags. Log into your CynexGP Panel as an admin to generate a node configuration.

### License

MIT
