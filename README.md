<h1>
  <img src="public/favicon.svg" alt="" width="36" height="36" align="center">
  Hearthboard
</h1>

<p>
  <img alt="Release" src="https://img.shields.io/github/v/release/andrewilliams876/HearthBoard?label=Release&logo=github">
  <img alt="Container" src="https://img.shields.io/badge/GHCR-hearthboard-blue?logo=docker">
  <img alt="License" src="https://img.shields.io/github/license/andrewilliams876/HearthBoard?label=License">
</p>

Hearthboard is a self-hosted dashboard for tracking homelab services, devices, and links. It includes a React frontend, a Fastify API, SQLite persistence, CRUD service management, health checks, drag-and-drop ordering, and CSV import/export.

The app starts with an empty database. Add services manually or import them from CSV.

## Features

- Add, edit, delete, reorder, and group services
- HTTP, Ping, TCP, and disabled health-check modes
- Service status cards with last-check time and response time
- Search, category filters, status filters, grid view, and list view
- Manage mode for bulk delete, drag ordering, CSV import, CSV export, and template download
- Dashboard header customization
- Docker Compose deployment with persistent SQLite storage
- Nginx reverse proxy friendly

## Quick Start

```bash
docker compose pull
docker compose up -d
```

Open:

```text
http://localhost:3000
```

The database is stored in the Docker volume `hearthboard-data`.

## First Run

The public version ships with no services. To populate it:

1. Open the dashboard.
2. Click `Manage`.
3. Click `Add Service` to add one item manually, or click `Template` to download a CSV template.
4. Fill out the CSV and use `Import CSV`.

## Service Fields

Each service has:

- `name`: Display name. Required.
- `description`: Short description.
- `category`: One of `AI`, `Infrastructure`, `Media`, `Network`, or `Security`.
- `url`: Optional URL opened by the `Open` button.
- `healthUrl`: Target used by the health check. This may be different from `url`.
- `checkType`: One of `HTTP`, `Ping`, `TCP`, or `None`.
- `icon`: Icon name used in the UI.
- `statusCheckEnabled`: `true` or `false`.

## Health Checks

### HTTP

Use this for websites, web apps, and HTTP APIs.

Examples:

```text
https://app.example.test
https://app.example.test/health
```

HTTP checks require a full `http://` or `https://` URL.

### Ping

Use this for devices where you only need to know whether the host responds to ICMP.

Examples:

```text
router.lan
192.0.2.10
```

Docker requires `cap_add: NET_RAW` for ICMP ping checks. HTTP and TCP checks do not need it.

### TCP

Use this for checking whether a host and port are reachable.

Examples:

```text
server.lan:22
database.lan:5432
```

### None

Use this for bookmarks or services you do not want monitored.

## CSV Import And Export

Manage mode includes:

- `Template`: Downloads `hearthboard-import-template.csv`.
- `Import CSV`: Imports services.
- `Export CSV`: Exports the current dashboard as `hearthboard-services.csv`.

Required CSV headers:

```csv
name,description,category,url,healthUrl,checkType,icon,statusCheckEnabled
```

Import modes:

- `Add as new services`: Creates every row as a new service. Warnings are shown if names already exist.
- `Update matching names`: Updates existing services when exactly one matching name exists. Blocks if a name is ambiguous.
- `Skip existing names`: Adds only rows whose names do not already exist.

Warnings do not block import. Issues do block import.

## Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port inside the container |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `/data/hearthboard.db` in Docker | SQLite database path |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers only when running behind your own reverse proxy |
| `HEALTH_TIMEOUT_MS` | `5000` | Per-check timeout |
| `SLOW_THRESHOLD_MS` | `1500` | Response time considered slow |
| `ALLOW_INSECURE_TLS` | `true` in compose | Allows self-signed/internal HTTPS certificates |
| `RATE_LIMIT_MAX` | `120` | API rate limit per window |
| `RATE_LIMIT_WINDOW` | `1 minute` | API rate limit window |

## Nginx Reverse Proxy

This app is designed to run at the root of a hostname, for example:

```text
https://dashboard.example.test/
```

Example Nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

If you run Hearthboard behind a reverse proxy, also set `TRUST_PROXY=true` so rate limiting and request metadata use the forwarded client IP safely.

## Development

Install dependencies:

```bash
npm install
```

Run the frontend/API together through the Fastify server after building:

```bash
npm run build
npm start
```

Run the Docker image from your local source while developing:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Run the Vite dev server:

```bash
npm run dev
```

Run the API directly:

```bash
npm run dev:api
```

## Data Backup

For normal use, the easiest backup is `Manage -> Export CSV`.

The SQLite database also lives in the Docker volume:

```text
hearthboard-data
```

## Security Notes

This project currently does not include authentication. Run it on a trusted LAN or place it behind your own authentication layer if exposing it remotely.

Health checks can make outbound requests to hosts entered in the dashboard. Treat users with dashboard access as trusted.

ICMP ping requires `NET_RAW` in Docker. Remove `cap_add: NET_RAW` if you do not need Ping checks.

`ALLOW_INSECURE_TLS=true` is convenient for internal/self-signed services. Set it to `false` if you only monitor trusted public HTTPS certificates.

`TRUST_PROXY` defaults to `false` to avoid trusting spoofed forwarded headers when the app is exposed directly. Only enable it when Hearthboard sits behind a reverse proxy you control.

## License

Hearthboard is released under the MIT License. See [LICENSE](LICENSE).
