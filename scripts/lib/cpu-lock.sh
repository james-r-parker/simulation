#!/usr/bin/env bash
# CPU lock for scripts/check.sh: one timing-sensitive gate holds the machine at a time (AGENTS.md, Delegating).
# Sourced, not run. `with_cpu_lock <command...>` runs the command (a function is fine) while holding an flock on
#   $CHECK_CPU_LOCK, default /tmp/claude-<uid>/cpu.lock (the file the agents' `flock` wrappers and `npm run screen` use).
# It runs the command at once, taking no lock, when:
#   - CHECK_CPU_LOCK=off, or CHECK_CPU_LOCK_HELD=1 (set for the command, and by a caller that holds the lock);
#   - an ancestor process already holds the lock (`flock /tmp/claude-1000/cpu.lock scripts/check.sh` must not wait on
#     itself), read from /proc/locks.
# The wait is at most CHECK_CPU_LOCK_WAIT seconds (default 3600); a timeout is exit status 75 with a line on stderr.

# lock_path: where the lock file is.
lock_path() { echo "${CHECK_CPU_LOCK:-/tmp/claude-$(id -u)/cpu.lock}"; }

# lock_held_by_ancestor <lock file>: whether a process above this one holds a flock on the file.
lock_held_by_ancestor() {
  local inode pid
  [[ -r /proc/locks && -e "$1" ]] || return 1
  inode="$(stat -c %i "$1")"
  local owners
  owners="$(awk -v ino="$inode" '$2 == "FLOCK" { n = split($6, p, ":"); if (p[n] == ino) print $5 }' /proc/locks)"
  [[ -n "$owners" ]] || return 1
  pid=$$
  while [[ -n "$pid" && "$pid" -gt 1 ]]; do
    grep -qx "$pid" <<<"$owners" && return 0
    pid="$(awk '{ print $4 }' "/proc/$pid/stat" 2>/dev/null)"
  done
  return 1
}

with_cpu_lock() {
  local lock fd status wait="${CHECK_CPU_LOCK_WAIT:-3600}"
  # with_cpu_lock_shared takes `flock -s`: test runs share the machine side by side but a timing gate, which holds the
  # lock exclusively, waits for them and they wait for it. A plain variable, never exported to the command's children.
  local mode=()
  [[ "${_CPU_LOCK_SHARED:-0}" == 1 ]] && mode=(-s)
  _CPU_LOCK_SHARED=0
  if [[ "${CHECK_CPU_LOCK:-}" == off || "${CHECK_CPU_LOCK_HELD:-}" == 1 ]]; then
    "$@"
    return $?
  fi
  lock="$(lock_path)"
  mkdir -p "$(dirname "$lock")" 2>/dev/null
  if ! { exec {fd}>>"$lock"; } 2>/dev/null; then
    "$@" # an unwritable lock location must not stop the gate
    return $?
  fi
  if lock_held_by_ancestor "$lock"; then
    exec {fd}>&-
    CHECK_CPU_LOCK_HELD=1 "$@"
    return $?
  fi
  if ! flock "${mode[@]}" -n "$fd"; then
    echo "waiting for the CPU lock ($lock)" >&2
    if ! flock "${mode[@]}" -w "$wait" "$fd"; then
      echo "gave up waiting for the CPU lock after ${wait}s ($lock)" >&2
      exec {fd}>&-
      return 75
    fi
  fi
  CHECK_CPU_LOCK_HELD=1 "$@"
  status=$?
  exec {fd}>&-
  return "$status"
}

# with_cpu_lock_shared <command...>: with_cpu_lock with a shared lock, for the test gates (scripts/lib/test-workers.mjs sets
# the worker cap; docs/agent-reference.md, "Only timing work needs a quiet machine").
with_cpu_lock_shared() {
  _CPU_LOCK_SHARED=1
  with_cpu_lock "$@"
}
