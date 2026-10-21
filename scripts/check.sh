#!/usr/bin/env bash
# Local gate: conventions, design-doc index, format, lint, typecheck, tests and the app build, one line per gate.
#
# Usage:
#   scripts/check.sh           # check everything
#   scripts/check.sh --fix     # apply Prettier and regenerate the design index first
#   scripts/check.sh --ci      # what CI runs (JUnit test results in TestResults/); the test gate runs only the fast tests
#                              # (TEST_SCOPE=fast: no *.slow.test.js files) and the coverage ratchet is skipped
#   scripts/check.sh --ci --full   # CI with every test and the ratchet (what the nightly runs)
#   scripts/check.sh --only=conventions,format     # a subset of gates
#   scripts/check.sh --docs    # a docs-only change (scripts/change-scope.sh): conventions, designs-index, format and
#                              # the design-doc tests; combines with --fix and --ci
#   scripts/check.sh --quiet   # print only failed gates and the summary line
#   scripts/check.sh --tier 1  # tier 1 (pre-commit), 2 (default, the PR gate) or 3 (nightly); not with --only/--docs
#   scripts/check.sh --list    # print the gates the other flags select, one per line, and run nothing
#
# A failed gate prints a digest under its line (failed tests with their assertion, type errors, lint problems,
# unformatted files; at most 40 lines) and keeps its full log in .checklogs/<gate>.log until the next run. Read those
# rather than rerunning the tool. Gates whose inputs do not exist yet report "skipped".
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIX=0
CI=0
FULL=0
DOCS=0
QUIET=0
ONLY=""
TIER=""
LIST=0
args=("$@")
i=0
while [[ $i -lt ${#args[@]} ]]; do
  arg="${args[$i]}"
  i=$((i + 1))
  case "$arg" in
    --tier)
      [[ $i -lt ${#args[@]} ]] || { echo "--tier needs a value (1, 2 or 3)" >&2; exit 2; }
      TIER="${args[$i]}"; i=$((i + 1)) ;;
    --tier=*) TIER="${arg#--tier=}" ;;
    --list) LIST=1 ;;
    --fix) FIX=1 ;;
    --ci) CI=1 ;;
    --full) FULL=1 ;;
    --docs) DOCS=1 ;;
    --quiet) QUIET=1 ;;
    --only=*) ONLY="${arg#--only=}" ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Gates in run order, by tier (each tier includes the one below). docs-tests belongs to no tier: it runs only when named
# (by --docs or --only), because the test gate already runs those tests.
TIER1_GATES="conventions,format,lint,test-related"
TIER2_GATES="conventions,designs-index,format,lint,test-related,typecheck,deps,dupes,test,ratchet,bench-check,build,browser-smoke,eval-smoke"
TIER3_GATES="$TIER2_GATES,mutation,bench-compare"
GATES="$TIER3_GATES,docs-tests"
if [[ -n "$TIER" ]]; then
  [[ -z "$ONLY" && $DOCS -eq 0 ]] || { echo "--tier cannot be combined with --only or --docs" >&2; exit 2; }
  case "$TIER" in
    1) ONLY="$TIER1_GATES" ;;
    2) ONLY="$TIER2_GATES" ;;
    3) ONLY="$TIER3_GATES" ;;
    *) echo "unknown tier: $TIER (expected 1, 2 or 3)" >&2; exit 2 ;;
  esac
fi
if [[ $DOCS -eq 1 ]]; then
  [[ -z "$ONLY" ]] || { echo "--docs and --only cannot be combined" >&2; exit 2; }
  ONLY="conventions,designs-index,format,docs-tests"
fi
[[ -n "$ONLY" ]] || ONLY="$TIER2_GATES"
[[ -z "${TEST_SEED:-}" || "$TEST_SEED" =~ ^[0-9]+$ ]] || { echo "TEST_SEED must be a non-negative integer, got: $TEST_SEED" >&2; exit 2; }
if [[ -n "$ONLY" ]]; then
  IFS=',' read -ra requested <<<"$ONLY"
  for gate in "${requested[@]}"; do
    [[ ",$GATES," == *",$gate,"* ]] || { echo "unknown gate: $gate (expected one of $GATES)" >&2; exit 2; }
  done
fi

