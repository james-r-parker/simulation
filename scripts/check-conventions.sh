#!/usr/bin/env bash
# Repository conventions that the linters do not enforce. Called by scripts/check.sh as the "conventions" gate; prints
# one line per violation and exits 1 if there are any.
#
# - Dependency versions in package.json are exact pins (no ^, ~, *, x, ranges or tags); package-lock.json exists.
# - The headless sim (js/sim/, js/evo/) never touches the DOM, three, navigator, Math.random, Date.now or
#   performance.now: runs must replay from seed and config (docs/designs/STYLE.md, Tests and diagnostics).
# - Every module under js/sim/ and js/evo/ has a test at the mirrored path: js/sim/brain.js -> test/sim/brain.test.js.
# - Legacy code only shrinks: each js/*.js and js/constants/*.js file stays within its line count in
#   legacyLines in scripts/quality-baseline.json, and no new file appears there - new code goes in a linted module (AGENTS.md,
#   Coding standards). Lower a budget when a file shrinks; remove the entry when the file is deleted.
# - One source per served worker: a file in public/ has no same-named copy under js/.
# - No tracked file over 5 MB unless it is listed in LARGE_FILE_ALLOWLIST.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# preview.mp4 predates this gate; moving it to a release asset is a separate change.
LARGE_FILE_ALLOWLIST=("preview.mp4")
LARGE_FILE_BYTES=$((5 * 1024 * 1024))

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

while IFS= read -r line; do
  fail "$line"
done < <(node -e '
const fs = require("fs");
const { execSync } = require("child_process");
const budget = JSON.parse(fs.readFileSync("scripts/quality-baseline.json", "utf8")).legacyLines;
const files = execSync("git ls-files --cached --others --exclude-standard -- \":(glob)js/*.js\" \":(glob)js/constants/*.js\"")
  .toString().split("\n").filter((f) => f && fs.existsSync(f));
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  if (!(file in budget)) {
    console.log(`${file}: new file in the legacy area - put new code in a linted module (js/sim, js/evo)`);
  } else if (lines > budget[file]) {
    console.log(`${file}: ${lines} lines, over its legacy budget of ${budget[file]} - legacy files only shrink`);
  }
}
for (const file of Object.keys(budget)) {
  if (!files.includes(file)) console.log(`${file}: no longer exists - remove its entry from scripts/quality-baseline.json legacyLines`);
}')

if [[ -d public ]]; then
  while IFS= read -r served; do
    name="$(basename "$served")"
    while IFS= read -r copy; do
      fail "$copy: duplicate of $served - the served copy in public/ is the only source"
    done < <(git ls-files --cached --others --exclude-standard -- "js/$name" "js/**/$name")
  done < <(git ls-files --cached --others --exclude-standard -- 'public/*.js')
fi

while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  size=$(stat -c %s "$file")
  if [[ $size -gt $LARGE_FILE_BYTES ]] && [[ ! " ${LARGE_FILE_ALLOWLIST[*]} " == *" $file "* ]]; then
    fail "$file: $((size / 1024 / 1024)) MB - tracked files stay under 5 MB (host large media elsewhere)"
  fi
done < <(git ls-files --cached --others --exclude-standard)

if [[ $violations -gt 0 ]]; then
  echo "$violations convention violation(s)"
  exit 1
fi
echo "Conventions hold (${#sim_files[@]} sim files checked)."
