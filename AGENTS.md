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

- `docs/designs/` - design docs, plans and as-built descriptions; index [docs/designs/README.md](docs/designs/README.md).
  `STYLE.md` there holds the conventions (read before writing or editing any doc); `sim-notes.md` the verified platform
  and library facts and learnings from each phase.
- `docs/commands.md` - every command with its flags; `docs/agent-reference.md` - the long form of the delegating rules,
  the release rules, the keep rule and the environment notes below.
- `.claude/skills/` - workflow skills for agents working on this repo (below).
- `scripts/check.sh` - the local gate, which CI runs; `scripts/designs-index.mjs` - the design doc index and lint.
- `js/sim/`, `js/evo/` - the headless sim core and evolution (DOM-free and deterministic).
- `js/worker/` - the sim worker and its message protocol (imports `js/sim/` and `js/evo/`; no DOM).
- `js/app/` - the app on `index.html`: `main.js`, the frame loop, `renderer/` (`three/webgpu` and `three/tsl`, WebGL2
  fallback; docs/designs/crisp-renderer.md), `ui/` (imports `three/webgpu`, `three/tsl` and `js/worker/protocol.js`
  only), `pack/` (the pack worker; never imports `three`; docs/designs/pack-worker.md).
- `test/` - Vitest tests.
- `js/library/`, `migrations/` - the gene library (pure modules) and the D1 migrations behind them.
- `functions/`, `wrangler.toml` - the Cloudflare Pages Functions (`/v/`, `/s/`, `/next/`, `/api/`, `_middleware.js`
  adding the cross-origin isolation headers) and the D1 bindings; import `js/library/` only
  (docs/designs/deployment-and-community.md).
- `wasm/` - the Rust kernels crate, the committed `blob-kernels.wasm` and its hashes (docs/designs/wasm-kernels.md).
- `public/` - static files served at the site root, including the database worker and `_headers`.

## Commands

Every command with its flags is in [docs/commands.md](docs/commands.md) (`rg -n '^### ' docs/commands.md` lists them).
The ones used in every session:

- Install: `npm ci`. Run the app: `npm run dev` (Vite, http://localhost:5173).
- Start a chunk: `scripts/task-start.sh <type>/<desc> [--plan <doc>] [--here]`.
- Ship a chunk: `scripts/ship.sh --title <subject> --body <file> [--base main] [--no-merge]`.
- Pre-push check (what an agent runs): `scripts/check.sh --fix --quick`; CI is the PR gate: a pull request runs the tests its change reaches (`scripts/affected.mjs`), the push to `main` all of them.
- Docs-only change: `scripts/check.sh --fix --docs`.
- Tests: `npm test`; one file `npx vitest run <file>`; one test `npx vitest run -t '<name>'`; fast only
  `TEST_SCOPE=fast npx vitest run`.
- Replay a world: `npm run replay -- --seed <n> --ticks <n>`.
- Eval a policy: `npm run eval -- --seeds <n> --ticks <t> --policy <name>`; compare two reports:
  `npm run eval:compare -- <before.json> <after.json>`.
- Detach a long run, then wait: `scripts/run-detached.sh <name> -- <cmd...>`, then `scripts/wait-run.sh <name>`.

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

Full text: [docs/agent-reference.md](docs/agent-reference.md). The rules:

- **One chunk at a time per stream** (user, 2026-10-22), each branched from the latest `origin/main`. A stream is a
  lane handed to another session with a prompt (`docs/handoffs/TEMPLATE.md`, committed as
  `docs/handoffs/<YYYY-MM-DD>-<stream>.md` before it starts); streams run side by side only when their Owns paths are
  disjoint, since parallel branches in one path cost more in rework than they save.
- **One coordinator, one model family.** One session owns the queue, the ledger and every plan doc's status line.
  Streams are sessions of its model family; a session of another model family edits no plan doc and records no
  experiment (a flaky test or a renderer spike is its work).
- **Build in chunks** (user, 2026-10-29): one PR is one chunk of 4 to 8 related tasks, built in order by one subagent on
  one branch, one commit per task. Each commit runs the pre-commit hook; the pre-push check runs once per chunk PR and
  CI runs the full gate. The delegating agent reviews each task's commit against its plan row. Evals, screens and timing
  runs never go in a code chunk (a baseline re-record is the one exception).
- **Pick the model by the task's tag:** `[mechanical]` to Haiku, `[judgement]` to Sonnet; a chunk with any
  `[judgement]` task is Sonnet's. The delegating agent reviews every result before it merges.
- **Wait without polling.** Start a long run with `scripts/run-detached.sh <name> [--frozen] -- <cmd...>` and wait with
  `scripts/wait-run.sh <name> [--timeout <s>]`. Never write a `nohup`, `until` or `pgrep -f` loop; leave no waiting
  loops behind.
- **Never strand a run** (user, 2026-10-23). A subagent runs a command under about 9 minutes in the foreground and does
  not end its turn with a background job running; for a longer run it commits something, then ends its turn reporting
  the run name, and the delegating agent waits and resumes it.
- **Worker budget.** Run `npm run state` before a long run: it lists every run in flight on the machine, the worker
  budget and the workers free; pass `--workers <free>` (a lone run claiming under half of them gets a warning).
- **Clean up after each merge** (user, 2026-10-23): `scripts/worktree-gc.sh` removes the worktrees of merged PRs (class
  `safe`; `--list` shows every class and why a worktree is kept), never with `--force`.
- **Summarise results with a script**, not by reading whole reports.
- **Only timing work needs a quiet machine** (`bench`, `bench-compare`, `bench:micro`, `perf:browser`, `alloc-check`,
  the full local gate): run it through `flock /tmp/claude-1000/cpu.lock <cmd>` while no eval or screen runs. Evals,
  screens, the ladder and replays are deterministic and run side by side.
- **Report once, briefly**: PR link, what changed, measurements, decisions, anything unsure.

## Hard rules

- A PR that changes sim, evo or brain behaviour names the scene it serves or the selection rule it enforces
  (`docs/principles.md`) in its body, and the detector metric that shows it.
- Never commit to `main`. Branch `<type>/<short-desc>` (`docs/<doc-name>` for design docs); conventional commit
  subjects; the "why" goes in commit and PR bodies.
- Push and open PRs only when the user asks. A manual deploy needs the user's ask; merging the release PR deploys
  production. A change to `rulesHash` is a breaking commit (`!`) that targets `season/next`. `CHANGELOG.md` and the
  `package.json` version are written by the release PR only. Secrets live in GitHub and Cloudflare, never in the repo
  (details: [docs/agent-reference.md](docs/agent-reference.md)).
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
- Library and platform surprises go into `docs/notes/<YYYY-MM>.md` as `### YYYY-MM-DD - <topic>` entries (not into design
  docs), and `node scripts/notes-index.mjs --write` updates the index in `docs/designs/sim-notes.md` in the same commit.
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
  cleanup deletes the old path and the flag once the runs that compare against it are done; a kept path needs a written
  reason in the plan's Decisions table. `scripts/flag-ledger.json` lists every boolean or enum config rule and the
  `conventions` gate fails a rule missing from it.
- Keep what does no harm (user, 2026-11-06, 2026-11-07 and 2026-11-11). A realistic mechanism
  ([docs/principles.md](docs/principles.md), "A realistic mechanism stays") is deleted only when
  `npm run eval:compare -- <before> <after> --keep-rule` reads `WORSE` on 64 matched floor-on seeds, or when nature
  does not do it. Not moving its scene, a screen naming no finalist, worse point estimates and 8, 16 or 32 seed counts
  are not harm. A new brain input or a slower step is a cost and needs a scene metric to move. The full rule is in
  [docs/agent-reference.md](docs/agent-reference.md).

## Coding standards

New code is small modules that each do one job and are tested on their own.

### Size limits (enforced)

- Lines per source file 300 (blank lines and comments excluded), per test file 400 (`lint`, `max-lines`).
- Lines per function 50 (`max-lines-per-function`); cyclomatic complexity 10 (`complexity`); nesting depth 3
  (`max-depth`); parameters 4, pass an options object beyond that (`max-params`).
- Test file per module: `js/sim/x.js` -> `test/sim/x.test.js`, same for `js/evo` (`conventions`).
- No file directly under `js/`: code lives in `js/sim/`, `js/evo/`, `js/worker/`, `js/app/` or `js/library/`
  (`conventions`).

A test that runs a real world for many ticks, a worker pool or a full eval (about 0.5 s or more) goes in
`<module>.slow.test.js` beside the mirrored test; a pull request runs the tests its change reaches, every local run runs all
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
- WASM kernels (Rust, `wasm-opt`) are needed only by `scripts/build-wasm.sh`; CI and `npm ci` use the committed binary.
- Telemetry (Aspire dashboard, `.mcp.json`, OTLP opt-in): [docs/agent-reference.md](docs/agent-reference.md).