# Tier 1 (pre-commit) checks the staged files, as they are in the working tree; deleted files have nothing to check.
STAGED=()
FORMAT_FILES=()
LINT_FILES=()
RELATED_FILES=()
if [[ "$TIER" == 1 ]]; then
  while IFS= read -r -d '' file; do
    STAGED+=("$file")
    FORMAT_FILES+=("$file")
    case "$file" in
      *.js|*.mjs|*.cjs) LINT_FILES+=("$file") ;;
    esac
    case "$file" in
      *.js|*.mjs) RELATED_FILES+=("$file") ;;
    esac
  done < <(git diff --cached --name-only -z --diff-filter=ACMR)
fi

if [[ $LIST -eq 1 ]]; then
  # Print in run order, whatever order --only gave them.
  IFS=',' read -ra all <<<"$GATES"
  for gate in "${all[@]}"; do
    [[ ",$ONLY," == *",$gate,"* ]] && echo "$gate"
  done
  # Under tier 1 the staged files each gate reads go to stderr, so stdout stays the gate names.
  if [[ "$TIER" == 1 ]]; then
    echo "format: ${FORMAT_FILES[*]}" >&2
    echo "lint: ${LINT_FILES[*]}" >&2
    echo "test-related: ${RELATED_FILES[*]}" >&2
  fi
  exit 0
fi

[[ -d node_modules ]] || { echo "node_modules is missing - run: npm ci" >&2; exit 1; }
BIN="$ROOT/node_modules/.bin"

