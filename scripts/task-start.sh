#!/usr/bin/env bash
# Starts a chunk of work: a fresh branch from origin/main in a new worktree, with node_modules ready.
#
# Usage:
#   scripts/task-start.sh <type>/<short-desc> [--plan <doc>] [--here] [--from <batch>]
#
# Fetches origin, then creates the branch from origin/main (or --from) in a new worktree under .claude/worktrees/ of the main
# checkout. --here uses the current worktree instead and fails (exit 2) when it has commits origin/main lacks.
# node_modules: a hard-link copy of the main checkout's (without .vite and .cache, which are written in place) when both
# package-lock.json files hash the same, else `npm ci`.
# --from <batch> cuts the chunk branch from the session's local batch branch instead (AGENTS.md, Delegating: one batch branch
# per session); the only bases accepted are origin/main (the default) and an existing local `batch/...` branch, else exit 2.
# --plan <doc> prints the doc's status line, its next unbuilt chunk and that chunk's task rows.
# The worktree path is the last line printed. Exit 2 on a bad argument or a refused state, 1 on a failed step.
set -euo pipefail

usage() { echo "usage: task-start.sh <type>/<short-desc> [--plan <doc>] [--here] [--from <batch>]" >&2; exit 2; }
die() { echo "task-start: $1" >&2; exit "${2:-1}"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# -ge 1 ]] || usage
BRANCH="$1"
shift
[[ "$BRANCH" =~ ^[a-z]+/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "bad branch name: $BRANCH (<type>/<short-desc>)" 2
PLAN=""
HERE=0
BASE="origin/main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) [[ $# -ge 2 ]] || usage; PLAN="$2"; shift 2 ;;
    --here) HERE=1; shift ;;
    --from) [[ $# -ge 2 ]] || usage; BASE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

# The main checkout: the parent of the shared .git directory, whichever worktree this script runs from.
COMMON="$(cd "$ROOT" && git rev-parse --path-format=absolute --git-common-dir)"
MAIN="$(dirname "$COMMON")"

git -C "$ROOT" fetch origin --quiet || die "git fetch origin failed"
git -C "$ROOT" rev-parse --verify --quiet origin/main >/dev/null || die "origin/main does not exist"
if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then die "branch already exists: $BRANCH" 2; fi
if [[ "$BASE" != "origin/main" ]]; then
  [[ "$BASE" =~ ^batch/[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || die "--from $BASE: the base is origin/main or a local batch/ branch" 2
  git -C "$ROOT" show-ref --verify --quiet "refs/heads/$BASE" || die "--from $BASE: no such local branch" 2
fi

if [[ $HERE -eq 1 ]]; then
  TREE="$(git -C "$PWD" rev-parse --show-toplevel)"
  ahead="$(git -C "$TREE" rev-list --count "$BASE"..HEAD)"
  [[ "$ahead" -eq 0 ]] || die "--here: this worktree has $ahead commit(s) $BASE lacks" 2
  git -C "$TREE" switch -c "$BRANCH" "$BASE" --quiet || die "git switch failed"
else
  TREE="$MAIN/.claude/worktrees/${BRANCH//\//-}"
  [[ ! -e "$TREE" ]] || die "worktree path exists: $TREE" 2
  mkdir -p "$MAIN/.claude/worktrees"
  git -C "$ROOT" worktree add -b "$BRANCH" "$TREE" "$BASE" --quiet || die "git worktree add failed"
fi

link_modules() {
  local src="$MAIN/node_modules" lock="package-lock.json"
  [[ -d "$src" && -f "$MAIN/$lock" && -f "$TREE/$lock" ]] || return 1
  [[ "$(sha256sum <"$MAIN/$lock")" == "$(sha256sum <"$TREE/$lock")" ]] || return 1
  [[ ! -e "$TREE/node_modules" ]] || return 1
  mkdir "$TREE/node_modules"
  find "$src" -mindepth 1 -maxdepth 1 ! -name .vite ! -name .cache -exec cp -al {} "$TREE/node_modules/" \; 2>/dev/null \
    || { rm -rf "$TREE/node_modules"; return 1; }
}

if [[ -f "$TREE/package.json" ]]; then
  if link_modules; then
    echo "node_modules: hard-linked from $MAIN (same package-lock.json)"
  else
    echo "node_modules: npm ci"
    (cd "$TREE" && npm ci >/dev/null) || die "npm ci failed in $TREE"
  fi
fi

if [[ -n "$PLAN" ]]; then
  (cd "$TREE" && node "$ROOT/scripts/lib/plan-next-chunk.mjs" "$PLAN") || die "cannot read plan $PLAN"
fi
echo "$TREE"
