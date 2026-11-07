#!/usr/bin/env bash
# Which check a change needs: prints "docs" when every changed path is Markdown that no build or test reads beyond
# the design-doc tests, else "full". CI runs `scripts/check.sh --docs` for "docs" and the whole gate for "full".
#
# Usage:
#   scripts/change-scope.sh <base-ref>     # the paths changed on HEAD since it left <base-ref> (git diff <base-ref>...HEAD)
#   git diff --name-only | scripts/change-scope.sh     # the paths on stdin, one per line
#   scripts/change-scope.sh --browser [<base-ref>]     # the same input; prints "browser" or "none" (see below)
#
# <base-ref> is any ref or sha: `origin/main` on a pull request, the merge group's `base_sha` in the merge queue.
#
# Docs-only paths: Markdown under docs/ (design docs, linted by scripts/designs-index.mjs and the design-doc tests
# that --docs runs), under .claude/ (Claude Code skills, read by no code or test) and at the repo root (README.md,
# AGENTS.md, CLAUDE.md, read by no test). Everything else is "full", Markdown included: js/**/*.README.md sits beside
# the code it describes and is removed with it. An empty change is "full" too.
#
# --browser: whether the change can alter what the browser smoke test sees. Prints "browser" when any path is under
# js/ (app, worker, sim and evo are all bundled into the page), wasm/, public/, css/, library/ or test/browser/, or is
# index.html, manifest.json, vite.config.js, playwright.config.js, package.json, package-lock.json, .node-version,
# scripts/browser-smoke.sh or .github/workflows/check.yml; else "none". An empty change is "browser".
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

mode=docs
if [[ "${1:-}" == --browser ]]; then
  mode=browser
  shift
fi
case "${1:-}" in
  -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
esac
[[ $# -le 1 ]] || { echo "usage: scripts/change-scope.sh [--browser] [<base-ref>]" >&2; exit 2; }

if [[ $# -eq 1 ]]; then
  # --no-renames lists both sides of a move, so moving a file out of src/ into docs/ still counts src/.
  paths="$(git diff --name-only --no-renames "$1...HEAD")"
else
  paths="$(cat)"
fi

browser_path() {
  case "$1" in
    js/* | wasm/* | public/* | css/* | library/* | test/browser/*) return 0 ;;
    index.html | manifest.json | vite.config.js | playwright.config.js | package.json | package-lock.json) return 0 ;;
    .node-version | scripts/browser-smoke.sh | .github/workflows/check.yml) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ $mode == browser ]]; then
  count=0
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    count=$((count + 1))
    if browser_path "$path"; then
      echo "browser: $path can change the built app" >&2
      echo browser
      exit 0
    fi
  done <<<"$paths"
  if [[ $count -eq 0 ]]; then
    echo "browser: no changed paths" >&2
    echo browser
    exit 0
  fi
  echo "none: no path the browser smoke reads" >&2
  echo none
  exit 0
fi

docs_only() {
  case "$1" in
    docs/*.md | .claude/*.md) return 0 ;;
    */*) return 1 ;;
    *.md) return 0 ;;
    *) return 1 ;;
  esac
}

count=0
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  count=$((count + 1))
  if ! docs_only "$path"; then
    echo "full: $path is not docs-only" >&2
    echo full
    exit 0
  fi
done <<<"$paths"

if [[ $count -eq 0 ]]; then
  echo "full: no changed paths" >&2
  echo full
  exit 0
fi
echo "docs: $count Markdown path(s), all docs-only" >&2
echo docs
