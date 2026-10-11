# Quality gates and test tiers

**Status:** Proposed - Phase 1 adds the static gates, the coverage ratchet, the pre-commit hook and the tier flag before any sim code lands.
**Validated:** bd49bce (2026-10-11)
**Priority:** 2 - the static gates and the coverage ratchet must exist before the first `js/sim` module is written
**Depends on:** [dev-workflow-and-gate.md](dev-workflow-and-gate.md)

`scripts/check.sh` runs in three tiers. Each tier is a fixed set of gates, and a higher tier runs every gate of the
tier below it.

| Tier | Runs                         | Purpose                                                | Budget                         |
| ---- | ---------------------------- | ------------------------------------------------------ | ------------------------------ |
| 1    | The pre-commit hook          | Format, lint and tests for the staged files            | Under 10 s on the dev machine  |
| 2    | Every PR in CI; the default  | The full gate, plus layering, duplication and coverage | The CI job's 15-minute timeout |
| 3    | Nightly in CI, and on demand | Mutation testing and main-vs-branch benchmarks         | 60 minutes                     |

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
- A gate named in a tier but not yet built, or whose inputs do not exist, reports `skipped`.
- `headless-sim-core.md` adds `bench-check` and `evolution-evals.md` adds `eval-smoke` to tier 2;
  `improvement-loop.md` adds the nightly eval to tier 3.

## Layering and duplication

`.dependency-cruiser.cjs` holds these rules; any violation fails `deps`:

| Rule                | Forbids                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `sim-standalone`    | A module in `js/sim/` importing anything outside `js/sim/`                                             |
| `evo-only-sim`      | A module in `js/evo/` importing anything outside `js/evo/` and `js/sim/`                               |
| `no-circular`       | An import cycle among modules in `js/sim/`, `js/evo/`, `scripts/` and `test/`                          |
| `no-unresolvable`   | An import in `js/sim/`, `js/evo/`, `scripts/` or `test/` that resolves to no file or installed package |
| `no-dev-in-runtime` | A module in `js/sim/` or `js/evo/` importing a `devDependencies` package                               |

- The legacy `js/*.js` and `js/constants/*.js` files are outside every rule; `worker-and-renderer.md` deletes them.
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

## Phases

### Phase 1 - Static gates, ratchet and tiers

**Targets:** none - test and gate tooling; no simulation behaviour changes

- `--tier`, `--list` and every Phase 1 and Phase 2 gate name in `scripts/check.sh`; each unbuilt gate reports
  `skipped`.
- The `deps`, `dupes`, `test-related` and `ratchet` gates, and coverage in the `test` gate.
- `scripts/quality-baseline.json` with `scripts/quality-ratchet.mjs`; `scripts/check-conventions.sh` reads
  `legacyLines` from it, and `scripts/legacy-size-budget.json` is deleted.
- Shuffled test order with a printed seed.
- `.githooks/pre-commit` and the `prepare` script.

### Phase 2 - Mutation, browser smoke and benchmark comparison

**Targets:** none - test and gate tooling; `bench-compare` reads `bench.*` metrics but moves none

Phase 2 is built after `headless-sim-core.md` Phase 2, which adds the `js/sim` modules Stryker mutates and the
`npm run bench` that `bench-compare` runs.

- **Mutation.** `stryker.config.json` uses `@stryker-mutator/vitest-runner`, mutates `js/sim/**/*.js` and
  `js/evo/**/*.js`, and sets `reporters` to `clear-text` and `json`, writing `reports/mutation/mutation.json`. The
  `mutation` gate fails when a scope's score drops more than 0.1 points below its `mutation` baseline. Its digest
  lists the surviving mutants by file, line and mutator.
