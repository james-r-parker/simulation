# AGENTS.md

Quick reference for coding agents working on Blob Evolution. Humans start at [README.md](README.md).

Blob Evolution is a browser artificial-life simulation: agents with recurrent neural-network brains sense their
world through rays, eat, fight, mate and die, and their genomes evolve. It is built in short sessions over a long
period, so **every piece of work starts from a design doc**.

The goal is a world that is interesting to watch. [docs/principles.md](docs/principles.md) holds the traits, the scenes
worth watching, the selection rules and how each scene is detected; read it before any design, tuning or
done-criteria call.

The app is a deterministic headless sim core, an evolution archive, an eval system and a worker-driven renderer,
planned in `docs/designs/` and built phase by phase. The old single-thread app was deleted; `docs/designs/legacy-audit.md`
records why each part was replaced.

## Where things are

| Path                          | Holds                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/designs/`               | Design docs - the plans and the as-built descriptions. Index: [docs/designs/README.md](docs/designs/README.md)                                                                                                                                                                                                                                                            |
| `docs/designs/STYLE.md`       | Design doc conventions. Read before writing or editing any doc                                                                                                                                                                                                                                                                                                            |
| `docs/designs/sim-notes.md`   | Verified platform and library facts, and learnings from each phase                                                                                                                                                                                                                                                                                                        |
| `.claude/skills/`             | Workflow skills for agents working on this repo (below)                                                                                                                                                                                                                                                                                                                   |
| `scripts/check.sh`            | The local gate; CI runs it                                                                                                                                                                                                                                                                                                                                                |
| `scripts/designs-index.mjs`   | Design doc index generator and lint                                                                                                                                                                                                                                                                                                                                       |
| `js/sim/`, `js/evo/`          | The headless sim core and evolution (DOM-free and deterministic)                                                                                                                                                                                                                                                                                                          |
| `js/worker/`                  | The sim worker and its message protocol (imports `js/sim/` and `js/evo/`; no DOM)                                                                                                                                                                                                                                                                                         |
| `js/app/`                     | The app on `index.html`: `main.js`, the frame loop, `renderer/` (`three/webgpu` and `three/tsl`, WebGL2 fallback; docs/designs/crisp-renderer.md), `ui/` (imports `three/webgpu`, `three/tsl` and `js/worker/protocol.js` only), `pack/` (the pack worker: blends, packs and rigs the agents into shared frame slots; never imports `three`; docs/designs/pack-worker.md) |
| `test/`                       | Vitest tests                                                                                                                                                                                                                                                                                                                                                              |
| `js/library/`, `migrations/`  | The gene library: pure modules (shapes, seasons, query, rows, release index) and the D1 migrations behind them                                                                                                                                                                                                                                                            |
| `functions/`, `wrangler.toml` | The Cloudflare Pages Functions (release serving at `/v/`, `/s/` and `/next/`, the library API under `/api/`, `_middleware.js` adding the cross-origin isolation headers to every Functions response) and the D1 bindings; import `js/library/` only (docs/designs/deployment-and-community.md)                                                                            |
| `wasm/`                       | The Rust kernels crate (`src/`), the committed `blob-kernels.wasm`, its hash and the hash of its sources (docs/designs/wasm-kernels.md)                                                                                                                                                                                                                                   |
| `public/`                     | Static files served at the site root, including the database worker and `_headers` (the cross-origin isolation headers)                                                                                                                                                                                                                                                   |

## Commands

Every command with its flags is in [docs/commands.md](docs/commands.md) (`rg -n '^### ' docs/commands.md` lists them). The ones used in every session:

| Task                                | Command                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Install                             | `npm ci`                                                                                                                           |
| Run the app                         | `npm run dev` (Vite, http://localhost:5173)                                                                                        |
| Start a chunk                       | `scripts/task-start.sh <type>/<desc> [--plan <doc>] [--here]`                                                                      |
| Ship a chunk                        | `scripts/ship.sh --title <subject> --body <file> [--base main] [--no-merge]`                                                       |
| Pre-push check (what an agent runs) | `scripts/check.sh --fix --quick` (CI is the PR gate and runs everything)                                                           |
| Docs-only change                    | `scripts/check.sh --fix --docs`                                                                                                    |
| Tests                               | `npm test`; one file: `npx vitest run <file>`; one test: `npx vitest run -t '<name>'`; fast only: `TEST_SCOPE=fast npx vitest run` |
| Replay a world and log its events   | `npm run replay -- --seed <n> --ticks <n>`                                                                                         |
| Evaluate a policy on fixed seeds    | `npm run eval -- --seeds <n> --ticks <t> --policy <name>`                                                                          |
| Compare two eval reports            | `npm run eval:compare -- <before.json> <after.json>`                                                                               |
| Detach a long run, then wait        | `scripts/run-detached.sh <name> -- <cmd...>`, then `scripts/wait-run.sh <name> [--timeout <s>]`                                    |

## Build order

The **Build queue** in [docs/designs/README.md](docs/designs/README.md) is the order. It holds seven **lead** docs,
each with a unique `**Priority:**` rank (1 is next) and an `## Order` section. Every other `Proposed` or `In progress`
doc carries a `**Scheduled by:**` line and is built as that step of its lead, in step order
([docs/designs/STYLE.md](docs/designs/STYLE.md)). Each doc's `**Depends on:**` line is authoritative for what must be
built first. The newest file in `docs/handoffs/` says what is in flight and what is frozen.

