#!/usr/bin/env bash
# Makes node_modules in the current worktree (a harness-made one has none): a hard-link copy of the main checkout's (without
# .vite and .cache, which are written in place, so a symlink would share them between worktrees) when both package-lock.json
# files hash the same, else `npm ci`. scripts/task-start.sh does the same for the worktree it creates.
#
# Usage: scripts/worktree-setup.sh      (from any worktree of the repository)
# Exit status: 0 ready (or already there), 1 npm ci failed.
set -euo pipefail

TREE="$(git rev-parse --show-toplevel)"
COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN="$(dirname "$COMMON")"
LOCK="package-lock.json"

if [[ -d "$TREE/node_modules" ]]; then
  echo "node_modules: already present"
  exit 0
fi
if [[ "$TREE" != "$MAIN" && -d "$MAIN/node_modules" && -f "$MAIN/$LOCK" && -f "$TREE/$LOCK" &&
  "$(sha256sum <"$MAIN/$LOCK")" == "$(sha256sum <"$TREE/$LOCK")" ]]; then
  mkdir "$TREE/node_modules"
  if find "$MAIN/node_modules" -mindepth 1 -maxdepth 1 ! -name .vite ! -name .cache \
    -exec cp -al {} "$TREE/node_modules/" \; 2>/dev/null; then
    echo "node_modules: hard-linked from $MAIN (same $LOCK)"
    exit 0
  fi
  rm -rf "$TREE/node_modules"
fi
echo "node_modules: npm ci"
(cd "$TREE" && npm ci >/dev/null) || { echo "worktree-setup: npm ci failed" >&2; exit 1; }
