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
# - The legacy app stays deleted: no file directly under js/ (code lives in js/sim/, js/evo/, js/worker/ or js/app/),
#   none of the deleted legacy paths (LEGACY_PATHS) comes back, and AGENTS.md, README.md and the skills under
#   .claude/skills/ do not use the word "legacy" except on a line that links legacy-audit.md or bench/legacy-baseline.json.
# - One source per served worker: a file in public/ has no same-named copy under js/.
# - evals/experiments.json is valid against evals/experiments.schema.json (scripts/check-experiments.mjs).
# - No merge conflict markers (a line starting <<<<<<< , ||||||| or >>>>>>> , or exactly =======) in tracked text files.
# - No tracked file over 5 MB unless it is listed in LARGE_FILE_ALLOWLIST.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# No file is allowlisted today.
LARGE_FILE_ALLOWLIST=()
LARGE_FILE_BYTES=$((5 * 1024 * 1024))

# Shells that need a real worker, window, WebGL context or AudioContext; the browser spec covers them.
BROWSER_SHELLS=("js/worker/sim-worker.js" "js/app/main.js" "js/app/renderer/scene.js" "js/app/renderer/bloom.js" "js/app/audio/engine.js")

# Paths of the deleted legacy app (pathspecs); a tracked file under any of them is a violation.
LEGACY_PATHS=("legacy.html" "js/constants" "js/dev" "css/style.css" "css/toast.css" "public/database-worker.js")

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
for file in "${sim_files[@]}"; do
  while IFS= read -r hit; do
    fail "$file:${hit%%:*}: ${hit#*:} - the headless sim never uses browser globals, three or wall-clock randomness"
  done < <(grep -nE "\b(Math\.random|Date\.now|performance\.now|window|document|navigator)\b|(from|import) ['\"]three(/[^'\"]*)?['\"]" "$file" \
    | grep -vE '^[0-9]+:\s*(//|\*|/\*)')
done

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

while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  size=$(stat -c %s "$file")
  if [[ $size -gt $LARGE_FILE_BYTES ]] && [[ ! " ${LARGE_FILE_ALLOWLIST[*]} " == *" $file "* ]]; then
    fail "$file: $((size / 1024 / 1024)) MB - tracked files stay under 5 MB (host large media elsewhere)"
  fi
done < <(git ls-files --cached --others --exclude-standard)

# -I skips binary files; node_modules is untracked, but the pathspec keeps a checked-in copy out too. Run from a hook,
# git exports GIT_INDEX_FILE, which git grep follows, so this reads the index being committed.
while IFS= read -r hit; do
  fail "$hit - merge conflict marker"
done < <(git grep -InE '^(<{7} |\|{7} |>{7} |={7}$)' -- . ':(exclude)node_modules' ':(exclude)**/node_modules/**' | cut -d: -f1,2)

if [[ $violations -gt 0 ]]; then
  echo "$violations convention violation(s)"
  exit 1
fi
echo "Conventions hold (${#sim_files[@]} sim files, ${#app_files[@]} worker and app files checked)."
