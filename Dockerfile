# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS frontend
RUN npm install --global pnpm@12.4.2
WORKDIR /src
COPY api/package.json api/pnpm-lock.yaml ./api/
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN pnpm --dir api install --frozen-lockfile && pnpm --dir frontend install --frozen-lockfile
COPY api ./api
COPY frontend ./frontend
RUN pnpm --dir frontend build

FROM golang:1.26.9-bookworm AS backend
ENV GOTOOLCHAIN=local CGO_ENABLED=0
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
RUN go build -trimpath -o /out/server ./cmd/server && go build -trimpath -o /out/migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=frontend /src/frontend/dist ./frontend
COPY --from=backend /out/server /out/migrate /app/
ENV PORT=8080 GIN_MODE=release
EXPOSE 8080
CMD ["/app/server"]
