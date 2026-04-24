# Requirements

## Lokal ohne Docker

- Bun 1.x
- macOS, Linux oder Windows mit WSL
- Netzwerkzugriff auf Flespi und optional Sipgate
- Browser mit PWA-Unterstuetzung, z. B. Safari, Chrome oder Firefox

Installation:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Installations-One-Liner

macOS mit Homebrew:

```bash
brew install oven-sh/bun/bun && brew install --cask docker && open -a Docker
```

Linux mit `apt` (Ubuntu/Debian, offizielles Docker-Repo):

```bash
bash -lc 'set -e; . /etc/os-release; repo="$ID"; codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"; sudo apt-get update; sudo apt-get install -y ca-certificates curl unzip; sudo install -m 0755 -d /etc/apt/keyrings; sudo curl -fsSL "https://download.docker.com/linux/$repo/gpg" -o /etc/apt/keyrings/docker.asc; sudo chmod a+r /etc/apt/keyrings/docker.asc; echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$repo $codename stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null; sudo apt-get update; sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; curl -fsSL https://bun.com/install | bash'
```

Linux mit `dnf` (Fedora, offizielles Docker-Repo):

```bash
sudo dnf -y install dnf-plugins-core curl unzip && sudo dnf config-manager addrepo --from-repofile https://download.docker.com/linux/fedora/docker-ce.repo && sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && sudo systemctl enable --now docker && curl -fsSL https://bun.com/install | bash
```

Linux mit `yum` (RHEL/CentOS, offizielles Docker-Repo):

```bash
bash -lc 'set -e; . /etc/os-release; repo=centos; [ "$ID" = rhel ] && repo=rhel; sudo yum install -y yum-utils curl unzip; sudo yum-config-manager --add-repo "https://download.docker.com/linux/$repo/docker-ce.repo"; sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; sudo systemctl enable --now docker; curl -fsSL https://bun.com/install | bash'
```

## Mit Docker

- Docker Engine
- Docker Compose Plugin
- Freier Host-Port fuer `DOCKER_LISTEN_PORT`, Standard `3001`

Pruefen:

```bash
docker --version
docker compose version
```

## Externe Dienste

Flespi ist fuer GPRS/Codec-12-Kommandos erforderlich:

- Flespi Account
- Flespi Token mit Zugriff auf Geraete, Telemetrie und Commands
- Teltonika-Geraet muss in Flespi angelegt und erreichbar sein

Sipgate ist optional fuer SMS:

- Sipgate Account
- Entweder OAuth Client ID/Secret
- Oder Personal Access Token mit SMS-Rechten
- SMS Extension ID, Standard `s0`

## Optionale Hardware

Bluetooth-Konfiguration ist optional:

- Teltonika Tracker mit Bluetooth Configurator Support
- Bluetooth-Adapter am Host
- Zugriff auf den seriellen Bluetooth-Port
- Optionales Bluetooth Configurator Passwort

## Konfiguration

Alle Konfigurationswerte liegen in `.env`.

Erstellen:

```bash
bun run setup
```

Vorlage:

```text
.env.example
```
