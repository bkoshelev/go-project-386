# Repository Guidelines

## Project Structure & Module Organization

This calendar-booking project contains two independent applications:

- `backend/`: Go/Gin module; `cmd/server/` is the entry point, and `internal/config/`, `internal/httpserver/`, and `internal/server/` handle configuration, routing, and lifecycle. Tests sit beside source files.
- `frontend/`: React, TypeScript, Vite, and Mantine; application code and CSS live in `src/`, with Playwright tests in `tests/`.
- `docs/adr/` records architectural decisions; `specs/` describes requirements. `.github/workflows/` contains CI, and `scripts/setup-worktree.sh` prepares Orca worktrees.

## Build, Test, and Development Commands

From the repository root (Makefile targets cover backend only):

- `make tools`: install pinned golangci-lint and govulncheck into `backend/bin/tools/`.
- `make check`: run lint, vet, race tests, build, and vulnerability scanning.
- `make fmt`: apply gofmt and goimports; review the resulting diff.

From `backend/`, run `go mod download`, then `GOTOOLCHAIN=local go run ./cmd/server` for local development.

From `frontend/`:

- `pnpm install --frozen-lockfile`: install dependencies reproducibly.
- `pnpm dev`: start Vite development server.
- `pnpm check`: run Oxlint, Stylelint, and formatting checks.
- `pnpm build`: type-check and build production assets.
- `pnpm exec playwright install chromium`: prepare the test browser.
- `pnpm test:smoke`: build and test production UI in Chromium on port 4173.

## Coding Style & Naming Conventions

Use canonical Go formatting with tabs, lowercase package names, and comments for exported identifiers. Follow existing `TestXxx` naming.

Frontend formatting uses Oxfmt: two spaces, double quotes, semicolons, trailing commas, and 100-character lines. Use PascalCase React components, such as `App.tsx`. Preserve CSS import order. Keep lint suppressions narrow and explain each exception.

## Testing Guidelines

Backend tests use Go's `testing`, Testify, and `httptest`; name files `*_test.go`. Run `make test` for race detection. Frontend browser tests use Playwright in `tests/*.spec.ts`. Add behavioral tests for changes; no numeric coverage threshold is configured. Run relevant quality gates before opening a PR.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching history: `feat(frontend): ...`, `fix(backend): ...`, or `chore: ...`. Prefer squash merging with a Conventional Commit PR title. Describe behavior changes and validation; link relevant issues and include screenshots for UI changes. Release-please manages shared versioning and changelogs; coordinate breaking changes with the team.
