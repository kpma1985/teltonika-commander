ARG BUILD_FROM
FROM ${BUILD_FROM}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN bun install --frozen-lockfile

COPY . .
ENV VITE_FLESPI_TOKEN_HELP_URL=https://flespi.com/kb/tokens-access-keys-to-flespi-platform
ENV VITE_SIPGATE_PAT_URL=https://app.sipgate.com/w0/personal-access-token
ENV VITE_OPENSTREETMAP_URL=https://www.openstreetmap.org
ENV VITE_GOOGLE_MAPS_URL=https://www.google.com/maps
RUN bun run build

RUN bun install --production --frozen-lockfile

RUN mkdir -p /etc/services.d/teltonika/
COPY run.sh /etc/services.d/teltonika/run
RUN chmod +x /etc/services.d/teltonika/run && mkdir -p /app/data

EXPOSE 3001
