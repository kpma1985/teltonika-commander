# Setup

## Ohne Docker

```bash
bun install
bun run setup
bun run dev
```

Danach im Browser öffnen:

```text
http://localhost:5173
```

`bun run setup` erstellt die `.env` per Dialog. Falls `.env` beim Start fehlt,
wird das Setup automatisch ausgeführt.

## Mit Docker Compose

```bash
bun run setup
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

Danach im Browser öffnen:

```text
http://localhost:<DOCKER_LISTEN_PORT>
```

Standard ist:

```text
http://localhost:3001
```

Wichtige Ports in `.env`:

```bash
PORT=3001                 # interner App-Port im Container
DOCKER_LISTEN_PORT=3001   # Host-Port fuer Docker Compose
```

SQLite-Daten bleiben im Docker-Volume `teltonika-sms-data` erhalten.

## Standalone-Binary

Als zusaetzliche Option kann ein Bun-Server-Binary gebaut werden. Das ist kein
echtes Single-File-Release: `web/dist` liegt daneben.

```bash
bun install
bun run setup
bun run build:binary
```

Starten:

```bash
cd build/standalone
WEB_DIST_DIR=./web/dist ./teltonika-sms
```

Cross-Compile fuer Linux x64:

```bash
BUN_TARGET=bun-linux-x64-baseline bun run build:binary
```

SQLite wird relativ zum aktuellen Arbeitsverzeichnis unter `data/app.sqlite`
angelegt.

## Stoppen

Ohne Docker:

```bash
./scripts/server.sh stop
```

Mit Docker:

```bash
docker compose --env-file .env -f docker/docker-compose.yml down
```
