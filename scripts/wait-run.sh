#!/usr/bin/env bash
# Blocks until a run started by scripts/run-detached.sh ends, prints its exit code and the log tail, and exits with the
# run's exit code.
#
# Usage:
#   scripts/wait-run.sh <name> [--timeout <seconds>]
#
# Exit status: the run's own; 124 on --timeout (the run keeps going); 125 when the run's process vanished without writing
# its .done file (killed outright); 2 on a bad argument or an unknown name. <dir> is $RUNS_DIR, default .runs/ in the repo
# root. The wait polls the .done file (every WAIT_RUN_POLL seconds, default 1) and checks the recorded pid with kill -0;
# it never uses pgrep, so it cannot match itself.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { echo "usage: wait-run.sh <name> [--timeout <seconds>]" >&2; exit 2; }

[[ $# -ge 1 ]] || usage
NAME="$1"
shift
TIMEOUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout)
      [[ $# -ge 2 && "$2" =~ ^[0-9]+$ ]] || usage
      TIMEOUT="$2"
      shift 2 ;;
    *) usage ;;
  esac
done

DIR="${RUNS_DIR:-$ROOT/.runs}"
LOG="$DIR/$NAME.log"
[[ -f "$LOG" ]] || { echo "no such run: $NAME (no $LOG)" >&2; exit 2; }
POLL="${WAIT_RUN_POLL:-1}"
PID="$(cat "$DIR/$NAME.pid" 2>/dev/null || true)"

tail_log() { echo "--- last lines of $LOG"; tail -n "${WAIT_RUN_TAIL:-20}" "$LOG"; }

start=$SECONDS
gone=0
while [[ ! -f "$DIR/$NAME.done" ]]; do
  if [[ -n "$TIMEOUT" && $((SECONDS - start)) -ge $TIMEOUT ]]; then
    echo "timeout after ${TIMEOUT}s: $NAME is still running"
    tail_log
    exit 124
  fi
  # A run whose process is gone and left no .done file was killed; two checks in a row avoid racing its last write.
  if [[ -n "$PID" ]] && ! kill -0 "$PID" 2>/dev/null; then
    gone=$((gone + 1))
    if [[ $gone -ge 2 && ! -f "$DIR/$NAME.done" ]]; then
      echo "run $NAME died without an exit code (pid $PID is gone)"
      tail_log
      exit 125
    fi
  fi
  sleep "$POLL"
done

code="$(cat "$DIR/$NAME.done")"
echo "exit code: $code"
tail_log
[[ "$code" =~ ^[0-9]+$ ]] || exit 1
exit "$code"
