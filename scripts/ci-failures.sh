#!/usr/bin/env bash
# Thin shell: see scripts/ci-failures.mjs.
exec node "$(dirname "${BASH_SOURCE[0]}")/ci-failures.mjs" "$@"