- **Browser smoke.** `test/browser/smoke.spec.js` (Playwright, reusing the `@playwright/test` pin from
  `dev-workflow-and-gate.md` Phase 2) runs against `vite preview` of a `vite build` into a temporary directory that
  `scripts/browser-smoke.sh` creates and removes. It asserts:
    - the page loads and `#canvas-container canvas` exists;
    - at least 30 frames, counted by a `requestAnimationFrame` loop in `page.evaluate`, advance in 5 s;
    - no `pageerror` fires;
    - every `console.error` matches a pattern in `test/browser/known-console-errors.json`.

    The allowlist starts with the two messages the legacy `gameLoop` logs every frame without WebGPU
    (`GPU ray tracing failed`, `GPU Neural Network processing failed`); `worker-and-renderer.md` empties it. On failure
    the gate saves `.checklogs/browser-smoke.png`.

- **Where the smoke runs.** Inside the image `mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` is
  the exact `@playwright/test` pin. `scripts/browser-smoke.sh` runs Playwright directly when it is already in that
  image (`PLAYWRIGHT_BROWSERS_PATH` is `/ms-playwright`). Otherwise it runs the image with Docker, mounting the repo
  at `/work` with its `node_modules`. Without Docker it reports `skipped`, and under `--ci` it fails.
- **CI.** `.github/workflows/check.yml` gains a second job, `browser-smoke`, with `container:` set to that image. It
  runs `scripts/check.sh --ci --only=browser-smoke` on `full`-scope changes, and the `check` job skips the gate.
- **Benchmark comparison.** `scripts/bench-compare.mjs --base <ref>`:
    - checks the base out with `git worktree add` into a directory under `os.tmpdir()`, runs
      `npm ci --ignore-scripts` there, and removes the worktree on exit, including on failure;
    - runs `npm run bench -- --json` five times in each tree, alternating;
    - compares the median of every `bench.*` metric and fails when the head median exceeds the base median by more
      than 10%.

    The base defaults to the merge-base with `origin/main`. On `main` it is the last `origin/main` commit more than
    25 hours old. A base equal to `HEAD`, or one without a `bench` script, reports `skipped`.

- **Nightly.** `.github/workflows/nightly.yml` runs at 03:00 UTC and on `workflow_dispatch` with a `ref` input. Its
  job, `nightly`, runs on `ubuntu-latest` with `timeout-minutes: 60`, checks out with `fetch-depth: 0`, installs
  Node 24 through `actions/setup-node`, runs `scripts/check.sh --ci --tier 3`, and uploads `.checklogs/`, `reports/`
  and `TestResults/` as the `nightly-reports` artifact.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Tooling only; nothing in `js/sim`, `js/evo`, the worker, the renderer or the UI. Phase 1: `scripts/check.sh` (`--tier`, `--list`, gates `test-related`, `deps`, `dupes`, `ratchet`), `scripts/quality-ratchet.mjs` (`compareScopes`, `raiseBaseline`), `scripts/quality-baseline.json` (replaces `scripts/legacy-size-budget.json`), `.dependency-cruiser.cjs`, `.jscpd.json`, `vitest.config.js` (coverage), `eslint.config.js`, `tsconfig.json` and `.prettierignore` (exclude `test/fixtures/`), `.githooks/pre-commit`. Phase 2: `stryker.config.json`, `playwright.config.js`, `test/browser/smoke.spec.js`, `test/browser/known-console-errors.json`, `scripts/browser-smoke.sh`, `scripts/bench-compare.mjs`, the `browser-smoke` job in `.github/workflows/check.yml`, `.github/workflows/nightly.yml`                                                                                                                                                                                                                                                             |
