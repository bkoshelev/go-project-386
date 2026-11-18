#!/usr/bin/env bash
set -euo pipefail

jq -en --argjson results "$RESULTS" '
  ["lint", "checks", "test", "test-frontend"]
  | all(.[]; $results[.].result == "success")
'
