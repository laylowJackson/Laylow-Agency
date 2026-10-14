# Laylow Agency on an always-on Linux server

This package preserves the existing Python application, managers, team workers,
SQLite database, screenshot reviews and Node training subprocess. It has not yet
been deployed. A Linux VPS with Docker Engine and Compose is required. Docker
must start on boot. Use one instance: SQLite and the supervisor lock are not a
multi-server architecture.

## What runs when you close the page

The supervisor and existing workers keep running. The training worker persists
its synthetic research state and follows the existing training schedule. Default
observe mode makes no market-data requests from team workers. Futures have no feed.
Training is not verified profitable market performance.

The browser's generated practice account and browser live-price practice ledger
still stop when that browser closes. The new Background live-price practice panel
starts a separate durable server-owned $50,000 fake account, supervised without
a browser. It requires saved paper data keys and keeps LIVE locked. Existing
browser balances are not automatically imported. See PAPER_READINESS.md for
controls, evidence and fill limitations. Export browser sessions before moving devices.

## Start the server

Upload the clean source package to your server and extract it. From its
Laylow-Agency directory, run:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail 50 agency
```

The app listens on server loopback only. There are no publicly published ports.
On your Windows computer, open a terminal and substitute your own SSH login:

```sh
ssh -N -L 5000:127.0.0.1:5000 YOUR_SSH_USER@YOUR_SERVER_ADDRESS
```

Keep this tunnel open while viewing http://127.0.0.1:5000/ in your normal browser.
Closing the tunnel does not stop server workers. SSH protects access to Settings,
uploads and controls without weakening the app's existing loopback restrictions.
Do not expose port 5000 to the internet. A public HTTPS dashboard requires a
separate authenticated gateway and origin handling; this package does not supply it.

Enter Alpaca paper keys only in Settings through the tunnel. Settings stay in the
persistent runtime volume, outside the image. No secrets are shipped. The container
forces PRACTICE and shadow mode and disables paper submission; LIVE remains locked.

## Persistence, updates and shutdown

The named agency-runtime volume retains database, logs, settings, training and
uploaded reviews across container replacement. Back it up securely: it includes
credentials and personal screenshots. Do not commit or publicly upload a backup.
Do not use `docker compose down -v`, which deletes this volume.

To update, replace only source files, then run `docker compose up -d --build`.
Updates briefly interrupt workers. `docker compose stop` pauses all services;
`docker compose up -d` starts them again. A stopped container is deliberately not
restarted by the unless-stopped policy. Check worker heartbeats in the dashboard;
container health alone does not prove every worker or provider is healthy.

No server account, server address, hosting plan or deployment is configured yet.
