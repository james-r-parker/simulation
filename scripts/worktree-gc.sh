#!/usr/bin/env bash
# Classes every git worktree of this repository and removes the ones that are safe to lose.
#
# Usage:
#   scripts/worktree-gc.sh --list [--json]   class, path, branch and reason per worktree, then the count per class
#   scripts/worktree-gc.sh                   removes the `safe` class with `git worktree remove` (never --force), then
#                                            deletes each removed worktree's local branch
#
# Classes (scripts/lib/worktree-gc.mjs; docs/designs/agent-workflow.md, The state of the machine), first match wins:
#   live      the main checkout, the calling session's worktree, a locked one, a process running in it, a run in flight
#             from its .runs, or a .runs directory holding a run log - kept
#   dirty     uncommitted or untracked files - kept
#   unmerged  detached HEAD, no merged PR (or gh cannot say), or commits the merged PR does not hold (unpushed or
#             added after the merge) - kept
#   gone      the directory is missing (git worktree prune clears it) - kept
#   safe      a merged PR holds all of HEAD and the tree is clean - removed
# Exit 2 on a bad argument, 1 when a safe worktree could not be removed.
set -uo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/worktree-gc-main.mjs" "$@"
