# AGENTS.md

Quick reference for coding agents working on Blob Evolution. Humans start at [README.md](README.md).

Blob Evolution is a browser artificial-life simulation: agents with recurrent neural-network brains sense their
world through rays, eat, fight, mate and die, and their genomes evolve. It is built in short sessions over a long
period, so **every piece of work starts from a design doc**.

The current app (`js/*.js`, Three.js and WebGPU) is the legacy implementation. Its replacement - a deterministic
headless sim core, an evolution archive, an eval system and a worker-driven renderer - is planned in
`docs/designs/` and built phase by phase.

## Where things are

| Path                        | Holds                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/designs/`             | Design docs - the plans and the as-built descriptions. Index: [docs/designs/README.md](docs/designs/README.md)                                     |
| `docs/designs/STYLE.md`     | Design doc conventions. Read before writing or editing any doc                                                                                     |
| `docs/designs/sim-notes.md` | Verified platform and library facts, and learnings from each phase                                                                                 |
| `.claude/skills/`           | Workflow skills for agents working on this repo (below)                                                                                            |
| `scripts/check.sh`          | The local gate; CI runs it                                                                                                                         |
| `scripts/designs-index.mjs` | Design doc index generator and lint                                                                                                                |
| `js/`                       | The legacy app (`legacy.html`, `npm run dev` only): `game.js`, `agent.js`, `neural-network.js`, `gpu-*.js`, `renderer.js`, `ui.js`, `database*.js` |
| `js/constants/`             | Legacy tunables; the defaults the new config is built from                                                                                         |
| `js/sim/`, `js/evo/`        | The headless sim core and evolution (DOM-free and deterministic)                                                                                   |
| `js/worker/`                | The sim worker and its message protocol (imports `js/sim/` and `js/evo/`; no DOM)                                                                  |
| `js/app/`                   | The app on `index.html`: `main.js`, the frame loop, `renderer/` (three, WebGL2), `ui/` (imports `three` and `js/worker/protocol.js` only)          |
| `test/`                     | Vitest tests                                                                                                                                       |
| `public/`                   | Static files served at the site root, including the database worker                                                                                |

## Commands

| Task                                             | Command                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                                          | `npm ci`                                                                                                                                                                                                                                                                                                                                                                                                   |
| Run the app                                      | `npm run dev` (Vite, http://localhost:5173)                                                                                                                                                                                                                                                                                                                                                                |
| Full local gate (tier 2, what a PR needs)        | `scripts/check.sh` (every test, including `*.slow.test.js`; conventions, designs-index, format, lint, typecheck, deps, dupes, test with coverage, ratchet, bench-check, build, eval-smoke)                                                                                                                                                                                                                 |
| Apply Prettier, regenerate the index, then check | `scripts/check.sh --fix`                                                                                                                                                                                                                                                                                                                                                                                   |
| What CI runs                                     | `scripts/check.sh --ci`                                                                                                                                                                                                                                                                                                                                                                                    |
| Docs-only change                                 | `scripts/check.sh --fix --docs` (conventions, designs-index, format, design-doc tests; what CI runs when `scripts/change-scope.sh` says `docs`)                                                                                                                                                                                                                                                            |
| Only the fast tests (no `*.slow.test.js`)        | `TEST_SCOPE=fast npx vitest run`                                                                                                                                                                                                                                                                                                                                                                           |
| Only failures and the summary                    | `scripts/check.sh --quiet`                                                                                                                                                                                                                                                                                                                                                                                 |
| A subset of gates                                | `scripts/check.sh --only=lint,typecheck`                                                                                                                                                                                                                                                                                                                                                                   |
| The pre-commit checks on the staged files        | `scripts/check.sh --tier 1` (the `.githooks/pre-commit` hook; `npm ci` turns it on through `prepare`)                                                                                                                                                                                                                                                                                                      |
| The nightly tier; list a tier's gates            | `scripts/check.sh --tier 3`; `scripts/check.sh --list --tier 1`                                                                                                                                                                                                                                                                                                                                            |
| Browser smoke test without Docker                | `SMOKE_LOCAL=1 scripts/check.sh --only=browser-smoke`                                                                                                                                                                                                                                                                                                                                                      |
| Compare this branch's bench with main            | `node scripts/bench-compare.mjs` (`--base <ref>`, `--sizes=500`, `--runs=5`; about 6 minutes)                                                                                                                                                                                                                                                                                                              |
| Replay a shuffled test order                     | `TEST_SEED=<seed> scripts/check.sh --only=test` (the seed is on the `test (seed <n>)` line)                                                                                                                                                                                                                                                                                                                |
| Read a failed gate                               | The digest under its `✗` line, then `.checklogs/<gate>.log` (kept until the next run). Do not rerun the tool to see why                                                                                                                                                                                                                                                                                    |
| Benchmark the sim core (step and phase ms)       | `npm run bench` (`-- --json`, `-- --sizes=500`, `-- --policy <name>` to bench a registered policy with its hooks; `bench/baseline.json` is what `bench-check` compares)                                                                                                                                                                                                                                    |
| Function microbenchmarks (hot functions, ops/s)  | `npm run bench:micro` (`-- --compare <ref>` runs the same files on a worktree of `<ref>` and this tree, alternating, and prints the change per function with its margin; `--runs <n>` (3), `--filter <text>`; about 5 minutes for a compare; a tool, not a gate)                                                                                                                                           |
| Parallel throughput by worker count              | `npm run bench:parallel` (`-- --counts 1,8,16,24,32 --ticks 2000 --agents 500 --json`; prints `bench.parallel_ticks_per_s@<n>` and the recommended worker default)                                                                                                                                                                                                                                         |
| Check the golden hashes in Chromium              | `npm run browser:hash` (`-- --cdp=<url>` to use a running Chrome)                                                                                                                                                                                                                                                                                                                                          |
| Measure the app's frame times in Chrome          | `npm run perf:browser` (`-- --app v6` is the default, `--agents <n>` (500), `--viewport <w>x<h>` (3840x2160), `--seconds <n>`, `--cdp=http://127.0.0.1:9222` for Windows Chrome on the GPU; refuses a display under 120 Hz without `--allow-low-refresh` and software GL without `--allow-fallback`; writes `bench/browser-baseline.json` by viewport; `--app legacy` writes `bench/legacy-baseline.json`) |
| Replay a world and log its events                | `npm run replay -- --seed <n> --ticks <n>` (`--config <file.json>`, `--dump <tick>`, `--level debug`, `--check-invariants`, `--policy <name>`, `--follow <genomeId>`); logs go to `.sim/logs/<runId>.jsonl`                                                                                                                                                                                                |
| Evaluate a policy on fixed seeds                 | `npm run eval -- --seeds <n> --ticks <t> --policy <name>` (defaults 16 seeds, 200000 ticks; `--seed-offset <k>`, `--config <file.json>`, `--out <path>`, `--workers <n>`; seeds come from `evals/seeds.json`; reports go to `evals/results/`, logs to `.sim/logs/eval-<id>.jsonl`)                                                                                                                         |
| Screen a grid of config arms                     | `npm run screen -- --grid <grid.json>` (`--workers <total>` for all arms and seeds, default cores - 2; `--out`, `--seeds`, `--seed-offset`, `--ticks`, `--force`; takes the CPU lock itself, so do not wrap it in `flock`; resumable per arm; `table.md` and `verdicts.json` in `evals/screens/results/<grid>/`; example `evals/screens/t59.grid.json`)                                                    |
| Run the skill ladder                             | `npm run ladder` (`--ticks`, `--seeds`, `--config <file.json>`, `--out <path>`, `--workers <n>`; default 10000 ticks on seeds 1-3, no floor; reports to `evals/ladder/<id>.json`, logs to `.sim/logs/ladder-<id>.jsonl`)                                                                                                                                                                                   |
| Measure eval power from one report               | `npm run eval:power -- <report.json>` (`--splits`, `--power-splits`, `--sizes`, `--metrics`, `--include-watch` (also measures `watch` metrics, scoring each in its intended direction from `scripts/lib/watch-intent.mjs`), `--json`; false-positive rate and detectable change per metric from split resampling, no new runs)                                                                             |
| Compare two eval reports                         | `npm run eval:compare -- <before.json> <after.json>` (`--targets <m,...>`, `--fail-on-worse`, `--allow-config-diff <key,...>`, `--allow-seed-diff`, `--min-effect <fraction>` (default 0.05), `--json`; a verdict needs the interval to exclude 0 and a change of at least that share of the before mean; refuses under 16 seeds; BCa intervals on per-seed differences; exits 2 on a refusal)             |
| Play a candidate in the champion league          | `npm run league -- <candidate.json>` (`--admit` appends it to `evals/league.json` with its Elo, `--workers <n>`, `--ticks <n>`; 8 seeds against every admitted champion; logs to `.sim/logs/league-<id>.jsonl`)                                                                                                                                                                                            |
| Telemetry dashboard (Aspire)                     | `bash -lic 'npm run aspire:dashboard'`, then run with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`; UI at http://127.0.0.1:18888                                                                                                                                                                                                                                                                    |
| Tests                                            | `npm test`; one file: `npx vitest run <file>`; one test: `npx vitest run -t '<name>'`                                                                                                                                                                                                                                                                                                                      |
| Regenerate the design index                      | `node scripts/designs-index.mjs --write`                                                                                                                                                                                                                                                                                                                                                                   |
| Production build / deploy                        | `npm run build`; `npm run deploy` (Cloudflare Pages) - deploy only when the user asks                                                                                                                                                                                                                                                                                                                      |

Commands that arrive with planned design docs: `npm run train`. The doc
that adds it says how it works.

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
5. **Measuring a change** - the `run-evolution-loop` skill: prediction first, at least 16 seeds per arm,
   `eval:compare` verdicts, experiments recorded in `evals/experiments.json`.
6. **Something misbehaves** - the `debug-sim` skill: find the event in the logs, replay from seed and config,
   failing test, fix.
7. **Docs drift** - the `audit-docs` skill proposes fixes; nothing is applied without approval.

## Delegating to subagents

When one agent hands tasks to others (user, 2026-10-22):

- **One task at a time**, each branched from the latest `origin/main`. Parallel branches conflict in the config files
  and the plan doc, and the rework costs more than the parallelism saves.
- **Pick the model by the task's tag.** `[mechanical]` tasks (run a command, re-pin, re-record, fill a table) go to
  Haiku; `[judgement]` tasks (deciding a verdict, diagnosis, review, optimisation) go to Sonnet. The delegating agent
  reviews every result before it merges.
- **Wait without polling.** Start long runs (evals, screens, the full gate) in the background and wait for the
  completion notice; never loop on sleep or check progress every few minutes. Leave no waiting loops behind.
- **Never strand a run (user, 2026-10-23).** A subagent's background job finishing does not always wake the
  subagent. A subagent runs a command that takes under about 9 minutes in the foreground, and does not end its turn
  while one of its background jobs is still running. When a subagent starts a longer run, the delegating agent starts
  its own background wait on that run's output file and resumes the subagent as soon as the file appears.
- **Clean up after each merge (user, 2026-10-23).** Once a subagent's PR merges, remove its worktree with
  `git worktree remove <path>` (unlock it first if its locking process has exited). Never use `--force`: a worktree
  with uncommitted files is left for the user to inspect.
- **Summarise results with a script.** Extract the few numbers a decision needs from eval reports and logs into a
  short table instead of reading whole reports.
- **Only timing work needs a quiet machine.** Performance work (`npm run bench`, `bench-compare`, `bench:micro`,
  `perf:browser`, `alloc-check`) and the full gate (`scripts/check.sh`, whose `bench-check` and slow-test timeouts
  fail under load) run through `flock /tmp/claude-1000/cpu.lock <cmd>` and only while no eval or screen is running.
  Evals, screens, the ladder and replays are deterministic whatever the load, so they run side by side and may fill
  the CPU.
- **Report once, briefly**: PR link, what changed, measurements, decisions, anything unsure.

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

A test that runs a real world for many ticks, a worker pool or a full eval (about 0.5 s or more) goes in
`<module>.slow.test.js` beside the mirrored test; CI runs only the fast tests, every local run runs all
(`docs/designs/quality-gates-and-test-tiers.md`).

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
