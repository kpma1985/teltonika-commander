# syntax=docker/dockerfile:1

FROM oven/bun:1-slim AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
ARG VITE_API_PROXY_TARGET
ARG VITE_FLESPI_TOKEN_HELP_URL
ARG VITE_SIPGATE_API_CLIENTS_URL
ARG VITE_SIPGATE_PAT_URL
ARG VITE_OPENSTREETMAP_URL
ARG VITE_GOOGLE_MAPS_URL
ENV VITE_API_PROXY_TARGET=$VITE_API_PROXY_TARGET
ENV VITE_FLESPI_TOKEN_HELP_URL=$VITE_FLESPI_TOKEN_HELP_URL
ENV VITE_SIPGATE_API_CLIENTS_URL=$VITE_SIPGATE_API_CLIENTS_URL
ENV VITE_SIPGATE_PAT_URL=$VITE_SIPGATE_PAT_URL
ENV VITE_OPENSTREETMAP_URL=$VITE_OPENSTREETMAP_URL
ENV VITE_GOOGLE_MAPS_URL=$VITE_GOOGLE_MAPS_URL
RUN bun run typecheck
RUN bun run build

FROM oven/bun:1-slim AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN bun install --production --frozen-lockfile

FROM oven/bun:1-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/web/dist ./web/dist
COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY scripts ./scripts

RUN mkdir -p /app/data && chown -R bun:bun /app

USER bun

EXPOSE 3001
VOLUME ["/app/data"]

CMD ["./scripts/start.sh"]
