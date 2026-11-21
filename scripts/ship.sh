#!/usr/bin/env bash
# Takes a committed branch to a merged PR and blocks until it is merged or red.
#
# Usage:
#   scripts/ship.sh --title <subject> --body <file> [--base <branch>] [--no-merge]
#
# Steps (scripts/lib/ship-steps.mjs; docs/designs/agent-workflow.md, Start to merge):
#   1 fail on uncommitted files or a branch named main                      exit 2
#   2 merge origin/<base> when behind (a merge commit, never a rebase)       exit 3 and the conflicted paths
#   3 the gate the change scope needs, then commit what --fix wrote          exit 4 and the failed gates
#   4 check the body file against the create-pr template                     exit 5 and the missing section
#   5 push, open the PR (or find it), turn on auto-merge (merge commit)      exit 6 and the gh error
#   6 wait up to 120 s for the checks to register, then                    exit 1 no-checks when none register
#     gh pr checks --watch --fail-fast                                       exit 1, failed jobs and log tails
#   7 confirm MERGED, print the link and minutes from push to merge          exit 7 when not merged after 10 minutes
# A rerun after a fix commit resumes at step 2 on the same PR. --no-merge leaves auto-merge off and stops after step 6.
# Each run appends a line to .checklogs/ship.jsonl. Run it from the branch's worktree.
set -uo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/ship-main.mjs" "$@"
