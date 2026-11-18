#!/usr/bin/env bash
# Each branch waits for its own prerequisites and reports failure independently.
set -uo pipefail
cd "${MISE_PROJECT_ROOT:?}"

run() {
  echo "[check] start $*"
  if mise run "$@"; then
    echo "[check] passed $*"
  else
    echo "[check] failed $*" >&2
    return 1
  fi
}

run api:check & api_check_pid=$!

if run api:build; then
  (
    if MISE_TASK_SKIP_DEPENDS=1 run backend:api-generate-code; then
      status=0
      git diff --exit-code -- backend/internal/api/models.gen.go backend/internal/api/server.gen.go || status=1
      run backend:check & backend_pid=$!
      run container:test & container_pid=$!
      wait "$backend_pid" || status=1
      wait "$container_pid" || status=1
      exit "$status"
    else
      echo '[check] skipped backend:check and container:test: Go API generation failed' >&2
      exit 1
    fi
  ) & go_pid=$!
  (
    if MISE_TASK_SKIP_DEPENDS=1 run api:generate-client; then
      if run frontend:check-generated; then
        if run frontend:build-generated; then
          run frontend:test
        else
          echo '[check] skipped frontend:test: frontend build failed' >&2
          exit 1
        fi
      else
        echo '[check] skipped frontend build and test: frontend checks failed' >&2
        exit 1
      fi
    else
      echo '[check] skipped frontend checks, build and test: SDK generation failed' >&2
      exit 1
    fi
  ) & frontend_pid=$!
  status=0
  wait "$go_pid" || status=1
  wait "$frontend_pid" || status=1
else
  echo '[check] skipped Go API, SDK, backend, frontend and container checks: OpenAPI generation failed' >&2
  status=1
fi
wait "$api_check_pid" || status=1
exit "$status"
