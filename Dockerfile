# syntax=docker/dockerfile:1
FROM debian:bookworm-slim AS build-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://mise.run -o /tmp/install-mise \
    && MISE_VERSION=2026.10.17 MISE_INSTALL_PATH=/usr/local/bin/mise sh /tmp/install-mise \
    && rm /tmp/install-mise
ENV MISE_NO_HOOKS=1 MISE_YES=1 MISE_TRUSTED_CONFIG_PATHS=/src
WORKDIR /src
COPY mise.toml mise.lock ./
COPY mise-tasks ./mise-tasks
COPY backend/go.mod backend/go.sum ./backend/
COPY frontend/.nvmrc frontend/package.json ./frontend/

FROM build-base AS frontend
RUN mise install --locked node pnpm
COPY api/package.json api/pnpm-lock.yaml ./api/
COPY frontend/pnpm-lock.yaml ./frontend/
RUN mise run api:deps && mise run frontend:deps
COPY api ./api
COPY frontend ./frontend
RUN mise run frontend:build

FROM build-base AS backend
ENV GOTOOLCHAIN=local CGO_ENABLED=0
RUN mise install --locked go && mise run backend:deps
COPY backend ./backend
RUN mise run backend:dist

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=frontend /src/frontend/dist ./frontend
COPY --from=backend /src/backend/bin/server /src/backend/bin/migrate /app/
ENV PORT=8080 GIN_MODE=release
EXPOSE 8080
CMD ["/app/server"]
