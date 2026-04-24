# teltonika-sms

PWA zum Steuern von Teltonika-Trackern (z.B. FMT100). Sendet Kommandos
vorzugsweise per **GPRS/Codec-12 über Flespi**, optional als **SMS via Sipgate**.

Kurzanleitung fuer lokalen Start und Docker: [SETUP.md](./SETUP.md).
Voraussetzungen: [REQUIREMENTS.md](./REQUIREMENTS.md).

## Kanäle

| Kanal | wozu | wann |
|---|---|---|
| **GPRS (Flespi)** | `setparam …`, `cpureset`, `getinfo`, … an ein online-Gerät | Standard. Kostenlos, instantan, Antwort kommt zurück. |
| **SMS (Sipgate)** | dieselben Kommandos per SMS | Erstkonfiguration vor APN-Setup oder wenn Gerät offline/ohne GPRS. |

## Presets

| Preset | Ergebnis |
|---|---|
| **BT-OBD2** | `setparam 800:1;807:2;804:<MAC>;806:<PIN>` + optional `cpureset` |
| **APN** | `setparam 2001:<APN>;2002:<user>;2003:<pass>;2016:<auth>` |
| **Server** | `setparam 2000:1;2004:<domain>;2005:<port>;2006:<protocol>` + optional `cpureset` |
| **Settings lesen** | mehrere `getparam <id>`-Kommandos für APN, Server oder Netzwerk |
| **Status** | `getinfo`, `getver`, `getstatus`, `getgps`, `battery`, `readio` |
| **Outputs / Reset** | `setdigout …`, `cpureset`, `defaultcfg` |

