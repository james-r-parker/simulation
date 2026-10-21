# Quality gates and test tiers

**Status:** In progress - tiered `scripts/check.sh` with the pre-commit hook, `deps`, `dupes`, the coverage ratchet and shuffled tests (Phase 1); mutation testing, the browser smoke test, benchmark comparison and the nightly workflow (Phase 2) are built; Phase 3 adds the CI `perf` job, the built-in CPU lock, a load-aware `bench-check`, a diagnosable nightly and a liveness-only browser smoke.
**Validated:** 23eaea3 (2026-10-17)
**Priority:** 2 - Phase 3 (PR perf job, CPU lock in check.sh, busy-aware bench-check) protects every other lane while several agents share the machine (manager, 2026-10-17)
**Depends on:** [dev-workflow-and-gate.md](dev-workflow-and-gate.md)

`scripts/check.sh` runs in three tiers. Each tier is a fixed set of gates, and a higher tier runs every gate of the
tier below it.

| Tier | Runs                         | Purpose                                                | Budget                         |
| ---- | ---------------------------- | ------------------------------------------------------ | ------------------------------ |
| 1    | The pre-commit hook          | Format, lint and tests for the staged files            | Under 10 s on the dev machine  |
| 2    | Every PR in CI; the default  | The full gate, plus layering, duplication and coverage | The CI job's 15-minute timeout |
| 3    | Nightly in CI, and on demand | Mutation testing and main-vs-branch benchmarks         | 60 minutes                     |