| Unit tests              | Phase 1: `test/quality-ratchet.test.js` (imports `compareScopes` and `raiseBaseline`) - a drop past the tolerance fails, a rise passes, scope totals are summed not averaged, a floor fails only when the scope has code, `raiseBaseline` never lowers, a missing summary names its path. `test/check-tiers.test.js` - `--list` prints each tier's gates, tier 3 includes every tier 2 gate, `--tier` with `--only` exits 2, an unknown tier exits 2, `TEST_SEED` appears in the `test` gate line; in a temporary git repo, `--list --tier 1` with staged, modified-unstaged and deleted files selects only the staged ones. `test/dependency-rules.test.js` - fixtures under `test/fixtures/deps/` with a `js/sim` module importing legacy code, a `js/evo` module importing the UI, a `js/sim` module importing `three` and a cycle each fail with the rule name. Phase 2: `test/bench-compare.test.js` - recorded bench JSON at +9% passes, at +11% fails, an equal base and a base without `bench` are skipped; mutation-score cases in `test/quality-ratchet.test.js` |
| Headless e2e            | N/A - no simulation behaviour; the golden run belongs to `headless-sim-core.md` and `eval-smoke` to `evolution-evals.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | Tier 1 finishes in under 10 s on the dev machine with ten staged files; the `check` job stays inside its 15-minute timeout; the `browser-smoke` job pulls the Playwright image (about 2 GB) and stays inside 15 minutes; tier 3 inside 60 minutes. `bench-compare` fails a head median more than 10% above the base median for any `bench.*` metric                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evolution metrics       | N/A - no change to agents, fitness or selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Determinism             | Test order is shuffled from a seed (`TEST_SEED`, else random) printed on the `test` gate line; the same seed replays the same order. No simulation RNG stream is used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Config and persistence  | N/A for `createConfig` and IndexedDB - no simulation config or schema changes. `scripts/quality-baseline.json` is a new committed file (keys in the Ratchet table). `package.json` gains the `prepare` script and exact-pinned devDependencies: `dependency-cruiser`, `jscpd`, `@vitest/coverage-v8` at the `vitest` version (Phase 1); `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` (Phase 2). `.gitignore` gains `reports/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Logging and diagnostics | No `simLog` events - tooling only. Each new gate writes `.checklogs/<gate>.log` and prints a digest: `deps` the rule, importer and import; `dupes` both clone locations; `ratchet` the scope, metric, baseline and measured value; `test` the seed; `mutation` surviving mutants by file, line and mutator; `browser-smoke` each unexpected console error and the screenshot path; `bench-compare` base median, head median and change per metric                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Browser compatibility   | `browser-smoke` runs Chromium from the pinned Playwright image with WebGL; WebGPU is not assumed, and the legacy no-WebGPU errors are allowlisted. No other browser runs in CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Docs                    | `AGENTS.md` Commands table (`--tier`, `--list`, `TEST_SEED`, the hook) and the legacy-budget row of its size-limit table; `dev-workflow-and-gate.md` Gate, Flag and Conventions tables and its Architecture row; `docs/designs/sim-notes.md` learnings for dependency-cruiser, jscpd, Stryker with Vitest 5 and Playwright. This doc becomes `Implemented` when Phase 2 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Verification            | `scripts/check.sh` green at tiers 1 and 2; the manual checks in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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
| T9  | Update `AGENTS.md` and the Gate, Flag and Conventions tables and Architecture row of `dev-workflow-and-gate.md`                                                    | [mechanical] | T3, T4, T5, T6, T7, T8             |
| T10 | Conformance review of Phase 1                                                                                                                                      | [judgement]  | T1, T2, T3, T4, T5, T6, T7, T8, T9 |

### Phase 2 - Mutation, browser smoke and benchmark comparison

| #   | Task                                                                                                                                                                    | Nature       | Depends on              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| T11 | Add exact-pinned Stryker, `stryker.config.json`, the `mutation` gate and mutation scores in the ratchet, with tests                                                     | [judgement]  | T10                     |
| T12 | Add `scripts/browser-smoke.sh`, `playwright.config.js`, `test/browser/smoke.spec.js`, `test/browser/known-console-errors.json`, the `browser-smoke` gate and its CI job | [judgement]  | T10                     |
| T13 | Add `scripts/bench-compare.mjs`, the `bench-compare` gate and `test/bench-compare.test.js`                                                                              | [judgement]  | T10                     |
| T14 | Add `.github/workflows/nightly.yml`                                                                                                                                     | [mechanical] | T11, T12, T13           |
| T15 | Update `AGENTS.md`, `dev-workflow-and-gate.md` and `sim-notes.md` for Phase 2                                                                                           | [mechanical] | T11, T12, T13, T14      |
| T16 | Conformance review of Phase 2                                                                                                                                           | [judgement]  | T11, T12, T13, T14, T15 |

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