Parameter-IDs: siehe [Teltonika FMT100 Parameter list](https://wiki.teltonika-gps.com/view/FMT100_Parameter_list).

## Setup

```bash
bun install            # installiert server/ + web/
bun run setup          # erstellt .env per Dialog
bun run dev            # startet beide Prozesse (server :3001, web :5173)
```

Dann **http://localhost:5173** im Browser öffnen.
Auf iOS per Safari → „Zum Home-Bildschirm" für PWA-Installation.

Wenn `.env` beim Start fehlt, wird das Setup automatisch ausgeführt und fragt
alle Variablen ab.

## .env

```bash
FLESPI_TOKEN=...                   # Flespi API-Token
FLESPI_BASE_URL=https://flespi.io
PORT=3001                          # interner Bun-Port
DOCKER_LISTEN_PORT=3001            # Host-Port für Docker Compose

# Sipgate — entweder OAuth ODER PAT. Leer = SMS deaktiviert.
SIPGATE_API_BASE_URL=https://api.sipgate.com/v2
SIPGATE_OAUTH_BASE_URL=https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect

# OAuth 2.0 (empfohlen für third-party apps)
SIPGATE_CLIENT_ID=...:third-party
SIPGATE_CLIENT_SECRET=...
SIPGATE_REDIRECT_URI=http://localhost:3001/api/sipgate/callback

# Personal Access Token (Basic Auth)
SIPGATE_TOKEN_ID=
SIPGATE_TOKEN=

SIPGATE_SMS_ID=s0                  # SMS-Extension (default s0)

# optional: falls am Gerät SMS-Login/Passwort gesetzt sind
TELTONIKA_SMS_LOGIN=
TELTONIKA_SMS_PASSWORD=

# Frontend / Dev-Proxy / öffentliche Links (Vite, zur Build-Zeit)
VITE_API_PROXY_TARGET=http://localhost:3001
VITE_FLESPI_TOKEN_HELP_URL=https://flespi.com/kb/tokens-access-keys-to-flespi-platform
VITE_SIPGATE_API_CLIENTS_URL=https://app.sipgate.com/api-clients
VITE_SIPGATE_PAT_URL=https://app.sipgate.com/w0/personal-access-token
VITE_OPENSTREETMAP_URL=https://www.openstreetmap.org
VITE_GOOGLE_MAPS_URL=https://www.google.com/maps
```

### Sipgate OAuth registrieren

1. In [app.sipgate.com](https://app.sipgate.com) → OAuth-2.0-App anlegen.
2. Redirect URI eintragen: `http://localhost:3001/api/sipgate/callback`
3. Client ID + Secret in `.env` setzen.
4. App starten → oben rechts **Sipgate verbinden** → sipgate-Login → fertig.
   Refresh-Token liegt in `data/app.sqlite` (gitignored).

## Architektur

```
root
├─ server/   Hono + bun:sqlite
│  ├─ flespi.ts      GET /devices, POST /commands-queue
│  ├─ sipgate.ts     OAuth (PKCE) + Bearer / PAT Basic Auth
│  ├─ commands.ts    Teltonika-Command-Builder (Preset → String[])
│  ├─ db.ts          command_log, sipgate_auth, oauth_state
│  └─ index.ts       Routen
└─ web/      React + Vite + Tailwind + PWA
   └─ src/components/presets/  Formulare pro Preset
```

## Scripts

```bash
bun run setup        # fragt alle Variablen ab und schreibt .env
bun run backup       # erstellt ein Projekt-Backup in backups/
bun run dev          # beide Prozesse parallel
bun run dev:server   # nur Backend
bun run dev:web      # nur Frontend
bun run typecheck    # tsc --noEmit auf beiden Seiten
bun run build        # web build → web/dist
```

## Docker

Ein minimales Single-Container-Image baut die PWA und startet danach nur den
Bun/Hono-Server. Im Container lauscht die App auf `PORT` (default `3001`);
Docker Compose veröffentlicht sie auf `DOCKER_LISTEN_PORT` (default `3001`).
`web/dist` wird vom Backend ausgeliefert.

```bash
docker build -f docker/Dockerfile -t teltonika-sms \
  --build-arg VITE_API_PROXY_TARGET="$VITE_API_PROXY_TARGET" \
  --build-arg VITE_FLESPI_TOKEN_HELP_URL="$VITE_FLESPI_TOKEN_HELP_URL" \
  --build-arg VITE_SIPGATE_API_CLIENTS_URL="$VITE_SIPGATE_API_CLIENTS_URL" \
  --build-arg VITE_SIPGATE_PAT_URL="$VITE_SIPGATE_PAT_URL" \
  --build-arg VITE_OPENSTREETMAP_URL="$VITE_OPENSTREETMAP_URL" \
  --build-arg VITE_GOOGLE_MAPS_URL="$VITE_GOOGLE_MAPS_URL" .
docker run --rm -p 3001:3001 --env-file .env -v teltonika-sms-data:/app/data teltonika-sms
```

Alternativ mit Compose:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

Dann `http://localhost:$DOCKER_LISTEN_PORT` öffnen. Die SQLite-Datenbank liegt
im Volume `/app/data`.

## Backup Workflow

Vor größeren Änderungen, Refactors, UI-Umbauten oder riskanten Backend-Anpassungen:

```bash
bun run backup
```

Das Backup wird unter `backups/teltonika-sms-backup-YYYYMMDD-HHMMSS.tar.gz` abgelegt.

## Sicherheit

- `.env` ist gitignored. Niemals committen.
- `data/` (SQLite inkl. Refresh-Token) ist gitignored.
- Bei Verdacht auf Leak: Tokens/Secrets in Flespi- bzw. Sipgate-Console rotieren.
- Das Backend proxied sämtliche Kommandos — Tokens verlassen niemals den Server.

## Referenzen

- [FMT100 SMS/GPRS-Kommandos](https://wiki.teltonika-gps.com/view/FMT100_SMS/GPRS_Commands)
- [FMT100 Bluetooth-Settings](https://wiki.teltonika-gps.com/view/FMT100_Bluetooth_settings)
- [FMT100 Parameter-Liste](https://wiki.teltonika-gps.com/view/FMT100_Parameter_list)
- [Flespi API: commands-queue](https://flespi.com/kb/commands-api)
- [Sipgate REST API — SMS](https://www.sipgate.io/rest-api/sms)
