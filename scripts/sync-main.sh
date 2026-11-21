#!/usr/bin/env bash
# Merges origin/<base> into the current branch (a merge commit, never a rebase) and settles conflicts in generated files
# by regenerating them (scripts/lib/merge-base.mjs; docs/designs/agent-workflow.md, Phase 7).
#
# Usage: scripts/sync-main.sh [--base <branch>]      (also: npm run sync)
# Exit 0 merged or already up to date; 3 a conflict in a file that is not generated, merge left in progress.
set -uo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/sync-main.mjs" "$@"
