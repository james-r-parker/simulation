# Development workflow and gate

**Status:** Implemented - workflow, gate and CI (Phase 1), and the legacy browser baseline in `bench/legacy-baseline.json` (Phase 2).

The repo is planned, built and checked the same way in every session:

- Every piece of work starts from a design doc in `docs/designs/` that follows [STYLE.md](STYLE.md).
- `scripts/check.sh` is the local gate, and CI runs the same script.
- Workflow skills in `.claude/skills/` hold the procedures; [AGENTS.md](../../AGENTS.md) is the quick reference.

## Planning cycle

| Stage   | What happens                                                                                         | Skill / command      |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| Plan    | Explore, one interview batch, draft to STYLE.md, fresh-agent review, present, commit on `docs/<doc>` | `create-plan`        |
| Resume  | Re-validate the doc against `origin/main`, restamp, name the next phase                              | `resume-plan`        |
| Build   | One phase per branch and PR, one commit per task                                                     | -                    |
| Ship    | `scripts/check.sh --fix`, conformance review in parallel, Status and `(built)` moved in the same PR  | `create-pr`          |
| Measure | Eval and benchmark runs compared against baselines; experiments recorded                             | `run-evolution-loop` |
| Debug   | Find the event in the logs, replay from seed and config, failing test first                          | `debug-sim`          |
| Drift   | Compare documented facts with their source of truth; apply only approved edits                       | `audit-docs`         |

Planning is a stage of its own: the design docs for a body of work are written, reviewed and approved before any of
its code changes. The Build queue in the generated [README.md](README.md) orders the docs by `**Priority:**`.

## Design-doc index and lint

`scripts/designs-index.mjs` reads every `docs/designs/*.md` except `README.md` and `STYLE.md`.

| Rule                                                                                                                         | Applies to                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A `# ` title and a `**Status:**` line with a keyword from STYLE.md                                                           | Every doc                                |
| No `file.ext:<line>` or `file.ext#L<line>` references outside code fences                                                    | Every doc                                |
| Relative links resolve to a file (the generated `README.md` excepted); a planned doc is named in code font                   | Every doc                                |
| A `**Validated:** <sha> (<date>)` stamp and a `**Priority:** <rank> - <reason>` line                                         | `Proposed`, `In progress`                |
| Priority ranks are unique                                                                                                    | `Proposed`, `In progress`                |
| No `**Priority:**` line                                                                                                      | `Implemented`, `Reference`, `Superseded` |
| A Delivery requirements table with every STYLE.md concern, no empty cell, no bare `N/A`, and `TBD - <reason>` only in a stub | `Proposed`, `In progress`                |
| A Task breakdown with four columns, unique `T` ids, a `[mechanical]`/`[judgement]` tag, known dependencies and no cycles     | `Proposed`, `In progress`, not stubs     |
| Every `### Phase` heading reads `### Phase <n> - <name>`, and each unbuilt phase has exactly one `**Targets:**` line         | `Proposed`, `In progress`, not stubs     |

`--write` regenerates `docs/designs/README.md`, `--check` exits 1 when it is stale or a doc breaks a rule, and no
flag prints the index.

## Gate

`scripts/check.sh` prints one line per gate. A failed gate prints a digest of at most 40 lines and keeps its full
log in `.checklogs/<gate>.log` until the next run. The gates run in tiers - the pre-commit hook, the PR gate and
the nightly - set out in [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md), which also adds the
`browser-smoke`, `mutation` and `bench-compare` gates; a gate not built yet reports `skipped`.