# Failed gate logs stay here (gitignored) for the agent or human to read; each run starts it afresh.
LOG_DIR="${CHECK_LOG_DIR:-$ROOT/.checklogs}"
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
  local label="${GATE_LABEL:-$name}"
  local log="$LOG_DIR/$name.log" start ms
  start=$(date +%s%N)
  if "$@" >"$log" 2>&1; then
    ms=$((($(date +%s%N) - start) / 1000000))
    [[ $QUIET -eq 1 ]] || printf '\033[32m✓\033[0m %-15s %d.%ds\n' "$label" $((ms / 1000)) $((ms % 1000 / 100))
    PASSED=$((PASSED + 1))
    rm -f "$log"
  else
    ms=$((($(date +%s%N) - start) / 1000000))
    printf '\033[31m✗\033[0m %-15s %d.%ds\n' "$label" $((ms / 1000)) $((ms % 1000 / 100))
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
  if [[ "$TIER" == 1 ]]; then
    # Tier 1 formats only the staged files and does not re-stage them.
    [[ ${#FORMAT_FILES[@]} -eq 0 ]] || { wanted format && "$BIN/prettier" --write --ignore-unknown --log-level warn "${FORMAT_FILES[@]}" >/dev/null; }
  else
    wanted format && "$BIN/prettier" --write --log-level warn . >/dev/null
  fi
fi

run_gate conventions scripts/check-conventions.sh

run_gate designs-index node scripts/designs-index.mjs --check

if [[ "$TIER" != 1 ]]; then
  run_gate format "$BIN/prettier" --check .
  run_gate lint "$BIN/eslint" --max-warnings 0 .
else
  if [[ ${#FORMAT_FILES[@]} -gt 0 ]]; then
    run_gate format "$BIN/prettier" --check --ignore-unknown "${FORMAT_FILES[@]}"
  else
    skip_gate format "no staged files"
  fi
  if [[ ${#LINT_FILES[@]} -gt 0 ]]; then
    run_gate lint "$BIN/eslint" --max-warnings 0 --no-warn-ignored "${LINT_FILES[@]}"
  else
    skip_gate lint "no staged .js, .mjs or .cjs files"
  fi
fi

# Not yet built gates report skipped; each is its own function so it is filled in separately.
# gate_test_related: the tests related to the staged files (vitest related).
gate_test_related() {
  if [[ "$TIER" != 1 ]]; then
    skip_gate test-related "tier 1 only; tiers 2 and 3 run the full test gate"
  elif [[ ${#RELATED_FILES[@]} -eq 0 ]]; then
    skip_gate test-related "no staged .js or .mjs files"
  else
    run_gate test-related "$BIN/vitest" related --run --passWithNoTests "${RELATED_FILES[@]}"
  fi
}
# gate_deps: layering rules from .dependency-cruiser.cjs (dependency-cruiser).
gate_deps() {
  local paths=() p
  for p in js/sim js/evo js/worker js/app scripts test; do [[ -d $p ]] && paths+=("$p"); done
  run_gate deps "$BIN/depcruise" --config .dependency-cruiser.cjs --output-type err "${paths[@]}"
}
# gate_dupes: copy-paste detection over js/sim, js/evo, js/worker, js/app and scripts (jscpd with .jscpd.json).
gate_dupes() {
  local paths=() p
  for p in js/sim js/evo js/worker js/app scripts; do
    [[ -e $p ]] && paths+=("$p")
  done
  if [[ ${#paths[@]} -eq 0 ]]; then
    skip_gate dupes "nothing to scan"
    return 0
  fi
  run_gate dupes "$BIN/jscpd" --config .jscpd.json "${paths[@]}"
}
# gate_ratchet: coverage and quality numbers may not fall (scripts/quality-ratchet.mjs).
gate_ratchet() {
  if [[ $FAST_TESTS -eq 1 ]]; then
    skip_gate ratchet "coverage is measured on the full suite locally and in the nightly run"
  elif [[ $TEST_RAN -eq 1 && $TEST_OK -eq 1 ]]; then
    run_gate ratchet node scripts/quality-ratchet.mjs --check
  else
    skip_gate ratchet "needs a passing test gate in the same run"
  fi
}
# gate_bench_check: the step time at 500 agents stays within 15% of bench/baseline.json (scripts/bench-check.mjs).
bench_check() {
  local out status
  out="$(mktemp)"
  node scripts/bench.mjs --json --sizes=500 >"$out" || { rm -f "$out"; return 1; }
  node scripts/bench-check.mjs bench/baseline.json "$out"
  status=$?
  rm -f "$out"
  return "$status"
}
gate_bench_check() {
  if [[ $CI -eq 1 ]]; then
    skip_gate bench-check "baseline is machine-specific"
  elif [[ ! -f bench/baseline.json ]]; then
    skip_gate bench-check "no bench/baseline.json"
  else
    run_gate bench-check bench_check
  fi
}
# gate_browser_smoke: the built app loads in a browser (scripts/browser-smoke.sh). It needs the Playwright image: skipped
# without Docker (a failure under --ci). In CI the `check` job leaves it to the browser-smoke job, which passes --only.
gate_browser_smoke() {
  wanted browser-smoke || return 0
  if [[ $CI -eq 1 && -z "$ONLY" ]]; then
    skip_gate browser-smoke "runs in the browser-smoke job"
  elif [[ $CI -eq 0 && "${PLAYWRIGHT_BROWSERS_PATH:-}" != /ms-playwright && "${SMOKE_LOCAL:-}" != 1 ]] \
    && ! docker info >/dev/null 2>&1; then
    skip_gate browser-smoke "no Docker (SMOKE_LOCAL=1 uses the local Chromium)"
  else
    run_gate browser-smoke scripts/browser-smoke.sh
  fi
}
# gate_eval_smoke: a two-seed, 10000-tick live eval on evals/smoke-config.json (maxAgents 150) must finish with no worker
# error and a report that passes validateReport (eval.mjs validates before writing and exits 1 otherwise). The report goes
# to a temporary directory. The eval's own output is the log, so a failure's digest shows the reason.
eval_smoke() {
  local out status
  out="$(mktemp -d)"
  node scripts/eval.mjs --seeds 2 --ticks 10000 --policy live --config evals/smoke-config.json \
    --out "$out/report.json"
  status=$?
  rm -rf "$out"
  return "$status"
}
gate_eval_smoke() {
  run_gate eval-smoke eval_smoke
}
# gate_mutation: mutation testing score (stryker.config.json), then the ratchet on reports/mutation/mutation.json.
# Under --fix a passing gate raises the mutation baselines (never lowers them).
# The first Vitest major the installed Stryker vitest-runner cannot drive; raise it when Stryker supports it.
STRYKER_MAX_VITEST=5
mutation_run() { npx stryker run && node scripts/quality-ratchet.mjs --check --mutation; }
gate_mutation() {
  if [[ ! -d node_modules/@stryker-mutator/core ]]; then
    skip_gate mutation "stryker is not installed"
  elif ! tracked 'js/sim/*.js'; then
    skip_gate mutation "no js/sim code yet"
  elif [[ "$(node -p "require('./node_modules/vitest/package.json').version.split('.')[0]")" -ge "$STRYKER_MAX_VITEST" ]]; then
    # Stryker's vitest-runner 10 kills no mutant under Vitest 5 (docs/designs/sim-notes.md, 2026-10-15).
    skip_gate mutation "the Stryker vitest-runner does not support Vitest 5 yet"
  else
    local failed_before=$FAILED
    run_gate mutation mutation_run
    if [[ $FIX -eq 1 && $FAILED -eq $failed_before ]] && wanted mutation; then
      node scripts/quality-ratchet.mjs --write --mutation
    fi
  fi
}
# gate_bench_compare: main-versus-branch benchmarks (scripts/bench-compare.mjs), five alternating runs per tree at
# 500 agents (about 10 runs of 15-20 s plus an npm ci). Exit 3 from --skip-check is a skip, with the reason on stdout.
gate_bench_compare() {
  wanted bench-compare || return 0
  local reason status=0
  reason="$(node scripts/bench-compare.mjs --skip-check 2>&1)" || status=$?
  if [[ $status -eq 3 ]]; then
    skip_gate bench-compare "${reason#skipped: }"
  else
    run_gate bench-compare node scripts/bench-compare.mjs --sizes=500
  fi
}

gate_test_related

run_gate typecheck "$BIN/tsc" -p tsconfig.json --pretty false

gate_deps

gate_dupes

# run_tests <junit file> <vitest args...>: in CI the results also go to TestResults/<junit file> for the workflow to
# upload.
run_tests() {
  local junit="$1"
  shift
  if [[ $CI -eq 1 ]]; then
    "${VITEST_BIN:-$BIN/vitest}" run --reporter=default --reporter=junit --outputFile.junit="TestResults/$junit" "$@"
  else
    "${VITEST_BIN:-$BIN/vitest}" run "$@"
  fi
}

# tracked <pathspec...>: whether any tracked or new (not ignored) file matches, at any depth.
tracked() { [[ -n "$(git ls-files --cached --others --exclude-standard -- "$@" | head -n 1)" ]]; }

# run_test_gate: the test gate with coverage and a shuffled order. TEST_SEED replays an order; unset, a random seed is
# drawn (tooling, not simulation, so $RANDOM is fine). The seed is on the gate line and the first line of the log.
# VITEST_BIN swaps the runner (the tests of this script use it to avoid running vitest inside vitest).
seeded_tests() {
  echo "test order seed: $1"
  if [[ $FAST_TESTS -eq 1 ]]; then
    echo "test scope: fast (the *.slow.test.js files are left out; no coverage)"
    TEST_SCOPE=fast run_tests junit.xml --sequence.shuffle --sequence.seed="$1"
  else
    # Two passes: everything with coverage except the long statistical tests, then those without coverage (their
    # billions of ray casts wrap V8's block counters; vitest.config.js STATISTICAL_TESTS).
    TEST_SCOPE=coverage run_tests junit.xml --coverage --sequence.shuffle --sequence.seed="$1" &&
      TEST_SCOPE=statistical run_tests junit-statistical.xml --sequence.shuffle --sequence.seed="$1"
  fi
}
run_test_gate() {
  wanted test || return 0
  local seed="${TEST_SEED:-$RANDOM}"
  GATE_LABEL="test (seed $seed)"
  [[ $FAST_TESTS -eq 1 ]] && GATE_LABEL="test (fast, seed $seed)"
  TEST_RAN=1
  run_gate test seeded_tests "$seed"
  GATE_LABEL=""
  [[ $FAILED -eq $FAILED_BEFORE_TEST ]] && TEST_OK=1
  return 0
}

# CI runs the fast tests only; --full (the nightly) and every local run run them all, with coverage.
FAST_TESTS=0
[[ $CI -eq 1 && $FULL -eq 0 ]] && FAST_TESTS=1
TEST_RAN=0
TEST_OK=0
FAILED_BEFORE_TEST=$FAILED
if tracked 'test/*.test.js'; then
  run_test_gate
elif tracked 'js/sim/*.js' 'js/evo/*.js'; then
  # Code without tests is a failure, not a skip: every phase ships its tests (docs/designs/STYLE.md).
  run_gate test sh -c 'echo "js/sim or js/evo has code but test/ has no tests - every phase ships its tests" >&2; exit 1'
else
  skip_gate test "no tests yet"
fi

# Under --fix, a passing test gate raises the coverage baselines (never lowers them).
if [[ $FIX -eq 1 && $FAST_TESTS -eq 0 && $TEST_RAN -eq 1 && $TEST_OK -eq 1 ]]; then
  node scripts/quality-ratchet.mjs --write
fi

gate_ratchet

gate_bench_check

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

gate_browser_smoke

gate_eval_smoke

gate_mutation

gate_bench_compare

[[ $FAILED -eq 0 ]] && rmdir "$LOG_DIR" 2>/dev/null

if [[ $FAILED -gt 0 ]]; then
  echo "$FAILED failed, $PASSED passed, $SKIPPED skipped"
  exit 1
fi
echo "All $PASSED checks passed ($SKIPPED skipped)"
