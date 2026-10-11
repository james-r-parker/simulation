#!/usr/bin/env bash
# Local gate: conventions, design-doc index, format, lint, typecheck, tests and the app build, one line per gate.
#
# Usage:
#   scripts/check.sh           # check everything
#   scripts/check.sh --fix     # apply Prettier and regenerate the design index first
#   scripts/check.sh --ci      # what CI runs (JUnit test results in TestResults/)
#   scripts/check.sh --only=conventions,format     # a subset of gates
#   scripts/check.sh --docs    # a docs-only change (scripts/change-scope.sh): conventions, designs-index, format and
#                              # the design-doc tests; combines with --fix and --ci
#   scripts/check.sh --quiet   # print only failed gates and the summary line
#
# A failed gate prints a digest under its line (failed tests with their assertion, type errors, lint problems,
# unformatted files; at most 40 lines) and keeps its full log in .checklogs/<gate>.log until the next run. Read those
# rather than rerunning the tool. Gates whose inputs do not exist yet report "skipped".
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIX=0
CI=0
DOCS=0
QUIET=0
ONLY=""
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    --ci) CI=1 ;;
    --docs) DOCS=1 ;;
    --quiet) QUIET=1 ;;
    --only=*) ONLY="${arg#--only=}" ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# docs-tests runs only when named (by --docs or --only): the full gate's test step already runs those tests.
GATES="conventions,designs-index,format,lint,typecheck,test,build,docs-tests"
if [[ $DOCS -eq 1 ]]; then
  [[ -z "$ONLY" ]] || { echo "--docs and --only cannot be combined" >&2; exit 2; }
  ONLY="conventions,designs-index,format,docs-tests"
fi
if [[ -n "$ONLY" ]]; then
  IFS=',' read -ra requested <<<"$ONLY"
  for gate in "${requested[@]}"; do
    [[ ",$GATES," == *",$gate,"* ]] || { echo "unknown gate: $gate (expected one of $GATES)" >&2; exit 2; }
  done
fi

[[ -d node_modules ]] || { echo "node_modules is missing - run: npm ci" >&2; exit 1; }
BIN="$ROOT/node_modules/.bin"

# Failed gate logs stay here (gitignored) for the agent or human to read; each run starts it afresh.
LOG_DIR="$ROOT/.checklogs"
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log
DIGEST_LINES=40

PASSED=0
FAILED=0
SKIPPED=0

wanted() { [[ -z "$ONLY" || ",$ONLY," == *",$1,"* ]]; }

# digest <gate> <log>: what to act on, at most DIGEST_LINES lines, indented under the gate's line.
digest() {
  local gate="$1" log="$2" out=""
  case "$gate" in
    test|docs-tests)
      # Each failed test's name, its assertion and the first frame in the repo, then the totals.
      out="$(grep -E '^\s*(FAIL |AssertionError|Error:|TypeError|ReferenceError|❯ (test|js|scripts)/|Test Files |Tests )' "$log" \
        | sed -E "s#${ROOT}/##g" | awk '!seen[$0]++')" ;;
    typecheck)
      out="$(grep -E '\([0-9]+,[0-9]+\): error TS[0-9]+' "$log" | awk '!seen[$0]++')" ;;
    lint)
      out="$(grep -vE '^\s*$' "$log" | sed -E "s#${ROOT}/##g")" ;;
    format)
      out="$(grep -E '^\[warn\] ' "$log" | grep -v 'Code style issues')" ;;
    *)
      out="$(grep -vE '^\s*$' "$log")" ;;
  esac
  [[ -n "$out" ]] || out="$(grep -vE '^\s*$' "$log" | tail -n 20)"
  local total
  total=$(printf '%s\n' "$out" | wc -l)
  printf '%s\n' "$out" | head -n "$DIGEST_LINES" | sed 's/^/    /'
  [[ $total -gt $DIGEST_LINES ]] && echo "    [... $((total - DIGEST_LINES)) more lines]"
  # --fix only helps with formatting and a stale index; a doc that breaks the lint needs a hand edit.
  if [[ $gate == format ]] || { [[ $gate == designs-index ]] && grep -q 'is stale' "$log"; }; then
    echo "    fix: scripts/check.sh --fix"
  fi
  echo "    full log: ${log#"$ROOT"/}"
}

