# AGENTS.md

Quick reference for coding agents working on Blob Evolution. Humans start at [README.md](README.md).

Blob Evolution is a browser artificial-life simulation: agents with recurrent neural-network brains sense their
world through rays, eat, fight, mate and die, and their genomes evolve. It is built in short sessions over a long
period, so **every piece of work starts from a design doc**.

The current app (`js/*.js`, Three.js and WebGPU) is the legacy implementation. Its replacement - a deterministic
headless sim core, an evolution archive, an eval system and a worker-driven renderer - is planned in
`docs/designs/` and built phase by phase.

## Where things are

| Path                        | Holds                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `docs/designs/`             | Design docs - the plans and the as-built descriptions. Index: [docs/designs/README.md](docs/designs/README.md)        |
| `docs/designs/STYLE.md`     | Design doc conventions. Read before writing or editing any doc                                                        |
| `docs/designs/sim-notes.md` | Verified platform and library facts, and learnings from each phase                                                    |
| `.claude/skills/`           | Workflow skills for agents working on this repo (below)                                                               |
| `scripts/check.sh`          | The local gate; CI runs it                                                                                            |
| `scripts/designs-index.mjs` | Design doc index generator and lint                                                                                   |
| `js/`                       | The legacy app: `game.js` (loop), `agent.js`, `neural-network.js`, `gpu-*.js`, `renderer.js`, `ui.js`, `database*.js` |
| `js/constants/`             | Legacy tunables; the defaults the new config is built from                                                            |
| `js/sim/`, `js/evo/`        | The headless sim core and evolution (planned; DOM-free and deterministic)                                             |
| `test/`                     | Vitest tests                                                                                                          |
| `public/`                   | Static files served at the site root, including the database worker                                                   |

## Commands