A design doc's **Task breakdown** table is machine-read (`scripts/designs-index.mjs`, and `jmz plan run`): keep the
four columns (`#`, `Task`, `Nature`, `Depends on`), `T`-numbered ids and `[mechanical]` / `[judgement]` tags exact.

## Workflow

1. **Planning stage** - the `create-plan` skill writes `docs/designs/<feature>.md` with status `Proposed`: explore,
   one interview batch, draft, fresh-agent review, present for approval, commit on `docs/<doc-name>`. All the docs
   for a body of work are approved, and the user confirms the Build queue, before its code changes.
2. **Picking work back up** - the `resume-plan` skill re-validates the doc against `origin/main` and names the next
   phase.
3. **Build one chunk per branch and PR** - `scripts/task-start.sh <type>/<desc> --plan <doc>` makes the worktree and
   names the chunk; commit per task.
4. **Before pushing** - the `create-pr` skill: a plan-conformance review agent, measurements for the phase's Targets, the
   phase marked `(built)` and the status line moved in the same PR. Then `scripts/ship.sh --title <subject> --body <file>`
   runs the gate, pushes, opens the PR, turns on auto-merge and waits until it is merged or red (push and PR only when
   the user asks).
5. **Measuring a change** - the `run-evolution-loop` skill: check the detector first, prediction first, at least 16 seeds
   per arm, `eval:compare` verdicts, experiments recorded in `evals/experiments.json`; every outcome becomes tasks through
   its "Outcome to task" record.
6. **Something misbehaves** - the `debug-sim` skill: find the event in the logs, replay from seed and config,
   failing test, fix.
7. **Docs drift** - the `audit-docs` skill proposes fixes; nothing is applied without approval.

## Delegating to subagents

When one agent hands tasks to others (user, 2026-10-22):

- **One chunk at a time**, each branched from the latest `origin/main`. Parallel branches conflict in the config files
  and the plan doc, and the rework costs more than the parallelism saves.
- **Build in chunks (user, 2026-10-29).** One PR carries one chunk: 4 to 8 related tasks, usually most of a phase,
  built in order by one subagent on one branch, one commit per task. During the chunk each commit runs only the
  pre-commit hook (`scripts/check.sh --tier 1`), whose `test-related` gate runs the tests of the staged files, so the
  task's own tests run at commit time (`npx vitest run <files>` is for iterating before it, not a second run); the pre-push check
  (`scripts/check.sh --fix --quick`) runs once per chunk PR and CI runs the full gate. The delegating agent still reviews each task's commit against its
  plan row. Golden re-pins keep their own commit inside the chunk. Long runs stay separate: evals, screens and timing
  runs (quiet machine) never go in a code chunk; the one exception is a baseline re-record, a [mechanical] commit of its
  own inside an adopt chunk, run on a quiet machine under the CPU lock. A design doc lists its chunks in a "Chunks" table under each phase. A chunk with any [judgement] task is built by
  Sonnet; a chunk that is all [mechanical] goes to Haiku.