# run_gate <name> <command...>
run_gate() {
  local name="$1"; shift
  wanted "$name" || return 0
  local log="$LOG_DIR/$name.log" start ms
  start=$(date +%s%N)
  if "$@" >"$log" 2>&1; then
    ms=$((($(date +%s%N) - start) / 1000000))
    [[ $QUIET -eq 1 ]] || printf '\033[32m✓\033[0m %-15s %d.%ds\n' "$name" $((ms / 1000)) $((ms % 1000 / 100))
    PASSED=$((PASSED + 1))
    rm -f "$log"
  else
    ms=$((($(date +%s%N) - start) / 1000000))
    printf '\033[31m✗\033[0m %-15s %d.%ds\n' "$name" $((ms / 1000)) $((ms % 1000 / 100))
    FAILED=$((FAILED + 1))
    digest "$name" "$log"
  fi
}

skip_gate() {
  wanted "$1" || return 0
  [[ $QUIET -eq 1 ]] || printf '\033[33m-\033[0m %-15s skipped (%s)\n' "$1" "$2"
  SKIPPED=$((SKIPPED + 1))
}

# Fix pass first, so the checks below see the fixed tree.
if [[ $FIX -eq 1 ]]; then
  wanted designs-index && node scripts/designs-index.mjs --write >/dev/null
  wanted format && "$BIN/prettier" --write --log-level warn . >/dev/null
fi

run_gate conventions scripts/check-conventions.sh

run_gate designs-index node scripts/designs-index.mjs --check

run_gate format "$BIN/prettier" --check .

run_gate lint "$BIN/eslint" --max-warnings 0 .

run_gate typecheck "$BIN/tsc" -p tsconfig.json --pretty false

# run_tests <junit file> <vitest args...>: in CI the results also go to TestResults/<junit file> for the workflow to
# upload.
run_tests() {
  local junit="$1"
  shift
  if [[ $CI -eq 1 ]]; then
    "$BIN/vitest" run --reporter=default --reporter=junit --outputFile.junit="TestResults/$junit" "$@"
  else
    "$BIN/vitest" run "$@"
  fi
}

# tracked <pathspec...>: whether any tracked or new (not ignored) file matches, at any depth.
tracked() { [[ -n "$(git ls-files --cached --others --exclude-standard -- "$@" | head -n 1)" ]]; }

if tracked 'test/*.test.js'; then
  run_gate test run_tests junit.xml
elif tracked 'js/sim/*.js' 'js/evo/*.js'; then
  # Code without tests is a failure, not a skip: every phase ships its tests (docs/designs/STYLE.md).
  run_gate test sh -c 'echo "js/sim or js/evo has code but test/ has no tests - every phase ships its tests" >&2; exit 1'
else
  skip_gate test "no tests yet"
fi

# The tests that read this repo's Markdown (the design-doc lint over every doc, and the index). Only when named: the
# test gate above already runs them.
if [[ ",$ONLY," == *",docs-tests,"* ]]; then
  if [[ -f test/designs-index.test.js ]]; then
    run_gate docs-tests run_tests junit-docs.xml test/designs-index.test.js
  else
    skip_gate docs-tests "no test/designs-index.test.js"
  fi
fi

# The app still builds for deployment. The output goes to a temporary directory, never to dist/.
build_app() {
  local out status
  out="$(mktemp -d)"
  "$BIN/vite" build --outDir "$out" --emptyOutDir --logLevel warn
  status=$?
  rm -rf "$out"
  return "$status"
}
run_gate build build_app

[[ $FAILED -eq 0 ]] && rmdir "$LOG_DIR" 2>/dev/null

if [[ $FAILED -gt 0 ]]; then
  echo "$FAILED failed, $PASSED passed, $SKIPPED skipped"
  exit 1
fi
echo "All $PASSED checks passed ($SKIPPED skipped)"
