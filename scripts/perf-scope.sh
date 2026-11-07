#!/usr/bin/env bash
# Whether a change can move the step time: prints "perf" when any changed path is under js/sim/, js/evo/, js/worker/ or
# bench/, else "none". The CI `perf` job runs bench-compare on "perf" and skips its remaining steps (still passing) on
# "none", so it reports on every PR and can become a required check.
#
# Usage:
#   scripts/perf-scope.sh <base-ref>     # the paths changed on HEAD since it left <base-ref> (git diff <base-ref>...HEAD)
#   git diff --name-only | scripts/perf-scope.sh     # the paths on stdin, one per line
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

case "${1:-}" in
  -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
esac
[[ $# -le 1 ]] || { echo "usage: scripts/perf-scope.sh [<base-ref>]" >&2; exit 2; }

if [[ $# -eq 1 ]]; then
  # --no-renames lists both sides of a move, so moving a file out of js/sim/ still counts it.
  paths="$(git diff --name-only --no-renames "$1...HEAD")"
else
  paths="$(cat)"
fi

while IFS= read -r path; do
  case "$path" in
    js/sim/* | js/evo/* | js/worker/* | bench/*)
      echo "perf: $path" >&2
      echo perf
      exit 0 ;;
  esac
done <<<"$paths"
echo "none: no path under js/sim/, js/evo/, js/worker/ or bench/" >&2
echo none
