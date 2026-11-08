#!/usr/bin/env bash
# Orca bootstrap: preparation itself belongs to mise tasks.
set -euo pipefail
[[ -n "${ORCA_WORKTREE_PATH:-}" ]] || { echo 'ORCA_WORKTREE_PATH must point to the new worktree' >&2; exit 1; }
cd -P "$ORCA_WORKTREE_PATH"
command -v mise >/dev/null || { echo 'Install mise 2026.10.17 and add it to PATH' >&2; exit 1; }
case "${SETUP_VERIFY:-0}" in 0|1) ;; *) echo 'SETUP_VERIFY must be 0 or 1' >&2; exit 1 ;; esac
mise trust "$PWD/mise.toml"
exec mise run setup
