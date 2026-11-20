#!/usr/bin/env bash
# Repository conventions that the linters do not enforce. Called by scripts/check.sh as the "conventions" gate; prints
# one line per violation and exits 1 if there are any.
#
# - Dependency versions in package.json are exact pins (no ^, ~, *, x, ranges or tags); package-lock.json exists.
# - The headless sim (js/sim/, js/evo/) never touches the DOM, three, navigator, Math.random, Date.now or
#   performance.now: runs must replay from seed and config (docs/designs/STYLE.md, Tests and diagnostics).
# - Every module under js/sim/ and js/evo/ has a test at the mirrored path: js/sim/brain.js -> test/sim/brain.test.js.
# - Every module under js/worker/ and js/app/ has a test at the mirrored path (test/worker/, test/app/), except the
#   browser shells in BROWSER_SHELLS, which test/browser/app.spec.js covers (docs/designs/worker-and-renderer.md).
# - Every module under js/library/ and functions/_lib/ is imported by some test under test/ (those tests are grouped by
#   concern, not mirrored one to one: docs/designs/deployment-and-community.md).
# - The legacy app stays deleted: no file directly under js/ (code lives in js/sim/, js/evo/, js/worker/ or js/app/),
#   none of the deleted legacy paths (LEGACY_PATHS) comes back, and AGENTS.md, README.md and the skills under
#   .claude/skills/ do not use the word "legacy" except on a line that links legacy-audit.md or bench/legacy-baseline.json.
# - One source per served worker: a file in public/ has no same-named copy under js/.
# - evals/experiments.json is valid against evals/experiments.schema.json (scripts/check-experiments.mjs).
# - scripts/flag-ledger.json lists every boolean or enum config rule, names no key that is gone, and names no plan that
#   is built while its key still exists (scripts/check-flag-ledger.mjs).
# - wasm/blob-kernels.wasm matches its .sha256 and wasm/blob-kernels.src.sha256 its sources, and a fresh build matches
#   where cargo exists (scripts/check-wasm.mjs).
# - The index in docs/designs/sim-notes.md matches docs/notes/ (scripts/notes-index.mjs --check).
# - AGENTS.md stays at or under AGENTS_MAX_BYTES (16000): an agent reads it before its first command, so detail lives in
#   docs/ (docs/designs/agent-workflow.md, Context diet).
# - No merge conflict markers (a line starting <<<<<<< , ||||||| or >>>>>>> , or exactly =======) in tracked text files.
# - No tracked file over 5 MB unless it is listed in LARGE_FILE_ALLOWLIST.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# No file is allowlisted today.
LARGE_FILE_ALLOWLIST=()
LARGE_FILE_BYTES=$((5 * 1024 * 1024))

# Shells that need a real worker, window, GPU context or AudioContext; the browser spec covers them.
BROWSER_SHELLS=("js/worker/sim-worker.js" "js/app/main.js" "js/app/audio/engine.js" "js/app/pack/pack-worker.js" "js/app/pack/pack-boot.js")

# Paths of the deleted legacy app (pathspecs); a tracked file under any of them is a violation.
LEGACY_PATHS=("legacy.html" "js/constants" "js/dev" "css/style.css" "css/toast.css" "public/database-worker.js")

# AGENTS.md is read in full at the start of every session; its budget is in docs/designs/agent-workflow.md.
AGENTS_MAX_BYTES=16000

violations=0
fail() { echo "$1"; violations=$((violations + 1)); }

[[ -f package-lock.json ]] || fail "package-lock.json is missing - run: npm install"

while IFS= read -r line; do
  fail "package.json: $line - pin an exact version (npm install --save-exact)"
done < <(node -e '
const p = require("./package.json");
for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
  for (const [name, version] of Object.entries(p[field] ?? {})) {
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) console.log(`${field}.${name} is "${version}"`);
  }
}')

