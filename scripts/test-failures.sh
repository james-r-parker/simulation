#!/usr/bin/env bash
# Thin shell: see scripts/test-report.mjs.
exec node "$(dirname "${BASH_SOURCE[0]}")/test-report.mjs" "$@"
