ARG BUILD_FROM
FROM ${BUILD_FROM}

WORKDIR /app

# Bun installieren
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Dependencies installieren
COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN bun install --frozen-lockfile

# Frontend bauen
COPY . .
ENV VITE_FLESPI_TOKEN_HELP_URL=https://flespi.com/kb/tokens-access-keys-to-flespi-platform
ENV VITE_SIPGATE_PAT_URL=https://app.sipgate.com/w0/personal-access-token
ENV VITE_OPENSTREETMAP_URL=https://www.openstreetmap.org
ENV VITE_GOOGLE_MAPS_URL=https://www.google.com/maps
RUN bun run build

# Dev-Dependencies entfernen, nur Production behalten
RUN bun install --production --frozen-lockfile

COPY hassio-addon/run.sh /run.sh
RUN chmod +x /run.sh && mkdir -p /app/data

EXPOSE 3001