mapfile -t sim_files < <(git ls-files --cached --others --exclude-standard -- 'js/sim/*.js' 'js/sim/**/*.js' 'js/evo/*.js' 'js/evo/**/*.js')
# One grep over every file, not one per file: a process per file made this gate take seconds on every commit.
if ((${#sim_files[@]} > 0)); then
  while IFS= read -r hit; do
    file="${hit%%:*}"
    rest="${hit#*:}"
    fail "$file:${rest%%:*}: ${rest#*:} - the headless sim never uses browser globals, three or wall-clock randomness"
  done < <(grep -HnE "\b(Math\.random|Date\.now|performance\.now|window|document|navigator)\b|(from|import) ['\"]three(/[^'\"]*)?['\"]" "${sim_files[@]}" \
    | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)')
fi

for file in "${sim_files[@]}"; do
  test_file="test/${file#js/}"
  test_file="${test_file%.js}.test.js"
  [[ -f "$test_file" ]] || fail "$file: no test at $test_file - every module ships with its tests"
done

mapfile -t app_files < <(git ls-files --cached --others --exclude-standard -- 'js/worker/*.js' 'js/worker/**/*.js' 'js/app/*.js' 'js/app/**/*.js')
for file in "${app_files[@]}"; do
  [[ " ${BROWSER_SHELLS[*]} " == *" $file "* ]] && continue
  test_file="test/${file#js/}"
  test_file="${test_file%.js}.test.js"
  [[ -f "$test_file" ]] || fail "$file: no test at $test_file - every module ships with its tests"
done

mapfile -t library_files < <(git ls-files --cached --others --exclude-standard -- 'js/library/*.js' 'functions/_lib/*.js')
for file in "${library_files[@]}"; do
  grep -rqF --include='*.js' -e "/$file" test ||
    fail "$file: no test under test/ imports it - every module ships with its tests"
done

while IFS= read -r file; do
  fail "$file: sits directly under js/ - put code in js/sim/, js/evo/, js/worker/ or js/app/ (the legacy app is deleted)"
done < <(git ls-files --cached --others --exclude-standard -- ':(glob)js/*')

while IFS= read -r file; do
  fail "$file: a deleted legacy path came back - the legacy app is gone (docs/designs/legacy-audit.md records why)"
done < <(git ls-files --cached --others --exclude-standard -- "${LEGACY_PATHS[@]}")

# "legacy" in the instructions is allowed only on a line that links the audit or the recorded baseline.
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  while IFS= read -r hit; do
    fail "$file:${hit%%:*}: the word \"legacy\" outside a link to legacy-audit.md or bench/legacy-baseline.json - describe the repo as it is"
  done < <(grep -niE 'legacy' "$file" | grep -vE 'legacy-audit\.md|bench/legacy-baseline\.json')
done < <(git ls-files --cached --others --exclude-standard -- 'AGENTS.md' 'README.md' '.claude/skills/*.md' '.claude/skills/**/*.md')

if [[ -d public ]]; then
  while IFS= read -r served; do
    name="$(basename "$served")"
    while IFS= read -r copy; do
      fail "$copy: duplicate of $served - the served copy in public/ is the only source"
    done < <(git ls-files --cached --others --exclude-standard -- "js/$name" "js/**/$name")
  done < <(git ls-files --cached --others --exclude-standard -- 'public/*.js')
fi

# Captured rather than piped, so a crash (no output, non-zero exit) still fails the gate.
experiments_out="$(node scripts/check-experiments.mjs 2>&1)"
experiments_status=$?
while IFS= read -r line; do
  [[ -n "$line" ]] && fail "$line"
done <<<"$experiments_out"
if ((experiments_status != 0)) && [[ -z "$experiments_out" ]]; then
  fail "experiments: scripts/check-experiments.mjs exited $experiments_status with no output"
fi

flag_out="$(node scripts/check-flag-ledger.mjs 2>&1)"
flag_status=$?
while IFS= read -r line; do
  [[ -n "$line" ]] && fail "$line"
done <<<"$flag_out"
if ((flag_status != 0)) && [[ -z "$flag_out" ]]; then
  fail "flag-ledger: scripts/check-flag-ledger.mjs exited $flag_status with no output"
fi

# Every `eval.` name in the code, the tests, the configs and the unbuilt phases' Targets is in the metric registry.
names_out="$(node scripts/check-metric-names.mjs 2>&1)"
names_status=$?
while IFS= read -r line; do
  [[ -n "$line" ]] && fail "metric-names: $line"
done <<<"$names_out"
if ((names_status != 0)) && [[ -z "$names_out" ]]; then
  fail "metric-names: scripts/check-metric-names.mjs exited $names_status with no output"
fi

# docs/designs/metrics.md is the table the registry generates; a stale one fails with the command that fixes it.
metrics_out="$(node scripts/metrics-doc.mjs --check 2>&1)"
metrics_status=$?
if ((metrics_status != 0)); then
  fail "metrics-doc: ${metrics_out:-scripts/metrics-doc.mjs exited $metrics_status with no output}"
fi

# docs/scene-scorecard.md is generated from the registry's `scenes` tags and the newest shared baseline; a stale one fails with the command that fixes it.
scorecard_out="$(node scripts/scene-scorecard.mjs --check 2>&1)"
scorecard_status=$?
if ((scorecard_status != 0)); then
  fail "scene-scorecard: ${scorecard_out:-scripts/scene-scorecard.mjs exited $scorecard_status with no output}"
fi

# The index in docs/designs/sim-notes.md lists every entry in docs/notes/; a stale one fails with the command that fixes it.
notes_out="$(node scripts/notes-index.mjs --check 2>&1)"
notes_status=$?
if ((notes_status != 0)); then
  fail "notes-index: ${notes_out:-scripts/notes-index.mjs exited $notes_status with no output}"
fi

# The committed WASM kernels match their hash and their sources; without cargo the rebuild is skipped with a note.
wasm_out="$(node scripts/check-wasm.mjs 2>&1)"
wasm_status=$?
while IFS= read -r line; do
  [[ -n "$line" && "$line" != *"skipped the rebuild"* ]] && fail "$line"
done <<<"$wasm_out"
if ((wasm_status != 0)) && [[ -z "$wasm_out" ]]; then
  fail "wasm: scripts/check-wasm.mjs exited $wasm_status with no output"
fi

if [[ -f AGENTS.md ]]; then
  agents_bytes=$(wc -c <AGENTS.md)
  if ((agents_bytes > AGENTS_MAX_BYTES)); then
    fail "AGENTS.md: $agents_bytes bytes - it stays at or under $AGENTS_MAX_BYTES (move detail to docs/commands.md or a design doc)"
  fi
fi

# One stat for all files (a path deleted from the working tree is skipped), then only the files over the limit reach
# the loop: a stat per file was most of this gate's time.
while IFS= read -r line; do
  size="${line%% *}"
  file="${line#* }"
  [[ -f "$file" ]] || continue
  if [[ ! " ${LARGE_FILE_ALLOWLIST[*]} " == *" $file "* ]]; then
    fail "$file: $((size / 1024 / 1024)) MB - tracked files stay under 5 MB (host large media elsewhere)"
  fi
done < <(git ls-files --cached --others --exclude-standard -z | xargs -0 -r stat -c '%s %n' 2>/dev/null \
  | awk -v max="$LARGE_FILE_BYTES" '$1 > max')

# -I skips binary files; node_modules is untracked, but the pathspec keeps a checked-in copy out too. Run from a hook,
# git exports GIT_INDEX_FILE, which git grep follows, so this reads the index being committed.
while IFS= read -r hit; do
  fail "$hit - merge conflict marker"
done < <(git grep -InE '^(<{7} |\|{7} |>{7} |={7}$)' -- . ':(exclude)node_modules' ':(exclude)**/node_modules/**' | cut -d: -f1,2)

# test-data: a test reads no shipped data file that a non-code PR edits (docs/designs/agent-workflow.md, Tests read
# fixtures). Only a `*.shipped.test.js` (or `*.shipped.slow.test.js`) may, to assert that the shipped file parses and
# validates (test/check-conventions.test.js, which tests this rule, is exempt); every other test reads a frozen copy under test/fixtures/. Comment lines are skipped.
SHIPPED_DATA='evals/(train-tune\.json|stages|train-screens|ledger)\b|(?<!fixtures/)train-(ladder|curriculum)[^\x27"\x60 ]*\.json'
while IFS= read -r hit; do
  fail "$hit - test-data: a test reads a shipped evals/ data file; copy what it needs to test/fixtures/ (only *.shipped.test.js reads the shipped file)"
done < <(git grep -InP "$SHIPPED_DATA" -- 'test/*.js' 'test/**/*.js' ':(exclude)test/fixtures/**' ':(exclude)test/check-conventions.test.js' ':(exclude)*.shipped.test.js' ':(exclude)*.shipped.slow.test.js' \
  | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)' | cut -c1-160)

if [[ $violations -gt 0 ]]; then
  echo "$violations convention violation(s)"
  exit 1
fi
echo "Conventions hold (${#sim_files[@]} sim files, ${#app_files[@]} worker and app files checked)."