- **Pick the model by the task's tag.** `[mechanical]` tasks (run a command, re-pin, re-record, fill a table) go to
  Haiku; `[judgement]` tasks (deciding a verdict, diagnosis, review, optimisation) go to Sonnet. The delegating agent
  reviews every result before it merges.
- **Wait without polling.** Start a long run (evals, screens, the ladder, training, a performance gate) with
  `scripts/run-detached.sh <name> [--frozen] -- <cmd...>`, which writes `.runs/<name>.log` and `.runs/<name>.done` (the
  exit code) and records the run in `.runs/runs.json` (`$RUNS_DIR` moves the directory), and wait for it with
  `scripts/wait-run.sh <name> [--timeout <s>]`, which blocks until the `.done` file exists, prints the exit code and the
  log tail and exits with the run's code (124 on timeout, 125 when the run was killed). Never write a `nohup`, `until`
  or `pgrep -f` loop: a loop that matches itself never ends. `--frozen` copies the tree (minus `node_modules`, `.git`, `coverage`,
  `.sim`, `.checklogs` and the runs directory) into a new `.runs/frozen-<name>-<timestamp>` directory and runs from there; a name already used is
  refused, so two lanes cannot overwrite one run. Leave no waiting loops behind.
- **Never strand a run (user, 2026-10-23).** A subagent's background job finishing does not always wake the
  subagent. A subagent runs a command that takes under about 9 minutes in the foreground, and does not end its turn
  while one of its background jobs is still running. When a subagent starts a longer run with `run-detached.sh`, it ends
  its turn reporting the run name; the delegating agent starts its own `scripts/wait-run.sh <name>` in the background
  and resumes the subagent when it returns. Commit something on the branch first: a worktree with no commits is
  auto-deleted when the turn ends, and a non-frozen run dies with it.
- **Clean up after each merge (user, 2026-10-23).** Once a subagent's PR merges, remove its worktree with
  `git worktree remove <path>` (unlock it first if its locking process has exited). Never use `--force`: a worktree
  with uncommitted files is left for the user to inspect.
- **Summarise results with a script.** Extract the few numbers a decision needs from eval reports and logs into a
  short table instead of reading whole reports.
- **Only timing work needs a quiet machine.** Performance work (`npm run bench`, `bench-compare`, `bench:micro`,
  `perf:browser`, `alloc-check`) and the optional full local gate (`scripts/check.sh`, for perf PRs; its `bench-check` and slow-test timeouts
  fail under load) run through `flock /tmp/claude-1000/cpu.lock <cmd>` and only while no eval or screen is running.
  Evals, screens, the ladder and replays are deterministic whatever the load, so they run side by side and may fill
  the CPU.
- **Report once, briefly**: PR link, what changed, measurements, decisions, anything unsure.

## Hard rules

- A PR that changes sim, evo or brain behaviour names the scene it serves or the selection rule it enforces
  (`docs/principles.md`) in its body, and the detector metric that shows it.
- Never commit to `main`. Branch `<type>/<short-desc>` (`docs/<doc-name>` for design docs); conventional commit
  subjects; the "why" goes in commit and PR bodies.
- Push and open PRs only when the user asks. A manual deploy needs the user's ask; merging the release PR deploys production automatically (a merge to `main` does not; it deploys `/next/` through `preview.yml`, and a pull request from this repo deploys a preview). A change to `rulesHash` is a breaking commit (`!`) that targets `season/next`; while uploads are closed there is no season gap, so the season opens on `main` as soon as its keep-rule read is done, with retrained champions and the league required only from Phase 3 (`docs/designs/deployment-and-community.md` Phase 1c). `CHANGELOG.md` and the `package.json` version are written by the release PR only. Secrets live in GitHub and Cloudflare, never in the repo.
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
- Delete what a switch replaces (user, 2026-10-29). When a flag or option's new value becomes the default, the plan's
  cleanup deletes the old path and the flag once the runs that compare against it are done;
  a plan that adds flags carries that deletion task. A kept path needs a written reason in the plan's Decisions table.
  `scripts/flag-ledger.json` lists every boolean or enum config rule with its deletion task or its reason to stay, and
  the `conventions` gate fails a rule missing from it.
