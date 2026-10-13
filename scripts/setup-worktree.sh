#!/usr/bin/env bash
set -Eeuo pipefail

stage="checking environment"
trap 'status=$?; printf "[setup] Failed while %s (line %s, exit %s)\n" "$stage" "$LINENO" "$status" >&2; exit "$status"' ERR

log() {
  printf '[setup] %s\n' "$*"
}

fail() {
  printf '[setup] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing from PATH: $1"
}

[[ -n "${ORCA_WORKTREE_PATH:-}" ]] || fail "ORCA_WORKTREE_PATH must point to the new worktree"
[[ -d "$ORCA_WORKTREE_PATH" ]] || fail "Worktree directory does not exist: $ORCA_WORKTREE_PATH"
cd "$ORCA_WORKTREE_PATH"

case "${SETUP_VERIFY:-0}" in
  0|1) ;;
  *) fail "SETUP_VERIFY must be 0 or 1" ;;
esac

for file in Makefile backend/go.mod backend/go.sum frontend/.nvmrc frontend/package.json frontend/pnpm-lock.yaml; do
  [[ -f "$file" ]] || fail "Required project file is missing: $file"
done

for tool in make curl tar awk tr uname; do
  require_command "$tool"
done

# Orca can inherit an older PATH. Select already installed pinned runtimes without
# sourcing interactive shell configuration or downloading a different toolchain.
export GOTOOLCHAIN=local
expected_go="$(awk '$1 == "go" { print $2; exit }' backend/go.mod)"
if [[ -z "${GO:-}" && -x "$HOME/sdk/go$expected_go/bin/go" ]]; then
  GO="$HOME/sdk/go$expected_go/bin/go"
fi
export GO="${GO:-go}"

expected_node="$(tr -d '[:space:]' < frontend/.nvmrc)"
node_bin="${NVM_DIR:-$HOME/.nvm}/versions/node/v$expected_node/bin"
if [[ -x "$node_bin/node" ]]; then
  export PATH="$node_bin:$PATH"
fi
for tool in "$GO" node pnpm; do
  require_command "$tool"
done

if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  fail "sha256sum or shasum is required to verify backend tool downloads"
fi

platform="$(uname -s)/$(uname -m)"
case "$platform" in
  Darwin/arm64|Darwin/x86_64|Linux/amd64|Linux/x86_64|Linux/arm64|Linux/aarch64) ;;
  *) fail "Unsupported platform: $platform (use macOS, Linux or WSL on amd64/arm64)" ;;
esac

log "Preparing workspace: ${ORCA_WORKSPACE_NAME:-unnamed}"
make --no-print-directory GO="$GO" check-go-version

actual_node="$(node --version)"
[[ "$actual_node" == "v$expected_node" ]] || fail "Node.js $expected_node is required (found $actual_node); select it before running setup"

expected_pnpm="$(node -p "require('./frontend/package.json').packageManager.replace(/^pnpm@/, '')")"
actual_pnpm="$(pnpm --version)"
[[ "$actual_pnpm" == "$expected_pnpm" ]] || fail "pnpm $expected_pnpm is required (found $actual_pnpm); select it before running setup"
log "Using Go $expected_go, Node.js $expected_node and pnpm $actual_pnpm"

# Backend tests use -race, which requires cgo and a C compiler.
[[ "$("$GO" env CGO_ENABLED)" == "1" ]] || fail "Backend race tests require CGO_ENABLED=1 and a C compiler"
read -r -a compiler <<< "$("$GO" env CC)"
[[ "${#compiler[@]}" -gt 0 ]] || fail "Go has no C compiler configured; set CC"
require_command "${compiler[0]}"

stage="downloading backend dependencies"
log "$stage"
(
  cd backend
  "$GO" mod download
)

stage="installing backend tools"
# Reuse only the pinned versions validated by the worktree's Makefile.
if make --no-print-directory GO="$GO" check-golangci-lint check-govulncheck >/dev/null 2>&1; then
  log "Backend tools already match the pinned versions"
else
  log "$stage"
  make --no-print-directory GO="$GO" tools
fi

stage="installing frontend dependencies"
log "$stage"
(
  cd frontend
  pnpm install --frozen-lockfile --prod=false
)

stage="installing Playwright Chromium"
log "$stage"
(
  cd frontend
  pnpm exec playwright install chromium
)

if [[ "${SETUP_VERIFY:-0}" == "1" ]]; then
  stage="verifying backend"
  log "$stage"
  make --no-print-directory GO="$GO" check

  stage="verifying frontend"
  log "$stage"
  (
    cd frontend
    pnpm check
    pnpm test:smoke
  )
fi

log "Workspace setup complete"
