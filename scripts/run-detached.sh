#!/usr/bin/env bash
# Starts a command detached from this shell and leaves a log and an exit-code file for scripts/wait-run.sh.
#
# Usage:
#   scripts/run-detached.sh <name> [--frozen] -- <cmd...>
#
# Writes <dir>/<name>.log (stdout and stderr), <dir>/<name>.pid and, when the command ends, <dir>/<name>.done (its exit
# code, written last and atomically). <dir> is $RUNS_DIR, default .runs/ in the repo root (gitignored). The run is
# recorded in <dir>/runs.json (name, command, pid, directories, start time). An existing name is refused (exit 2), so a
# second lane cannot overwrite a run: pick a new name. The record also holds `workers`: `--workers <n>` from the command,
# else the pool default for eval, ladder, league, train, drill, reflex and screen, else null. When the run claims under
# half the free workers and no other run is in flight on this machine, one warning line says so.
#
# --frozen copies the tree (minus node_modules, .git, coverage, .sim, .checklogs and the runs directory) into a NEW
# directory <dir>/frozen-<name>-<timestamp>, symlinks node_modules, and runs the command from there, so editing,
# switching branches or deleting this worktree does not change a run in flight. Without --frozen the command runs in
# the current directory.
#
# RUN_DETACHED_ROOT names another tree to freeze (default: this repo).
#
# Wait for the run with scripts/wait-run.sh <name>; never poll for it with pgrep or a sleep loop.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { echo "usage: run-detached.sh <name> [--frozen] -- <cmd...>" >&2; exit 2; }

[[ $# -ge 1 ]] || usage
NAME="$1"
shift
[[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "bad run name: $NAME (letters, digits, . _ -)" >&2; exit 2; }
FROZEN=0
while [[ $# -gt 0 && "$1" != -- ]]; do
  case "$1" in
    --frozen) FROZEN=1 ;;
    *) usage ;;
  esac
  shift
done
[[ "${1:-}" == -- && $# -ge 2 ]] || usage
shift

DIR="${RUNS_DIR:-$ROOT/.runs}"
mkdir -p "$DIR" || exit 1
DIR="$(cd "$DIR" && pwd)"
LOG="$DIR/$NAME.log"

# Claim the name atomically: the log file is created only if it does not exist.
if ! (set -o noclobber; : >"$LOG") 2>/dev/null; then
  echo "run name already used: $NAME ($LOG exists); pick a new name" >&2
  exit 2
fi
rm -f "$DIR/$NAME.done" "$DIR/$NAME.pid"

CWD="$PWD"
FROZEN_DIR="-"
if [[ $FROZEN -eq 1 ]]; then
  FROZEN_DIR="$DIR/frozen-$NAME-$(date +%Y%m%d-%H%M%S)"
  mkdir "$FROZEN_DIR" || { echo "cannot create $FROZEN_DIR" >&2; rm -f "$LOG"; exit 1; }
  SRC="${RUN_DETACHED_ROOT:-$ROOT}" # the tree to copy (tests point it at a small one)
  excludes=(--exclude=./node_modules --exclude=./.git --exclude=./coverage --exclude=./.sim --exclude=./.checklogs)
  case "$DIR" in "$SRC"/*) excludes+=("--exclude=./${DIR#"$SRC"/}") ;; esac
  tar -C "$SRC" "${excludes[@]}" -cf - . | tar -C "$FROZEN_DIR" -xf - || { echo "copy failed" >&2; rm -f "$LOG"; exit 1; }
  [[ -d "$SRC/node_modules" ]] && ln -s "$SRC/node_modules" "$FROZEN_DIR/node_modules"
  CWD="$FROZEN_DIR"
fi

# The wrapper writes the exit code to a temporary file and renames it, so a waiter never reads a partial .done.
# shellcheck disable=SC2016 # expanded by the inner shell
WRAPPER='done="$1"; shift; "$@"; rc=$?; echo "$rc" >"$done.tmp" && mv "$done.tmp" "$done"; exit "$rc"'
cd "$CWD" || exit 1
setsid nohup bash -c "$WRAPPER" _ "$DIR/$NAME.done" "$@" >>"$LOG" 2>&1 </dev/null &
PID=$!
echo "$PID" >"$DIR/$NAME.pid"

printf -v CMD '%q ' "$@"
(
  flock 9
  node "$ROOT/scripts/lib/run-registry.mjs" add "$DIR/runs.json" "$NAME" "${CMD% }" "$PID" "$DIR" "$CWD" "$FROZEN_DIR" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
) 9>"$DIR/runs.lock" || echo "warning: could not record the run in $DIR/runs.json" >&2

echo "started $NAME (pid $PID)"
echo "log:  $LOG"
echo "done: $DIR/$NAME.done"