- Keep what does no harm (user, 2026-11-06, 2026-11-07 and 2026-11-11). Before deleting a mechanism, apply the keep
  rule in [docs/principles.md](docs/principles.md) ("A realistic mechanism stays"): a realistic mechanism is deleted
  only when `npm run eval:compare -- <before> <after> --keep-rule` reads `WORSE` on 64 matched floor-on seeds (`keepRule`
  in `js/evo/keep-rule.js`: an exact paired test on the hunters-alive, held and under-80 seeds, and an interval on each
  verified guard metric), or when nature does not do it. Read the smallest loss each guard prints: a guard that cannot
  see a loss of a quarter of the seeds has not shown no harm. Not moving its scene, a screen naming no finalist, worse
  point estimates and 8, 16 or 32 seed counts are not harm. A new brain input or a slower step is a cost and needs a
  scene metric to move. A plan row that says "delete on a fail" runs that check first; a kept mechanism keeps its switch
  until its bundle is read once with it off, then the switch is deleted.

## Coding standards

New code is small modules that each do one job and are tested on their own.

### Size limits (enforced)

| Limit                              | Value                                                                               | Gate                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| Lines per source file              | 300 (blank lines and comments excluded)                                             | `lint` (`max-lines`)              |
| Lines per test file                | 400                                                                                 | `lint` (`max-lines`)              |
| Lines per function                 | 50                                                                                  | `lint` (`max-lines-per-function`) |
| Cyclomatic complexity per function | 10                                                                                  | `lint` (`complexity`)             |
| Nesting depth                      | 3                                                                                   | `lint` (`max-depth`)              |
| Parameters per function            | 4 - pass an options object beyond that                                              | `lint` (`max-params`)             |
| Test file per module               | `js/sim/x.js` -> `test/sim/x.test.js`, same for `js/evo`                            | `conventions`                     |
| Files directly under `js/`         | None - code lives in `js/sim/`, `js/evo/`, `js/worker/`, `js/app/` or `js/library/` | `conventions`                     |

A test that runs a real world for many ticks, a worker pool or a full eval (about 0.5 s or more) goes in
`<module>.slow.test.js` beside the mirrored test; CI runs only the fast tests, every local run runs all
(`docs/designs/quality-gates-and-test-tiers.md`).

A limit is a signal to split, never a target to pad up to. Do not silence a limit with `eslint-disable`; split the
module or function instead.

Read [docs/coding-standards.md](docs/coding-standards.md) before writing code: module design, correctness,
hot-path performance, tests and reviews. In short: one job per module, pure core with a thin shell, fail loudly,
per-tick code allocates nothing, test behaviour against a naive reference for clever code, one task per commit.

## Debugging

Follow the `debug-sim` skill; for the app, the browser console and `window.__perf()` in dev builds.

## Environment and tools

WSL2 Ubuntu, native Linux paths only. Node 24 (`package.json` `engines`).

- Search: `rg` for text, `fd` for files, `ast-grep` (`sg`) for structural search and refactors.
- GitHub: `gh`.
- Tools installed through nvm appear only in a login shell - check with `bash -lic '<cmd>'`.
- WASM kernels: Rust 1.99.1 with the `wasm32-unknown-unknown` target through rustup in `~/.cargo/bin` (pinned by
  `wasm/rust-toolchain.toml`) and `wasm-opt` 120 at `/usr/bin`; only `scripts/build-wasm.sh` needs them, CI and `npm ci` use
  the committed binary.
- Telemetry: the Aspire CLI (a dotnet tool, so also login-shell only) runs the dashboard with `npm run aspire:dashboard`;
  `docker-compose.yml` does the same where Docker exists. `.mcp.json` registers `aspire agent mcp` against it, which
  reads logs and traces but not metrics. Metrics are opt-in: nothing is sent unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
