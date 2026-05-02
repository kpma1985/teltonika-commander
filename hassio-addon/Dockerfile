# Home Assistant übergibt nur diesen Ordner als Build-Kontext — es gibt hier keine package.json.
# Quelle: Tarball vom Repo (gleicher Inhalt wie ein Build aus dem Repository-Root).
ARG BUILD_FROM
ARG SOURCE_REF=main

FROM ${BUILD_FROM}

ARG SOURCE_REF=main

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash \
 && ln -sf /root/.bun/bin/bun /usr/local/bin/bun

# Repo-Root wie bei Dockerfile im Hauptverzeichnis
RUN curl -fsSL "https://github.com/kpma1985/teltonika-commander/tarball/${SOURCE_REF}" \
    | tar xz --strip-components=1 -C /app

ENV VITE_FLESPI_TOKEN_HELP_URL=https://flespi.com/kb/tokens-access-keys-to-flespi-platform
ENV VITE_SIPGATE_PAT_URL=https://app.sipgate.com/w0/personal-access-token
ENV VITE_OPENSTREETMAP_URL=https://www.openstreetmap.org
ENV VITE_GOOGLE_MAPS_URL=https://www.google.com/maps

RUN bun install --frozen-lockfile \
 && bun run build \
 && bun install --production --frozen-lockfile

RUN mkdir -p /etc/services.d/teltonika \
 && cp /app/run.sh /etc/services.d/teltonika/run \
 && chmod +x /etc/services.d/teltonika/run \
 && mkdir -p /app/data

EXPOSE 3001
