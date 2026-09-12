# Security Policy

## Supported Versions

This project is currently pre-release/public-home-lab software. Security fixes are handled on the latest `main` branch unless versioned releases are introduced later.

## Reporting A Vulnerability

Please open a GitHub issue with enough detail to reproduce the problem. If the issue contains sensitive details, use GitHub private vulnerability reporting if it is enabled for the repository.

## Current Security Model

- Authentication is not included yet.
- Run the app on a trusted LAN, behind a VPN, or behind an authenticated reverse proxy.
- `TRUST_PROXY` is disabled by default; enable it only when the app is actually behind a reverse proxy you control.
- Users who can access the dashboard can create health-check targets, which causes the backend container to make network requests.
- Ping checks require Docker `NET_RAW`; remove that capability if you do not use Ping checks.
- Internal/self-signed HTTPS checks may require `ALLOW_INSECURE_TLS=true`. Set it to `false` for stricter certificate validation.

## Hardening Checklist

- Put the app behind HTTPS when accessed over a network.
- Add authentication at your reverse proxy if exposing it outside your LAN.
- Keep Docker, Node.js, and dependencies updated.
- Restrict the container network if you do not want checks to reach sensitive internal services.
- Export CSV backups before upgrades or database maintenance.