Tier 2 runs the whole test suite when run locally. In CI (`--ci`) the `test` gate runs only the fast tests, so the
`check` job stays quick on a small runner; see [Fast tests in CI](#fast-tests-in-ci).

## Tiers

| Gate            | Tier | Runs                                                                                                        |
| --------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `conventions`   | 1    | `scripts/check-conventions.sh`                                                                              |
| `format`        | 1    | `prettier --check`; tier 1 passes the staged files with `--ignore-unknown`                                  |
| `lint`          | 1    | `eslint --max-warnings 0`; tier 1 passes the staged `.js`, `.mjs` and `.cjs` files with `--no-warn-ignored` |
| `test-related`  | 1    | `vitest related --run` over the staged `.js` and `.mjs` files                                               |
| `designs-index` | 2    | `node scripts/designs-index.mjs --check`                                                                    |
| `typecheck`     | 2    | `tsc -p tsconfig.json`                                                                                      |
| `deps`          | 2    | `depcruise` with `.dependency-cruiser.cjs`                                                                  |
| `dupes`         | 2    | `jscpd` with `.jscpd.json`                                                                                  |
| `test`          | 2    | `vitest run --coverage --sequence.shuffle --sequence.seed=<seed>`                                           |
| `ratchet`       | 2    | `node scripts/quality-ratchet.mjs --check`                                                                  |
| `build`         | 2    | `vite build` into a temporary directory                                                                     |
| `browser-smoke` | 2    | `scripts/browser-smoke.sh` (Phase 2)                                                                        |
| `mutation`      | 3    | `stryker run`, then `node scripts/quality-ratchet.mjs --check --mutation` (Phase 2)                         |
| `bench-compare` | 3    | `node scripts/bench-compare.mjs` (Phase 2)                                                                  |

- `--tier <n>` selects a tier; no `--tier` means tier 2. `--tier` combined with `--only` or `--docs` exits 2.
- `--list` prints the gates the other flags select, one per line, and runs nothing.
- `--docs`, `--only=` and the `docs-tests` gate keep their meaning. `docs-tests` belongs to no tier and runs only
  when `--docs` or `--only` names it.
- A gate named in a tier but not yet built, or whose inputs do not exist, reports `skipped`. `test-related` reports
  `skipped` in tiers 2 and 3, which run the full `test` gate, and `ratchet` reports `skipped` unless a passing `test`
  gate ran in the same run.
- A `TEST_SEED` that is not a non-negative integer exits 2.
- `--ci` runs the fast tests in the `test` gate and skips `ratchet`; `--full` (with `--ci`) keeps every test and the
  ratchet. Without `--ci`, every run is full.
- [headless-sim-core.md](headless-sim-core.md) adds `bench-check` and [evolution-evals.md](evolution-evals.md) adds `eval-smoke` to tier 2;
  [improvement-loop.md](improvement-loop.md) adds the `nightly-eval` and `history` jobs beside tier 3 in `nightly.yml`.

## Layering and duplication

`.dependency-cruiser.cjs` holds these rules; any violation fails `deps`:

| Rule                | Forbids                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `sim-standalone`    | A module in `js/sim/` importing anything outside `js/sim/`                                             |
| `evo-only-sim`      | A module in `js/evo/` importing anything outside `js/evo/` and `js/sim/`                               |
| `no-circular`       | An import cycle among modules in `js/sim/`, `js/evo/`, `scripts/` and `test/`                          |
| `no-unresolvable`   | An import in `js/sim/`, `js/evo/`, `scripts/` or `test/` that resolves to no file or installed package |
| `no-dev-in-runtime` | A module in `js/sim/` or `js/evo/` importing a `devDependencies` package                               |

- The legacy `js/*.js` and `js/constants/*.js` files are outside every rule; [worker-and-renderer.md](worker-and-renderer.md) deletes them.
- `test/fixtures/` is excluded from the `deps` run, and from ESLint, `tsc` and Prettier.
- `test/dependency-rules.test.js` runs dependency-cruiser's `cruise` API over `test/fixtures/deps/` with that
  directory as `baseDir` and the rules from `.dependency-cruiser.cjs`.

`.jscpd.json` scans `js/sim/`, `js/evo/` and `scripts/` with `minTokens` 50 and `threshold` 0: any clone of 50 tokens
or more fails `dupes`. Tests and the legacy files are not scanned.

## Ratchet

`scripts/quality-baseline.json` holds the quality numbers that may only improve:

| Key           | Holds                                                                                      | Checked by    |
| ------------- | ------------------------------------------------------------------------------------------ | ------------- |
| `coverage`    | Per scope (`js/sim`, `js/evo`, `scripts`): lines, branches, functions and statements, in % | `ratchet`     |
| `floors`      | `js/sim` and `js/evo`: lines 90, branches 85                                               | `ratchet`     |
| `mutation`    | Per scope (`js/sim`, `js/evo`): Stryker mutation score, in %                               | `mutation`    |
| `legacyLines` | Each legacy `js/*.js` and `js/constants/*.js` file and its line budget                     | `conventions` |

Coverage comes from `@vitest/coverage-v8`, pinned to the `vitest` version. `vitest.config.js` sets
`coverage.provider: 'v8'`, `coverage.reporter: ['text-summary', 'json-summary']` and
`coverage.include: ['js/sim/**', 'js/evo/**', 'scripts/**/*.{js,mjs}']`, so an untested file counts as uncovered.
Only the `test` gate passes `--coverage`; `test-related` and `docs-tests` run uninstrumented.

`scripts/quality-ratchet.mjs` exports `compareScopes` and `raiseBaseline`; its CLI reads
`coverage/coverage-summary.json` (and, with `--mutation`, `reports/mutation/mutation.json`):

- A scope's metric is the sum of covered over the sum of total across its files, not an average of percentages.
- A metric more than 0.1 percentage points below its baseline fails, naming the scope, metric, baseline and measured
  value.
- A scope under `floors` fails when it has code and a metric is below its floor. A scope with no code is skipped.
- A missing or unreadable summary fails with the path it expected.
- `--write` raises each baseline to the measured value and never lowers one.

Under `--fix`, `scripts/check.sh` applies Prettier and regenerates the index first, as before, then runs
`quality-ratchet.mjs --write` straight after a passing `test` gate. When `test` fails or is not selected, the write
is skipped.

## Fast tests in CI

Tests that run real worlds for many ticks, a worker pool, a full eval, a bench or a child process are slow: on a
two-core runner with coverage they made the `test` gate take about 285 s. They live in `*.slow.test.js` files:

- A module with both kinds keeps its fast cases in the mirrored `<module>.test.js` that `conventions` requires, and
  its slow cases, moved unchanged, in `<module>.slow.test.js` beside it (`test/eval-runner.slow.test.js`,
  `test/replay.slow.test.js`, `test/league.slow.test.js`, `test/bench.slow.test.js`, `test/bench-policy.slow.test.js`,
  `test/otel.slow.test.js`, `test/evo/policies/map-elites-v1.slow.test.js` and `natural-v1.slow.test.js`).
- A suite with no single mirrored module is slow as a whole: `test/sim/golden.slow.test.js`,
  `test/sim/step-alloc.slow.test.js` and `test/evo/anti-exploit.slow.test.js`. The exception is
  `test/sim/golden.test.js`: the `shortCases` of `test/sim/golden.json` (the same worlds cut to 300 ticks, with their own
  pinned hashes) run in the fast tier, so every PR checks bit-exact determinism.
- New slow tests go in a `.slow.test.js` file; a test that takes more than about half a second on the dev machine is
  a candidate. The fast tests still cover every module's behaviour at unit level.

`vitest.config.js` reads `TEST_SCOPE`. Unset, `npx vitest run` and `npm test` run every file. `TEST_SCOPE=fast` adds
`**/*.slow.test.js` to `exclude`. `scripts/check.sh --ci` sets it for the `test` gate, drops `--coverage` (the fast
subset's coverage is not comparable to the baselines) and labels the gate `test (fast, seed <n>)`. The `ratchet` gate
then reports `skipped (coverage is measured on the full suite locally and in the nightly run)`, and `--fix` does not
write baselines after a fast run.

Every other run is full: `scripts/check.sh` locally (the `create-pr` skill runs `scripts/check.sh --fix` before every
push, so the whole suite and the ratchet pass before each PR), and the nightly workflow, which passes `--ci --full`.
A slow test that breaks therefore shows up in the pre-push check or the next nightly run, not in the PR's CI job.

## Test order

When `TEST_SEED` is unset, the `test` gate draws a random seed and passes it to Vitest. The gate line and
`.checklogs/test.log` print it: `test (seed 48213)`. `TEST_SEED=48213 scripts/check.sh --only=test` replays the same
order.

## Pre-commit hook

- `.githooks/pre-commit` runs `scripts/check.sh --tier 1 --quiet` and exits with its status. It never passes `--fix`.
- The `prepare` script in `package.json` runs `git config core.hooksPath .githooks` inside a git checkout and does
  nothing elsewhere.
- Tier 1 takes the staged paths from `git diff --cached --name-only --diff-filter=ACMR` and checks their working-tree
  contents, so unstaged edits to a staged file are checked too. A gate with no staged file it reads reports `skipped`.
- `scripts/check.sh --tier 1 --fix` applies Prettier to the staged paths and does not re-stage them.

## Decisions

| Decision                                                                                                                                                                                            | Reason                                                                                                                                                           | By                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| A PR `perf` job runs `bench-compare` on `js/sim`, `js/evo`, `js/worker` and `bench` changes; advisory for two weeks, then required at `max(5%, 3 x noise)`                                          | The absolute `bench-check` baseline is machine-specific, local only and fails on `main` under load; alternating base and head on one runner cancels runner speed | Specialist review |
| `scripts/check.sh` takes the CPU lock itself for the heavy gates                                                                                                                                    | The lock lives only in agent rules in `/tmp`; `check.sh`, `bench.mjs` and `eval.mjs` take none, so a forgotten wrapper skews timings                             | Specialist review |
| Local `bench-check` reports `skipped` on a busy machine                                                                                                                                             | A measurement under load fails the gate with no code change (`bench.step_ms@500` 4.50 ms at 04:00 against 4.67 to 4.80 ms later the same day)                    | Specialist review |
| The nightly prints a readable `bench-compare` digest and opens one `nightly-failure` issue                                                                                                          | The failed 2026-10-17 nightly could not be diagnosed: its digest was `npm warn ERESOLVE` noise and no issue named the run                                        | Specialist review |
| Coverage runs use `testTimeout` 20000 ms                                                                                                                                                            | Under coverage the sim tests run about 7 times slower and `host-world.test.js` timed out at 5 s in the nightly                                                   | Specialist review |
| The browser smoke asserts liveness (at least 5 frames and the tick advancing in 5 s), not speed                                                                                                     | A software-GL runner cannot hold 30 frames in 5 s (PR 43 failed on speed, not breakage); frame-rate budgets stay in `perf:browser` on the GPU machine            | Specialist review |
| The `check-tiers` flake, the conflict-marker `conventions` rule, the nightly hidden-file upload, `.node-version`, the Playwright image-tag test and a fast golden test land on `chore/ci-hardening` | Another agent owns them; this doc does not repeat them                                                                                                           | Manager           |
| `main` is protected by a ruleset and `check.yml` cancels in-progress runs for pull requests only                                                                                                    | Every `main` commit needs a verdict; see [deployment-and-community.md](deployment-and-community.md) T33                                                          | User              |
| The coverage ratchet runs on every PR in CI                                                                                                                                                         | On 2026-10-17 PRs 56 and 57 merged green while main's `scripts` coverage fell below its baseline, because CI skipped `ratchet`                                   | User              |
| Function microbenchmarks with Vitest `bench`, as a tool beside the `bench-compare` gate                                                                                                             | Judging the `circleHit` rewrite took two 6-minute whole-step runs and still sat near the noise; a per-function compare shows a 1% change in seconds              | User              |

## Phases

### Phase 1 - Static gates, ratchet and tiers (built)

**Targets:** none - test and gate tooling; no simulation behaviour changes

- `--tier`, `--list` and every Phase 1 and Phase 2 gate name in `scripts/check.sh`; each unbuilt gate reports
  `skipped`.
- The `deps`, `dupes`, `test-related` and `ratchet` gates, and coverage in the `test` gate.
- `scripts/quality-baseline.json` with `scripts/quality-ratchet.mjs`; `scripts/check-conventions.sh` reads
  `legacyLines` from it, and `scripts/legacy-size-budget.json` is deleted.
- Shuffled test order with a printed seed.
- `.githooks/pre-commit` and the `prepare` script.

### Phase 2 - Mutation, browser smoke and benchmark comparison (built)

**Targets:** none - test and gate tooling; `bench-compare` reads `bench.*` metrics but moves none

This phase is built after [headless-sim-core.md](headless-sim-core.md) Phase 2, which adds the `js/sim` modules Stryker mutates and the
`npm run bench` that `bench-compare` runs.

- **Mutation.** `stryker.config.json` uses `@stryker-mutator/vitest-runner`, mutates `js/sim/**/*.js` and
  `js/evo/**/*.js`, and sets `reporters` to `clear-text` and `json`, writing `reports/mutation/mutation.json`. The
  `mutation` gate fails when a scope's score drops more than 0.1 points below its `mutation` baseline. Its digest
  lists the surviving mutants by file, line and mutator. Stryker runs the tests through `vitest.stryker.config.js`,
  which leaves out the golden runs and the allocation check. The score is detected over detected plus undetected
  (`scripts/lib/mutation-score.mjs`). Stryker's vitest-runner 10 kills no mutant under Vitest 5, so the gate reports
  `skipped` while `STRYKER_MAX_VITEST` in `scripts/check.sh` is at or below the installed Vitest major; see
  [sim-notes.md](sim-notes.md).
- **Browser smoke.** `test/browser/smoke.spec.js` (Playwright, reusing the `@playwright/test` pin from
  [dev-workflow-and-gate.md](dev-workflow-and-gate.md) Phase 2) runs against `vite preview` of a `vite build` into a temporary directory that
  `scripts/browser-smoke.sh` creates and removes. It asserts:
    - the page loads and `#canvas-container canvas` exists;
    - at least 30 frames, counted by a `requestAnimationFrame` loop in `page.evaluate`, advance in 5 s;
    - no `pageerror` fires;
    - every `console.error` matches a pattern in `test/browser/known-console-errors.json`.

    The allowlist starts with the two messages the legacy `gameLoop` logs every frame without WebGPU
    (`GPU ray tracing failed`, `GPU Neural Network processing failed`); [worker-and-renderer.md](worker-and-renderer.md) empties it. On failure
    the gate saves `.checklogs/browser-smoke.png`.

- **Where the smoke runs.** Inside the image `mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` is
  the exact `@playwright/test` pin. `scripts/browser-smoke.sh` runs Playwright directly when it is already in that
  image (`PLAYWRIGHT_BROWSERS_PATH` is `/ms-playwright`). Otherwise it runs the image with Docker, mounting the repo
  at `/work` with its `node_modules`. Without Docker it reports `skipped` (the script exits 3), and under `--ci` it
  fails. `SMOKE_LOCAL=1` runs Playwright directly with the locally installed Chromium, for a machine without Docker;
  CI never sets it. The allowlist is `{ "patterns": [...] }`, and Playwright's output goes to `.checklogs/playwright`.
- **CI.** `.github/workflows/check.yml` gains a second job, `browser-smoke`, with `container:` set to that image. It
  runs `scripts/check.sh --ci --only=browser-smoke` on every change that is not docs-only, and the `check` job skips the gate.
- **Benchmark comparison.** `scripts/bench-compare.mjs --base <ref>`:
    - checks the base out with `git worktree add` into a directory under `os.tmpdir()`, runs
      `npm ci --ignore-scripts` there, and removes the worktree on exit, including on failure;
    - runs `npm run bench -- --json --sizes=500` five times in each tree, alternating (`--sizes=` and `--runs=`
      override; a run takes about 6 minutes);
    - compares the median of every `bench.*` metric and fails when the head median exceeds the base median by more
      than 10%.

    The base defaults to the merge-base with `origin/main`. On `main` it is the last `origin/main` commit more than
    25 hours old. A base equal to `HEAD`, or one without a `bench` script, reports `skipped` (exit 3); the gate asks
    first with `--skip-check`.

- **Nightly.** `.github/workflows/nightly.yml` runs at 03:00 UTC and on `workflow_dispatch` with a `ref` input. Its
  job, `nightly`, runs on `ubuntu-latest` with `timeout-minutes: 60`, checks out with `fetch-depth: 0`, installs
  the Node version in `.node-version` through `actions/setup-node`, runs `scripts/check.sh --ci --full --tier 3` (every test and the ratchet), and uploads `.checklogs/`, `reports/`
  and `TestResults/` as the `nightly-reports` artifact (`include-hidden-files: true`, or `.checklogs/` is dropped). Before the gate it installs Playwright's Chromium, and after it runs `npm run browser:hash` (the golden hashes in a Chromium
  worker, which needs no GPU) even when the gate failed.

### Phase 3 - CI perf job, CPU lock and run hygiene

**Targets:** none - gate tooling; the `perf` job reads `bench.*` metrics but moves none

- **`perf` job.** `check.yml` gains a third job, `perf`, on `pull_request` only. It always runs and always reports, so it
  can become a required check:
    - `scripts/perf-scope.sh origin/<base>` (new) prints `perf` when the PR changes a path under `js/sim/`, `js/evo/`,
      `js/worker/` or `bench/`, and `none` otherwise; on `none` the job's remaining steps are skipped and it passes.
    - On `perf`: `node scripts/bench-compare.mjs --sizes=500 --runs=5 --threshold <fraction>` (alternating base and head
      on one runner, so the runner's speed cancels; about 6 to 8 minutes). `--threshold` (new, default `0.10`) replaces the
      fixed 10% fail line. The table goes to `$GITHUB_STEP_SUMMARY`.
    - `--self` (new) benches `HEAD` against a second checkout of itself, so a run measures only noise; a
      `workflow_dispatch` input `noise` runs it.
    - The job is `continue-on-error: true` for two weeks after it merges. T18 then records the largest `--self` spread
      seen in [sim-notes.md](sim-notes.md), sets `--threshold` to `max(0.05, 3 x spread)`, removes
      `continue-on-error` and adds `perf` to the `main` ruleset's required checks.
- **Function microbenchmarks (user, 2026-10-21).** `bench/micro/<module>.bench.js` files run with Vitest's built-in
  `bench` mode (tinybench, already part of the pinned Vitest; no new dependency), one per hot module: `circleHit` and
  `castRays` (`js/sim/ray-march.js`), `detTanhInto` (`js/sim/det-math.js`), `forwardAll` (`js/sim/brain.js`),
  `summariseRays` (`js/evo/ray-summary.js`) and the spatial-hash query (`js/sim/spatial-hash.js`). Each runs on fixed,
  seeded inputs built once (`createRng` streams or a recorded world), never on `Math.random`. `npm run bench:micro`
  runs them; `-- --compare <ref>` (new `scripts/bench-micro.mjs`) runs the same files on a detached worktree of
  `<ref>` and on `HEAD`, alternating, and prints ops/s and the change per function with its relative margin of error.
  It is a tool, not a gate: micro numbers depend on the machine. The `create-pr` skill asks for its table on any
  `perf(...)` commit or change to a listed function, and whole-step `bench-compare` stays the gate.
- **CPU lock.** `scripts/lib/cpu-lock.sh` (new, sourced by `check.sh`) defines `with_cpu_lock <command...>`, which runs
  the command under `flock -w 3600 "${CHECK_CPU_LOCK:-${XDG_RUNTIME_DIR:-/tmp}/blob-evolution-cpu.lock}"`. `check.sh`
  wraps the `test`, `bench-check`, `eval-smoke`, `bench-compare` and `browser-smoke` gates in it. `with_cpu_lock` exports
  `CHECK_CPU_LOCK_HELD=1` to the command and runs the command directly when it is already set, so a caller that holds the
  same lock around the whole run does not wait on itself. `CHECK_CPU_LOCK=off` and `--ci` take no lock.
- **Busy machine.** `gate_bench_check` reads the one-minute load average (`/proc/loadavg`, or the file named by
  `CHECK_LOADAVG_FILE`) and reports `skipped (load avg <x> > nproc/8)` when it exceeds `nproc / 8`, instead of running.
- **Nightly diagnosis.** `withWorktree` in `scripts/bench-compare.mjs` runs `npm ci --ignore-scripts --loglevel=error`. The
  `bench-compare` digest in `check.sh` prints only the `base ... head ...` line and the table. `nightly.yml` gains a final
  `if: failure()` job (`issues: write`) that opens, or comments on, one open issue labelled `nightly-failure` with the
  failed gates and the run URL. The `resume-plan` skill lists open `nightly-failure` issues first.
- **Coverage timeout.** `testTimeoutFor(argv)` in `scripts/lib/test-timeout.mjs` (new) returns 20000 when `argv`
  includes `--coverage` and Vitest's default 5000 otherwise; `vitest.config.js` sets `test.testTimeout` from it.
- **Browser smoke liveness.** `test/browser/smoke.spec.js` asserts at least 5 frames in 5 s (`MIN_FRAMES` 5; replacing
  Phase 2's 30) and that the sim tick advances: `globalThis.__blob.tick()` (new, installed by `js/app/main.js` and the
  legacy loop, returning the latest snapshot tick or `Simulation.frameCount`) differs between the start and the end of the
  window. `playwright.config.js` sets `trace: 'retain-on-failure'` and `screenshot: 'only-on-failure'`. Frame-rate budgets
  stay in `npm run perf:browser` on the GPU machine.
- Not repeated here: the `check-tiers` timeout, the conflict-marker rule, the nightly hidden-file upload, `.node-version`,
  the Playwright image-tag test and the fast golden test (branch `chore/ci-hardening`); the `check.yml` `season/next`
  trigger and `cancel-in-progress` expression ([deployment-and-community.md](deployment-and-community.md) T33).

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Tooling only; nothing in `js/sim`, `js/evo`, the worker, the renderer or the UI. Phase 1: `scripts/check.sh` (`--tier`, `--list`, gates `test-related`, `deps`, `dupes`, `ratchet`), `scripts/quality-ratchet.mjs` (`compareScopes`, `raiseBaseline`), `scripts/quality-baseline.json` (replaces `scripts/legacy-size-budget.json`), `.dependency-cruiser.cjs`, `.jscpd.json`, `vitest.config.js` (coverage), `eslint.config.js`, `tsconfig.json` and `.prettierignore` (exclude `test/fixtures/`), `.githooks/pre-commit`. Phase 2: `stryker.config.json`, `playwright.config.js`, `test/browser/smoke.spec.js`, `test/browser/known-console-errors.json`, `scripts/browser-smoke.sh`, `scripts/bench-compare.mjs`, the `browser-smoke` job in `.github/workflows/check.yml`, `.github/workflows/nightly.yml`. Phase 3: `scripts/perf-scope.sh`, `scripts/lib/cpu-lock.sh` (`with_cpu_lock`), `scripts/lib/test-timeout.mjs` (`testTimeoutFor`), `--threshold` and `--self` in `scripts/bench-compare.mjs`, the `perf` job in `.github/workflows/check.yml`, the `nightly-failure` job in `nightly.yml`, `globalThis.__blob.tick` in `js/app/main.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unit tests              | Phase 1: `test/quality-ratchet.test.js` (imports `compareScopes` and `raiseBaseline`) - a drop past the tolerance fails, a rise passes, scope totals are summed not averaged, a floor fails only when the scope has code, `raiseBaseline` never lowers, a missing summary names its path. `test/check-tiers.test.js` - `--list` prints each tier's gates, tier 3 includes every tier 2 gate, `--tier` with `--only` exits 2, an unknown tier exits 2, `TEST_SEED` appears in the `test` gate line; in a temporary git repo, `--list --tier 1` with staged, modified-unstaged and deleted files selects only the staged ones. `test/dependency-rules.test.js` - fixtures under `test/fixtures/deps/` with a `js/sim` module importing legacy code, a `js/evo` module importing the UI, a `js/sim` module importing `three` and a cycle each fail with the rule name. Phase 2: `test/bench-compare.test.js` - recorded bench JSON at +9% passes, at +11% fails, an equal base and a base without `bench` are skipped; mutation-score cases in `test/quality-ratchet.test.js`. Phase 3: `test/perf-scope.test.js` (a `js/sim` path, a `bench` path and a mixed change give `perf`; docs, `scripts/` and `test/` give `none`). `test/bench-compare.test.js` gains `--threshold` (a 7% rise passes at 0.10 and fails at 0.05), `--self`, and the `npm ci` arguments. `test/cpu-lock.test.js` (a held lock makes `with_cpu_lock` wait; `CHECK_CPU_LOCK_HELD=1` and `CHECK_CPU_LOCK=off` run at once; the exit status passes through). `test/check-tiers.test.js` gains the busy-machine `skipped (load avg ...)` line from a fixture loadavg file and the `bench-compare` digest from a fixture log full of `npm warn ERESOLVE`. `test/test-timeout.test.js` (20000 with `--coverage`, 5000 without) |
| Headless e2e            | N/A - no simulation behaviour; the golden run belongs to [headless-sim-core.md](headless-sim-core.md) and `eval-smoke` to [evolution-evals.md](evolution-evals.md). Phase 3: `browser-smoke` still runs in CI and now fails on a page whose frame loop or tick has stopped, and passes on software GL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Performance budget      | Tier 1 finishes in under 10 s on the dev machine with ten staged files; the `check` job stays inside its 15-minute timeout; the `browser-smoke` job pulls the Playwright image (about 2 GB) and stays inside 15 minutes; tier 3 inside 60 minutes. `bench-compare` fails a head median more than 10% above the base median for any `bench.*` metric. Phase 3: the `perf` job finishes within 15 minutes; after the two advisory weeks it fails a head median more than `max(5%, 3 x noise)` above the base. A busy machine skips the local `bench-check` rather than failing it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Evolution metrics       | N/A - no change to agents, fitness or selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Determinism             | Test order is shuffled from a seed (`TEST_SEED`, else random) printed on the `test` gate line; the same seed replays the same order. No simulation RNG stream is used. Phase 3: `bench-compare --self` and the `perf` job measure time and are not replayable; no simulation RNG stream is used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Config and persistence  | N/A for `createConfig` and IndexedDB - no simulation config or schema changes. `scripts/quality-baseline.json` is a new committed file (keys in the Ratchet table). `package.json` gains the `prepare` script and exact-pinned devDependencies: `dependency-cruiser`, `jscpd`, `@vitest/coverage-v8` at the `vitest` version (Phase 1); `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` (Phase 2). `.gitignore` gains `reports/`. Phase 3: environment variables `CHECK_CPU_LOCK`, `CHECK_CPU_LOCK_HELD` and `CHECK_LOADAVG_FILE`; the label `nightly-failure`; the `main` ruleset gains `perf` as a required check at T18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Logging and diagnostics | No `simLog` events - tooling only. Each new gate writes `.checklogs/<gate>.log` and prints a digest: `deps` the rule, importer and import; `dupes` both clone locations; `ratchet` the scope, metric, baseline and measured value; `test` the seed; `mutation` surviving mutants by file, line and mutator; `browser-smoke` each unexpected console error and the screenshot path; `bench-compare` base median, head median and change per metric. Phase 3: the `perf` job writes the comparison table to `$GITHUB_STEP_SUMMARY`; a skipped `bench-check` prints the load average and the limit; a failed nightly opens an issue naming the gates and the run URL; a failed smoke keeps a Playwright trace and screenshot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Browser compatibility   | `browser-smoke` runs Chromium from the pinned Playwright image with WebGL; WebGPU is not assumed, and the legacy no-WebGPU errors are allowlisted. No other browser runs in CI. Phase 3: the smoke still runs Chromium only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Docs                    | `AGENTS.md` Commands table (`--tier`, `--list`, `TEST_SEED`, the hook) and the legacy-budget row of its size-limit table; [dev-workflow-and-gate.md](dev-workflow-and-gate.md) Gate, Flag and Conventions tables and its Architecture row; `docs/designs/sim-notes.md` learnings for dependency-cruiser, jscpd, Stryker with Vitest 5 and Playwright. This doc becomes `Implemented` when Phase 2 lands. Phase 3: `AGENTS.md` (the CPU lock variables, the `perf` job, the `nightly-failure` issue), [dev-workflow-and-gate.md](dev-workflow-and-gate.md) CI section, [sim-notes.md](sim-notes.md) (the `--self` noise and the hosted-runner bench time), the `resume-plan` skill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Verification            | `scripts/check.sh` green at tiers 1 and 2; the manual checks in Verification below. Phase 3: the steps 8 to 11 in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Task breakdown

Tasks that add a gate fill in a gate function that T2 (Phase 1) creates as a `skipped` stub, so they touch separate
parts of `scripts/check.sh`.

### Phase 1 - Static gates, ratchet and tiers

| #   | Task                                                                                                                                                               | Nature       | Depends on                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------------------------------- |
| T1  | Add exact-pinned `dependency-cruiser`, `jscpd` and `@vitest/coverage-v8`, the `prepare` script, and `reports/` in `.gitignore`                                     | [mechanical] | -                                  |
| T2  | Add `--tier`, `--list` and stub gate functions for every Phase 1 and Phase 2 gate to `scripts/check.sh`, with `test/check-tiers.test.js`                           | [judgement]  | -                                  |
| T3  | Fill in the `deps` gate: `.dependency-cruiser.cjs`, `test/fixtures/deps/` excluded from the other tools, and `test/dependency-rules.test.js`                       | [judgement]  | T1, T2                             |
| T4  | Fill in the `dupes` gate with `.jscpd.json`                                                                                                                        | [mechanical] | T1, T2                             |
| T5  | Move the legacy budget into `scripts/quality-baseline.json` under `legacyLines`; `scripts/check-conventions.sh` reads it; delete `scripts/legacy-size-budget.json` | [mechanical] | -                                  |
| T6  | Add coverage to `vitest.config.js` and the `test` gate, `scripts/quality-ratchet.mjs`, the `ratchet` gate, the `--fix` write, and `test/quality-ratchet.test.js`   | [judgement]  | T1, T2, T5                         |
| T7  | Shuffle the `test` gate's order from `TEST_SEED`, print the seed, and add its case to `test/check-tiers.test.js`                                                   | [mechanical] | T6                                 |
| T8  | Fill in tier 1: staged-file selection, the `test-related` gate, `.githooks/pre-commit`, and the staged-file cases in `test/check-tiers.test.js`                    | [judgement]  | T1, T2                             |
| T9  | Update `AGENTS.md` and the Gate, Flag and Conventions tables and Architecture row of [dev-workflow-and-gate.md](dev-workflow-and-gate.md)                          | [mechanical] | T3, T4, T5, T6, T7, T8             |
| T10 | Conformance review of Phase 1                                                                                                                                      | [judgement]  | T1, T2, T3, T4, T5, T6, T7, T8, T9 |

### Phase 2 - Mutation, browser smoke and benchmark comparison

| #   | Task                                                                                                                                                                    | Nature       | Depends on              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| T11 | Add exact-pinned Stryker, `stryker.config.json`, the `mutation` gate and mutation scores in the ratchet, with tests                                                     | [judgement]  | T10                     |
| T12 | Add `scripts/browser-smoke.sh`, `playwright.config.js`, `test/browser/smoke.spec.js`, `test/browser/known-console-errors.json`, the `browser-smoke` gate and its CI job | [judgement]  | T10                     |
| T13 | Add `scripts/bench-compare.mjs`, the `bench-compare` gate and `test/bench-compare.test.js`                                                                              | [judgement]  | T10                     |
| T14 | Add `.github/workflows/nightly.yml`                                                                                                                                     | [mechanical] | T11, T12, T13           |
| T15 | Update `AGENTS.md`, [dev-workflow-and-gate.md](dev-workflow-and-gate.md) and [sim-notes.md](sim-notes.md) for Phase 2                                                   | [mechanical] | T11, T12, T13, T14      |
| T16 | Conformance review of Phase 2                                                                                                                                           | [judgement]  | T11, T12, T13, T14, T15 |

### Phase 3 - CI perf job, CPU lock and run hygiene

| #   | Task                                                                                                                                                                                              | Nature       | Depends on                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------ |
| T17 | Add `scripts/perf-scope.sh`, `--threshold` and `--self` in `scripts/bench-compare.mjs`, the advisory `perf` job in `check.yml` and their tests                                                    | [judgement]  | T16                                              |
| T18 | After two weeks of runs: record the `--self` noise in `sim-notes.md`, set `--threshold` to `max(0.05, 3 x noise)`, drop `continue-on-error`, and ask the user to add `perf` to the `main` ruleset | [judgement]  | T17                                              |
| T19 | Add `scripts/lib/cpu-lock.sh`, wrap the five heavy gates in `with_cpu_lock`, and add `test/cpu-lock.test.js`                                                                                      | [judgement]  | T16                                              |
| T20 | Make `gate_bench_check` skip on a busy machine, with the fixture-based test                                                                                                                       | [mechanical] | T16                                              |
| T21 | Quiet the base worktree install, add the `bench-compare` digest case, the `nightly-failure` job and the `resume-plan` line, with tests                                                            | [mechanical] | T16                                              |
| T22 | Add `scripts/lib/test-timeout.mjs`, read it in `vitest.config.js`, and add `test/test-timeout.test.js`                                                                                            | [mechanical] | T16                                              |
| T23 | Change the browser smoke to liveness (5 frames, tick advancing), add `globalThis.__blob.tick` and the trace and screenshot settings                                                               | [judgement]  | T16                                              |
| T26 | Run the coverage `ratchet` on every PR in CI (the fast-tier coverage, or the full suite when the PR touches `js/` or `scripts/`), with a test that `--ci` includes it                             | [judgement]  | -                                                |
| T27 | Add `bench/micro/*.bench.js` for the six hot functions on seeded inputs, `npm run bench:micro`, `scripts/bench-micro.mjs --compare <ref>` with its tests, and the `create-pr` skill line          | [judgement]  | -                                                |
| T24 | Update `AGENTS.md`, [dev-workflow-and-gate.md](dev-workflow-and-gate.md) and [sim-notes.md](sim-notes.md) for Phase 3                                                                             | [mechanical] | T17, T19, T20, T21, T22, T23                     |
| T25 | Conformance review of Phase 3                                                                                                                                                                     | [judgement]  | T17, T18, T19, T20, T21, T22, T23, T24, T26, T27 |

## Verification

1. `scripts/check.sh --list --tier 1`, `--tier 2` and `--tier 3` print the gates in the Tiers table.
2. `scripts/check.sh` (tier 2) is green and prints `test (seed <n>)`; `TEST_SEED=<n>` runs the tests in the same
   order.
3. Adding `import '../agent.js'` to a `js/sim` module fails `deps` with `sim-standalone`; pasting a 60-token block
   twice into `scripts/` fails `dupes`.
4. Deleting a tested function's test lowers coverage and fails `ratchet`, naming the scope and metric;
   `scripts/check.sh --fix` after adding a test raises `scripts/quality-baseline.json` and never lowers it.
5. `npm ci` sets `core.hooksPath`; committing an unformatted staged file is rejected by the hook in under 10 s, and
   committing a staged legacy `js/*.js` file or a `.sh` file does not trip `lint` or `format`.
6. Phase 2: `scripts/check.sh --tier 3` runs `mutation` and `bench-compare`; a deliberate 20% slowdown in a benched
   function fails `bench-compare`; `browser-smoke` passes in the Playwright image and fails on an injected
   `console.error`.
7. Phase 2: `gh workflow run nightly.yml -f ref=<branch>` completes and uploads `nightly-reports`.
8. Phase 3: a PR that touches `js/sim/` runs the `perf` job and writes the base-against-head table to the run summary; a docs PR runs the job and it passes with its steps skipped. `gh workflow run check.yml -f noise=true` runs `--self`.
9. Phase 3: `flock /tmp/x.lock sleep 5 &` then `CHECK_CPU_LOCK=/tmp/x.lock scripts/check.sh --only=eval-smoke` waits for the lock; with `CHECK_CPU_LOCK_HELD=1` it does not. With a loadavg fixture above `nproc / 8`, `scripts/check.sh --only=bench-check` prints `skipped (load avg ...)`.
10. Phase 3: a nightly that fails opens one `nightly-failure` issue; its `bench-compare` digest shows the `base ... head ...` line and no `npm warn` lines.
11. Phase 3: `browser-smoke` passes under software GL and fails when the frame loop or the tick is stopped; a failure leaves `.checklogs/playwright` with a trace.
