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

| Task                                             | Command                                                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                                          | `npm ci`                                                                                                                                                          |
| Run the app                                      | `npm run dev` (Vite, http://localhost:5173)                                                                                                                       |
| Full local gate (tier 2, what a PR needs)        | `scripts/check.sh` (conventions, designs-index, format, lint, typecheck, deps, dupes, test with coverage, ratchet, bench-check, build)                            |
| Apply Prettier, regenerate the index, then check | `scripts/check.sh --fix`                                                                                                                                          |
| What CI runs                                     | `scripts/check.sh --ci`                                                                                                                                           |
| Docs-only change                                 | `scripts/check.sh --fix --docs` (conventions, designs-index, format, design-doc tests; what CI runs when `scripts/change-scope.sh` says `docs`)                   |
| Only failures and the summary                    | `scripts/check.sh --quiet`                                                                                                                                        |
| A subset of gates                                | `scripts/check.sh --only=lint,typecheck`                                                                                                                          |
| The pre-commit checks on the staged files        | `scripts/check.sh --tier 1` (the `.githooks/pre-commit` hook; `npm ci` turns it on through `prepare`)                                                             |
| The nightly tier; list a tier's gates            | `scripts/check.sh --tier 3`; `scripts/check.sh --list --tier 1`                                                                                                   |
| Browser smoke test without Docker                | `SMOKE_LOCAL=1 scripts/check.sh --only=browser-smoke`                                                                                                             |
| Compare this branch's bench with main            | `node scripts/bench-compare.mjs` (`--base <ref>`, `--sizes=500`, `--runs=5`; about 6 minutes)                                                                     |
| Replay a shuffled test order                     | `TEST_SEED=<seed> scripts/check.sh --only=test` (the seed is on the `test (seed <n>)` line)                                                                       |
| Read a failed gate                               | The digest under its `✗` line, then `.checklogs/<gate>.log` (kept until the next run). Do not rerun the tool to see why                                           |
| Benchmark the sim core (step and phase ms)       | `npm run bench` (`-- --json`, `-- --sizes=500`; `bench/baseline.json` is what `bench-check` compares)                                                             |
| Check the golden hashes in Chromium              | `npm run browser:hash` (`-- --cdp=<url>` to use a running Chrome)                                                                                                 |
| Measure the legacy app's frame times in Chrome   | `npm run perf:browser` (`-- --cdp=http://127.0.0.1:9222` for Windows Chrome on the GPU; writes `bench/legacy-baseline.json`)                                      |
| Replay a world and log its events                | `npm run replay -- --seed <n> --ticks <n>` (`--config <file.json>`, `--dump <tick>`, `--level debug`, `--check-invariants`); logs go to `.sim/logs/<runId>.jsonl` |
| Telemetry dashboard (Aspire)                     | `bash -lic 'npm run aspire:dashboard'`, then run with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`; UI at http://127.0.0.1:18888                           |
| Tests                                            | `npm test`; one file: `npx vitest run <file>`; one test: `npx vitest run -t '<name>'`                                                                             |
| Regenerate the design index                      | `node scripts/designs-index.mjs --write`                                                                                                                          |
| Production build / deploy                        | `npm run build`; `npm run deploy` (Cloudflare Pages) - deploy only when the user asks                                                                             |

Commands that arrive with planned design docs: `npm run eval`, `npm run eval:compare` and `npm run train`. The docs
that add them say how they work.

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

## Boundaries

- Never weaken, skip or delete a test, or lower a ratchet baseline, to make a change pass. Fix the code, or stop and
  say why the test is wrong.
- Never report a run as passing when it was interrupted, timed out, skipped or not run. Say what ran and what it
  printed; report a failed command rather than guessing why.
- Add or upgrade a dependency only when the user asks or a design doc names it.
- Stay in scope: touch only the files the task needs, and do not reformat or refactor unrelated code.

## Coding standards

New code is small modules that each do one job and are tested on their own.

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

Read [docs/coding-standards.md](docs/coding-standards.md) before writing code: module design, correctness,
hot-path performance, tests and reviews. In short: one job per module, pure core with a thin shell, fail loudly,
per-tick code allocates nothing, test behaviour against a naive reference for clever code, one task per commit.

## Debugging

Follow the `debug-sim` skill; for the legacy app, the browser console and `window.__perf()` in dev builds.

## Environment and tools

WSL2 Ubuntu, native Linux paths only. Node 24 (`package.json` `engines`).

- Search: `rg` for text, `fd` for files, `ast-grep` (`sg`) for structural search and refactors.
- GitHub: `gh`.
- Tools installed through nvm appear only in a login shell - check with `bash -lic '<cmd>'`.
- Telemetry: the Aspire CLI (a dotnet tool, so also login-shell only) runs the dashboard with `npm run aspire:dashboard`;
  `docker-compose.yml` does the same where Docker exists. `.mcp.json` registers `aspire agent mcp` against it, which
  reads logs and traces but not metrics. Metrics are opt-in: nothing is sent unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
