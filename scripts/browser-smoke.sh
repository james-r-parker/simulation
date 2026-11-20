#!/usr/bin/env bash
# Browser smoke: builds the app into a temp dir, serves it with `vite preview` and runs every test/browser/*.spec.js.
# Runs in the official Playwright image (directly when already inside it, else through Docker).
#
# Exit codes: 0 passed, 1 failed, 3 skipped (no Docker, and SMOKE_LOCAL unset) - scripts/check.sh maps 3 to
# `skipped`, or to a failure under --ci.
#
# A spec that fails reruns once: a pass on the rerun passes the gate and is listed in .checklogs/smoke-flakes.json (CI
# uploads it as the `smoke-flakes` artifact); a spec that fails twice fails the gate.
#
# SMOKE_LOCAL=1 runs Playwright directly with the locally installed Chromium (npx playwright install chromium),
# for machines without Docker. The browser build can differ from the pinned image, so CI never sets it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly SKIP=3

tmp=""
server_pid=""
cleanup() {
  [[ -z "$server_pid" ]] || kill "$server_pid" 2>/dev/null || true
  [[ -z "$tmp" ]] || rm -rf "$tmp"
}

run_here() {
  local port status=0
  tmp="$(mktemp -d)"
  trap cleanup EXIT
  node_modules/.bin/vite build --outDir "$tmp/dist" --emptyOutDir --logLevel warn
  port="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
  BROWSER=none node_modules/.bin/vite preview --outDir "$tmp/dist" --port "$port" --strictPort --host 127.0.0.1 --open false >"$tmp/preview.log" 2>&1 &
  server_pid=$!
  local ready=0 i
  for i in $(seq 1 100); do
    if curl -fs "http://127.0.0.1:$port/" >/dev/null 2>&1; then ready=1; break; fi
    kill -0 "$server_pid" 2>/dev/null || break
    sleep 0.1
  done
  if [[ $ready -ne 1 ]]; then
    echo "vite preview did not start on port $port:" >&2
    cat "$tmp/preview.log" >&2
    return 1
  fi
  # A failed test reruns once (playwright.config.js); a pass on the rerun is a flake, written to
  # .checklogs/smoke-flakes.json and passed. Two failures fail the run.
  mkdir -p .checklogs
  rm -f .checklogs/smoke-flakes.json .checklogs/playwright-report.json
  SMOKE_URL="http://127.0.0.1:$port/" node_modules/.bin/playwright test -c playwright.config.js || status=$?
  node scripts/lib/smoke-flakes.mjs report .checklogs/playwright-report.json .checklogs/smoke-flakes.json || true
  [[ $status -ne 0 ]] || rm -f .checklogs/playwright-report.json
  return "$status"
}

if [[ "${PLAYWRIGHT_BROWSERS_PATH:-}" == "/ms-playwright" || "${SMOKE_LOCAL:-}" == "1" ]]; then
  run_here
  exit $?
fi

if docker info >/dev/null 2>&1; then
  version="$(node -p 'require("./package.json").devDependencies["@playwright/test"]')"
  exec docker run --rm --ipc=host --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work \
    "mcr.microsoft.com/playwright:v${version}-noble" scripts/browser-smoke.sh
fi

echo "browser-smoke: Docker is not available; the smoke runs in mcr.microsoft.com/playwright (set SMOKE_LOCAL=1 to use the local Chromium)" >&2
exit "$SKIP"
