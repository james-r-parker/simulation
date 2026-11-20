# Agent reference

Detail that [AGENTS.md](../AGENTS.md) summarises. AGENTS.md is read at the start of every session and stays under 16000 bytes; the full text of a rule or procedure lives here. Each section is the long form of the AGENTS.md section of the same name.

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

### Pushing, deploying and releases

Push and open PRs only when the user asks. A manual deploy needs the user's ask; merging the release PR deploys production automatically (a merge to `main` does not; it deploys `/next/` through `preview.yml`, and a pull request from this repo deploys a preview). A change to `rulesHash` is a breaking commit (`!`) that targets `season/next`; while uploads are closed there is no season gap, so the season opens on `main` as soon as its keep-rule read is done, with retrained champions and the league required only from Phase 3 (`docs/designs/deployment-and-community.md` Phase 1c). `CHANGELOG.md` and the `package.json` version are written by the release PR only. Secrets live in GitHub and Cloudflare, never in the repo.

## Boundaries

### Delete what a switch replaces (user, 2026-10-29)

When a flag or option's new value becomes the default, the plan's cleanup deletes the old path and the flag once the runs that compare against it are done; a plan that adds flags carries that deletion task. A kept path needs a written reason in the plan's Decisions table. `scripts/flag-ledger.json` lists every boolean or enum config rule with its deletion task or its reason to stay, and the `conventions` gate fails a rule missing from it.

### Keep what does no harm (user, 2026-11-06, 2026-11-07 and 2026-11-11)

Before deleting a mechanism, apply the keep rule in [docs/principles.md](principles.md) ("A realistic mechanism stays"): a realistic mechanism is deleted only when `npm run eval:compare -- <before> <after> --keep-rule` reads `WORSE` on 64 matched floor-on seeds (`keepRule` in `js/evo/keep-rule.js`: an exact paired test on the hunters-alive, held and under-80 seeds, and an interval on each verified guard metric), or when nature does not do it. Read the smallest loss each guard prints: a guard that cannot see a loss of a quarter of the seeds has not shown no harm. Not moving its scene, a screen naming no finalist, worse point estimates and 8, 16 or 32 seed counts are not harm. A new brain input or a slower step is a cost and needs a scene metric to move. A plan row that says "delete on a fail" runs that check first; a kept mechanism keeps its switch until its bundle is read once with it off, then the switch is deleted.

## Environment and tools

- WASM kernels: Rust 1.99.1 with the `wasm32-unknown-unknown` target through rustup in `~/.cargo/bin` (pinned by
  `wasm/rust-toolchain.toml`) and `wasm-opt` 120 at `/usr/bin`; only `scripts/build-wasm.sh` needs them, CI and `npm ci` use
  the committed binary.
- Telemetry: the Aspire CLI (a dotnet tool, so also login-shell only) runs the dashboard with `npm run aspire:dashboard`;
  `docker-compose.yml` does the same where Docker exists. `.mcp.json` registers `aspire agent mcp` against it, which
  reads logs and traces but not metrics. Metrics are opt-in: nothing is sent unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
