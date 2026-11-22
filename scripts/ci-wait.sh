#!/usr/bin/env bash
# Thin shell: see scripts/ci-wait.mjs.
exec node "$(dirname "${BASH_SOURCE[0]}")/ci-wait.mjs" "$@"