| Task                                             | Command                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                                          | `npm ci`                                                                                                                                        |
| Run the app                                      | `npm run dev` (Vite, http://localhost:5173)                                                                                                     |
| Full local gate (tier 2, what a PR needs)        | `scripts/check.sh` (conventions, designs-index, format, lint, typecheck, deps, dupes, test with coverage, ratchet, build)                       |
| Apply Prettier, regenerate the index, then check | `scripts/check.sh --fix`                                                                                                                        |
| What CI runs                                     | `scripts/check.sh --ci`                                                                                                                         |
| Docs-only change                                 | `scripts/check.sh --fix --docs` (conventions, designs-index, format, design-doc tests; what CI runs when `scripts/change-scope.sh` says `docs`) |
| Only failures and the summary                    | `scripts/check.sh --quiet`                                                                                                                      |
| A subset of gates                                | `scripts/check.sh --only=lint,typecheck`                                                                                                        |
| The pre-commit checks on the staged files        | `scripts/check.sh --tier 1` (the `.githooks/pre-commit` hook; `npm ci` turns it on through `prepare`)                                           |
| The nightly tier; list a tier's gates            | `scripts/check.sh --tier 3`; `scripts/check.sh --list --tier 1`                                                                                 |
| Replay a shuffled test order                     | `TEST_SEED=<seed> scripts/check.sh --only=test` (the seed is on the `test (seed <n>)` line)                                                     |
| Read a failed gate                               | The digest under its `✗` line, then `.checklogs/<gate>.log` (kept until the next run). Do not rerun the tool to see why                         |
| Tests                                            | `npm test`; one file: `npx vitest run test/designs-index.test.js`                                                                               |
| Regenerate the design index                      | `node scripts/designs-index.mjs --write`                                                                                                        |
| Production build / deploy                        | `npm run build`; `npm run deploy` (Cloudflare Pages) - deploy only when the user asks                                                           |

Commands that arrive with planned design docs: `npm run bench`, `npm run eval`, `npm run eval:compare`,
`npm run train`, `npm run replay` and `node scripts/browser-perf.mjs`. The docs that add them say how they work.

## Build order

The **Build queue** in [docs/designs/README.md](docs/designs/README.md) is the order: every `Proposed` and
`In progress` doc carries a unique `**Priority:**` rank (1 is next). Each doc's `**Depends on:**` line is
authoritative for what must be built first.

A design doc's **Task breakdown** table is machine-read (`scripts/designs-index.mjs`, and `jmz plan run`): keep the
four columns (`#`, `Task`, `Nature`, `Depends on`), `T`-numbered ids and `[mechanical]` / `[judgement]` tags exact.

## Workflow

1. **Planning stage** - the `create-plan` skill writes `docs/designs/<feature>.md` with status `Proposed`: explore,
   one interview batch, draft, fresh-agent review, present for approval, commit on `docs/<doc-name>`. All the docs
   for a body of work are approved, and the user confirms the Build queue, before its code changes.
2. **Picking work back up** - the `resume-plan` skill re-validates the doc against `origin/main` and names the next
   phase.
3. **Build one phase per branch and PR** - commit per task.
4. **Before pushing** - the `create-pr` skill: `scripts/check.sh --fix`, a plan-conformance review agent in parallel
   with the final check, measurements for the phase's Targets, the phase marked `(built)` and the status line moved
   in the same PR.
5. **Measuring a change** - the `run-evolution-loop` skill: prediction first, at least 8 seeds per arm,
   `eval:compare` verdicts, experiments recorded in `evals/experiments.json`.
6. **Something misbehaves** - the `debug-sim` skill: find the event in the logs, replay from seed and config,
   failing test, fix.
7. **Docs drift** - the `audit-docs` skill proposes fixes; nothing is applied without approval.

## Hard rules

- Never commit to `main`. Branch `<type>/<short-desc>` (`docs/<doc-name>` for design docs); conventional commit
  subjects; the "why" goes in commit and PR bodies.
- Push and open PRs only when the user asks. Deploy only when the user asks.
- A doc's `**Status:**` line moves in the same PR as the code it describes. Never hand-edit
  `docs/designs/README.md`.
- Name code by symbol (`forwardAll` in `js/sim/brain.js`), never by line number, in anything committed.
- No secrets in the repo.
- `js/sim/` and `js/evo/` never touch the DOM, `three`, `navigator`, `Date.now`, `performance.now` or
  `Math.random`. All randomness goes through `js/sim/rng.js`; simulation time is counted in ticks. The
  `conventions` and `lint` gates enforce this.
- Dependency versions in `package.json` are exact pins (`npm install --save-exact`). The `conventions` gate enforces
  it.
- Formatting is Prettier with `.prettierrc.json` and `.editorconfig` - no other formatter. Change a style rule in
  config, never by hand-formatting around it.
- Every change ships with tests for the behaviour it adds, and a bug fix starts with a failing test.
- A change claiming to improve evolution or performance carries the measurement (`run-evolution-loop`); "it looks
  better" is not a result.
- Library and platform surprises go into `docs/designs/sim-notes.md` under `## Learned while building` as
  `### YYYY-MM-DD - <topic>` entries, not into design docs.
- Search with `rg` and `fd`, not `grep -r` and `find`; use `ast-grep` (`sg`) for structural matches.
- Use `-` rather than em dashes in docs.

## Coding standards

The legacy app grew 2,000-line files (`agent.js`, `game.js`, `ui.js`) that mix simulation, rendering, persistence
and UI, and cannot be tested. New code is the opposite: small modules that each do one job and are tested on their
own.

### Size limits (enforced)

| Limit                              | Value                                                                                  | Gate                              |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| Lines per source file              | 300 (blank lines and comments excluded)                                                | `lint` (`max-lines`)              |
| Lines per test file                | 400                                                                                    | `lint` (`max-lines`)              |
| Lines per function                 | 50                                                                                     | `lint` (`max-lines-per-function`) |
| Cyclomatic complexity per function | 10                                                                                     | `lint` (`complexity`)             |
| Nesting depth                      | 3                                                                                      | `lint` (`max-depth`)              |
| Parameters per function            | 4 - pass an options object beyond that                                                 | `lint` (`max-params`)             |
| Test file per module               | `js/sim/x.js` -> `test/sim/x.test.js`, same for `js/evo`                               | `conventions`                     |
| Legacy files                       | Only shrink; no new files beside them (`scripts/quality-baseline.json`, `legacyLines`) | `conventions`                     |

A limit is a signal to split, never a target to pad up to. Do not silence a limit with `eslint-disable`; split the
module or function instead. When a legacy file shrinks, lower its budget (`legacyLines` in `scripts/quality-baseline.json`) in the same
commit; when it is deleted, remove its entry.

### Module design

- **One responsibility per module.** A module's name says what it does (`spatial-hash.js`, `mutation.js`), and its
  header comment says it in one line. If the description needs "and", it is two modules.
- **Pure core, thin shell.** Simulation and evolution logic are pure functions over plain data and typed arrays.
  Side effects - DOM, rendering, IndexedDB, workers, files, timers, logging sinks - live in thin adapters at the edge
  that are swapped for fakes in tests.
- **Dependencies are passed in, not reached for.** Functions take what they need (config, RNG, world state) as
  arguments. No module-level mutable state, no singletons, no globals like `window.currentSimulation`.
- **No import-time side effects.** Importing a module never touches the DOM, starts a timer or allocates large
  buffers; construction happens in an explicit `create...` or `init` call.
- **One-way dependencies.** `js/sim` depends on nothing in the app; `js/evo` depends on `js/sim`; the worker,
  renderer and UI depend on both, never the reverse. No circular imports.
- **Small public surface.** Export only what other modules use; everything exported has a JSDoc comment with types
  (`lint` enforces it in `js/sim`, `js/evo` and `scripts`).
- **Config, not constants in code.** Tunables come from `createConfig` with named defaults; no magic numbers in
  logic. A number that needs a comment to explain it is a config key or a named constant.

### Correctness

- **Fail loudly.** Invalid input throws an `Error` with a message that names the value and what was expected. Never
  fall back silently - the legacy code randomised mismatched brain weights and kept their old fitness, which
  corrupted evolution for months.
- **Validate at the boundary.** Data from IndexedDB, files, workers or the user is checked once where it enters;
  internal code trusts its typed inputs.
- **Determinism.** Same seed and config, same result: no `Math.random`, wall-clock time, or iteration over objects
  or `Map`s keyed by identity in anything that affects the simulation.
- **No dead code.** No commented-out code, unused exports, or `TODO`/`FIXME` comments (`lint` rejects them). Work
  that remains belongs in a design doc task.

### Performance (hot paths)

- Per-tick code allocates nothing: preallocated typed arrays (struct-of-arrays), no closures, object literals,
  `map`/`filter` chains or string building inside the tick.
- Every hot-path change ships with a benchmark, and claims of speed carry `bench` numbers against the baseline.
- Optimise only what a benchmark or profile shows is slow; keep everything else simple.

### Tests

- **Test behaviour, not implementation.** Assert on outputs and observable state through the public API.
- **Fast and isolated.** Unit tests need no browser, GPU, network or timers, and finish in milliseconds; each test
  builds its own small world.
- **Reference tests for clever code.** Optimised code (spatial hash, batched matmul, ray march) is checked against a
  naive reference implementation on random seeded inputs.
- **Arrange, act, assert**, one behaviour per test, named for the behaviour (`it('rejects a genome with the wrong
architecture')`).

### Changes and reviews

- **Small PRs, one concern each.** One phase per PR, one task per commit, and every commit passes the gate.
- **Refactor separately.** A refactor with no behaviour change is its own commit; it never rides along with a
  feature or a fix.
- **Boy-scout rule, within reason.** Leave touched code a little better, but put unrelated cleanups in their own PR.
- **Review checklist.** Before `create-pr`: the gate is green; each new module has a one-line purpose and a test
  file; no limit was dodged; errors are loud; hot paths allocate nothing; docs and Status lines moved with the code.

## Testing

- `scripts/check.sh` runs every test; `npx vitest run <file>` runs one file, `npx vitest run -t '<name>'` one test.
- Lint and typecheck cover the new code only (`js/sim/`, `js/evo/`, `scripts/`, `test/`); legacy modules join as
  they are replaced. Prettier covers everything except the legacy files listed in `.prettierignore`.
- Simulation tests run headless on a seeded world. They never use `Math.random`, wall-clock time, a real GPU or a
  browser.
- `test/designs-index.test.js` lints every real design doc and checks the committed index is current.

## Debugging

Follow the `debug-sim` skill. For the legacy app: the browser console, the dev performance monitor (the
`PerformanceMonitor` class in `js/performance-monitor.js`, held as `perfMonitor` by `Simulation` in `js/game.js`) and
DevTools Performance recordings.

## Environment and tools

WSL2 Ubuntu, native Linux paths only. Node 24 (`package.json` `engines`).

- Search: `rg` for text, `fd` for files, `ast-grep` (`sg`) for structural search and refactors.
- GitHub: `gh`.
- Tools installed through nvm appear only in a login shell - check with `bash -lic '<cmd>'`.