| Gate            | Runs                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conventions`   | `scripts/check-conventions.sh`                                                                                                                       |
| `designs-index` | `node scripts/designs-index.mjs --check`                                                                                                             |
| `format`        | `prettier --check .` (scope set by `.prettierignore`)                                                                                                |
| `lint`          | `eslint --max-warnings 0 .` (scope set by `eslint.config.js`)                                                                                        |
| `typecheck`     | `tsc -p tsconfig.json` (`checkJs`, `strict`; scope set by its `include`)                                                                             |
| `test-related`  | Tier 1: `vitest related --run` over the staged `.js` and `.mjs` files                                                                                |
| `deps`          | `depcruise` with `.dependency-cruiser.cjs` (layering rules)                                                                                          |
| `dupes`         | `jscpd` with `.jscpd.json` over `js/sim`, `js/evo` and `scripts`                                                                                     |
| `test`          | `vitest run --coverage`, shuffled from `TEST_SEED` (printed as `test (seed <n>)`); fails when `js/sim` or `js/evo` has code and `test/` has no tests |
| `ratchet`       | `node scripts/quality-ratchet.mjs --check` against `scripts/quality-baseline.json`, after a passing `test`                                           |
| `build`         | `vite build` into a temporary directory                                                                                                              |
| `docs-tests`    | `vitest run test/designs-index.test.js`; only when named by `--docs` or `--only`                                                                     |

| Flag         | Effect                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `--fix`      | Regenerates the index and applies Prettier before checking; raises the ratchet baseline after a passing `test` |
| `--tier <n>` | Tier 1 (the pre-commit hook, staged files only), 2 (the default) or 3 (nightly); not with `--only` or `--docs` |
| `--list`     | Prints the selected gates and runs nothing                                                                     |
| `--ci`       | Also writes JUnit results to `TestResults/junit.xml` (`junit-docs.xml` for `docs-tests`)                       |
| `--docs`     | Runs `conventions`, `designs-index`, `format` and `docs-tests` only                                            |
| `--only=`    | Runs the named gates                                                                                           |
| `--quiet`    | Prints only failed gates and the summary                                                                       |

`scripts/check-conventions.sh` enforces what the linters do not:

| Convention                                                                                                                                                   | Violation message names            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Exact version pins in `package.json`; `package-lock.json` present                                                                                            | The dependency and its range       |
| `js/sim` and `js/evo` never use `Math.random`, `Date.now`, `performance.now`, `window`, `document`, `navigator` or `three`                                   | File, line and match               |
| Every module in `js/sim` and `js/evo` has a test at the mirrored path (`js/sim/x.js` -> `test/sim/x.test.js`)                                                | The module and the missing test    |
| Each legacy file (`js/*.js`, `js/constants/*.js`) stays within its line count in `legacyLines` of `scripts/quality-baseline.json`; no new file appears there | The file, its lines and its budget |
| A worker in `public/` has no same-named copy under `js/`                                                                                                     | The duplicate                      |
| No tracked file over 5 MB unless allowlisted (`preview.mp4`)                                                                                                 | File and size                      |

Lint and typecheck cover new code only: `js/sim/`, `js/evo/`, `scripts/` and `test/`. Prettier covers everything
except the legacy files in `.prettierignore`. Legacy modules join these scopes as [worker-and-renderer.md](worker-and-renderer.md) replaces
them.

## Coding standards

[AGENTS.md](../../AGENTS.md) (Coding standards) states the rules; `eslint.config.js` enforces the measurable ones on
`js/sim`, `js/evo` and `scripts`:

| Rule                     | Limit                                                    |
| ------------------------ | -------------------------------------------------------- |
| `max-lines`              | 300 per source file, 400 per test file (code lines only) |
| `max-lines-per-function` | 50                                                       |
| `complexity`             | 10                                                       |
| `max-depth`              | 3                                                        |
| `max-params`             | 4                                                        |
| `jsdoc/require-jsdoc`    | Every exported function                                  |

All linted code also has `eqeqeq`, `curly`, `no-var`, `prefer-const`, `no-param-reassign` (bindings only),
`no-shadow`, `no-else-return`, `no-implicit-coercion` and `no-warning-comments` (no `TODO`, `FIXME`, `XXX`, `HACK`);
`js/sim` and `js/evo` also have `no-console`. The design-doc tooling follows the same limits: `scripts/designs-index.mjs`
is the CLI over `scripts/design-docs/` (`markdown.mjs`, `header.mjs`, `lint-text.mjs`, `lint-tables.mjs`,
`parse-doc.mjs`, `render-index.mjs`).

## CI

`.github/workflows/check.yml` runs one job named `check` on every pull request and on pushes to `main`:

1. `scripts/change-scope.sh origin/<base>` classes the change as `docs` (only Markdown under `docs/`, `.claude/` or
   the repo root) or `full`.
2. `actions/setup-node` installs Node 24 with the npm cache, then `npm ci`.
3. `scripts/check.sh --ci`, or `scripts/check.sh --ci --docs` for a `docs` change.
4. On failure, `.checklogs/` and `TestResults/` are uploaded as the `check-logs` artifact.

`.github/dependabot.yml` groups weekly updates: one PR for GitHub Actions and one for npm.

## Phases

### Phase 1 - Workflow, gate and CI (built)

### Phase 2 - Legacy browser baseline (built)

**Targets:** browser.frame_p95_ms, browser.main_long_tasks

- In dev builds, `window.__perf()` returns `{ app: 'legacy', frameMs: { p50, p95, p99 }, frames, phases }`, where
  `phases` is the per-phase breakdown `PerformanceMonitor.getReport` already gives. `PerformanceMonitor` keeps only
  60 frames, so `installPerfProbe` in `js/dev/perf-probe.js` wraps `Simulation.perfMonitor.endFrame` and keeps the
  last 4096 frame times in its own ring. The probe lives outside `js/game.js` because legacy files only shrink.
- `scripts/browser-perf.mjs` (`npm run perf:browser`; `--seconds=<n>`, default 60, `--out=<path>` and `--headed`) starts `vite`, opens the app in Chromium through Playwright with
  `--enable-unsafe-webgpu`, waits the run length, and reads `window.__perf()` and the long-task count from a
  `PerformanceObserver`.
- It writes `bench/legacy-baseline.json`: the metrics, the browser version, the GPU adapter string, the agent count
  and the commit sha.
- When Chromium has no WebGPU adapter, or only a software fallback such as SwiftShader, the script exits 1 naming
  it; `--allow-fallback` records a fallback anyway, marked as such. WSL Chromium only has SwiftShader, so the
  baseline is recorded in Windows Chrome on the real GPU through `--cdp=<url>` (see `sim-notes.md`).

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | Phase 1: `AGENTS.md`, `CLAUDE.md`, `docs/designs/{STYLE,README,sim-notes,dev-workflow-and-gate}.md`, `.claude/skills/{create-plan,resume-plan,create-pr,audit-docs,run-evolution-loop,debug-sim}/SKILL.md`, `scripts/{check.sh,check-conventions.sh,change-scope.sh,designs-index.mjs}`, `scripts/design-docs/*.mjs`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `tsconfig.json`, `vitest.config.js`, `.editorconfig`, `.gitattributes`, `.github/workflows/check.yml`, `.github/dependabot.yml`. Phase 2: `scripts/browser-perf.mjs` (`npm run perf:browser`), and `js/dev/perf-probe.js`, which `js/game.js` installs as `window.__perf` when not `__PRODUCTION__` |
| Unit tests              | `test/designs-index.test.js`: status, stamp, priority and dependency parsing; unknown keywords; duplicate ranks; Targets count and format; phase heading format; every Delivery concern present; line-reference rejection (`:<line>` and `#L<line>`) outside fences; links that do not resolve; bare `N/A` and `TBD` rules; stub exemptions; task ids, nature, unknown dependencies and cycles; every task table header; the committed index matches the generator. Phase 2: `test/browser-perf.test.js` pins the metrics extraction from a recorded `window.__perf` payload                                                                                                         |
| Headless e2e            | N/A - Phase 1 is tooling with no simulation code; the headless sim arrives with [headless-sim-core.md](headless-sim-core.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Performance budget      | Phase 2 records `browser.frame_p95_ms` and `browser.main_long_tasks` for the legacy app in `bench/legacy-baseline.json`; no budget applies to the legacy app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Evolution metrics       | N/A - no change to agents, fitness or selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Determinism             | N/A - the legacy app has no seeded RNG; [headless-sim-core.md](headless-sim-core.md) adds it, and the `conventions` gate already rejects wall-clock randomness in `js/sim` and `js/evo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Config and persistence  | N/A - no simulation config keys or IndexedDB changes; `package.json` gains scripts, `engines` (`node >=24`) and exact-pinned devDependencies (`vitest`, `prettier`, `globals`, `@types/node`; Phase 2 adds `@playwright/test`)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Logging and diagnostics | Each gate writes `.checklogs/<gate>.log` and prints a digest; CI uploads `.checklogs/` and `TestResults/`. `scripts/browser-perf.mjs` prints the adapter string, the run length and each metric, and exits 1 naming the missing WebGPU adapter                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Browser compatibility   | Phase 2 runs on Chromium (Playwright) with WebGPU enabled; no other browser is measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Docs                    | `AGENTS.md` (with Coding standards) and `CLAUDE.md` (`@AGENTS.md`) are new; `README.md` links `AGENTS.md` and the design index; the legacy worker docs point at `public/database-worker.js`. This doc becomes `Implemented` when Phase 2 lands                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Verification            | `scripts/check.sh` green; `scripts/check.sh --docs` green; `npm run dev` still runs the legacy simulation; Phase 2: `node scripts/browser-perf.mjs` writes `bench/legacy-baseline.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Task breakdown

### Phase 1 - Workflow, gate and CI

| #   | Task                                                                                                                                                                          | Nature       | Depends on                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------- |
| T1  | Pin dependency versions exactly; add `vitest`, `prettier`, `globals`, `@types/node` and npm scripts                                                                           | [mechanical] | -                                       |
| T2  | Add `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `tsconfig.json`, `vitest.config.js` and the `.gitignore` entries            | [mechanical] | T1                                      |
| T3  | Write `docs/designs/STYLE.md` and `docs/designs/sim-notes.md`                                                                                                                 | [judgement]  | -                                       |
| T4  | Port the index generator and doc lint to `scripts/designs-index.mjs` with `test/designs-index.test.js`                                                                        | [judgement]  | T2, T3                                  |
| T5  | Port `scripts/check.sh`, `scripts/check-conventions.sh` and `scripts/change-scope.sh`                                                                                         | [judgement]  | T2, T4                                  |
| T6  | Remove the duplicate `js/database-worker.js` and the empty `.cursor/commands/directory.md`                                                                                    | [mechanical] | T5                                      |
| T7  | Write the skills: `create-plan`, `resume-plan`, `create-pr`, `audit-docs`, `run-evolution-loop`, `debug-sim`                                                                  | [judgement]  | T3, T5                                  |
| T8  | Write `AGENTS.md` and `CLAUDE.md`, and point `README.md` at them                                                                                                              | [judgement]  | T5, T7                                  |
| T9  | Add `.github/workflows/check.yml` and `.github/dependabot.yml`                                                                                                                | [mechanical] | T5                                      |
| T10 | Add the coding standards: AGENTS.md section, ESLint limits, test-per-module and legacy size budget conventions; split `scripts/designs-index.mjs` into `scripts/design-docs/` | [judgement]  | T4, T5, T8                              |
| T11 | Conformance review of Phase 1                                                                                                                                                 | [judgement]  | T1, T2, T3, T4, T5, T6, T7, T8, T9, T10 |

### Phase 2 - Legacy browser baseline

| #   | Task                                                                                    | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------- | ------------ | ---------- |
| T12 | Expose `window.__perf()` in dev builds from `Simulation.perfMonitor`, with p50 and p99  | [mechanical] | T11        |
| T13 | Add `scripts/browser-perf.mjs` with `@playwright/test`, and `test/browser-perf.test.js` | [judgement]  | T12        |
| T14 | Record `bench/legacy-baseline.json` on the dev machine                                  | [mechanical] | T13        |
| T15 | Conformance review of Phase 2                                                           | [judgement]  | T14        |

## Verification

1. `scripts/check.sh` prints a line per gate and ends `All <n> checks passed`.
2. `scripts/check.sh --fix` run twice leaves no diff.
3. Breaking a doc fails `designs-index` with a digest naming the file: a duplicate Priority, a missing Targets line,
   a missing Delivery concern, or a reference that pins a line number.
4. Adding a line to a legacy file, a new file beside them, or a `js/sim` module without a test fails `conventions`;
   a 301-line module or a 51-line function in `js/sim` fails `lint`.
5. `printf 'docs/designs/x.md\n' | scripts/change-scope.sh` prints `docs`; adding `js/a.js` prints `full`.
6. `npm run dev` runs the legacy simulation unchanged.
7. Phase 2: `node scripts/browser-perf.mjs` writes `bench/legacy-baseline.json` with non-zero frame times.
