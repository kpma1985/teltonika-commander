ARG BUILD_FROM
FROM ${BUILD_FROM} AS hassio-base

FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
ENV VITE_FLESPI_TOKEN_HELP_URL=https://flespi.com/kb/tokens-access-keys-to-flespi-platform
ENV VITE_SIPGATE_PAT_URL=https://app.sipgate.com/w0/personal-access-token
ENV VITE_OPENSTREETMAP_URL=https://www.openstreetmap.org
ENV VITE_GOOGLE_MAPS_URL=https://www.google.com/maps
RUN bun run build

FROM oven/bun:1-slim AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN bun install --production --frozen-lockfile

FROM hassio-base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Bun binary
COPY --from=prod-deps /usr/local/bin/bun /usr/local/bin/bun
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/web/dist ./web/dist
COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY scripts ./scripts
COPY hassio-addon/run.sh /run.sh

RUN chmod +x /run.sh && mkdir -p /app/data

EXPOSE 3001
