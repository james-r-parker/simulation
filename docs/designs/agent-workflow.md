# Agent workflow

**Status:** In progress - Phases 1 (the context diet) and 5 (start to merge) are built; Phase 3 (before the push) is next. The plan covers what every agent session reads, how an experiment is recorded and read back, what a branch learns before it pushes, how runs, worktrees and outside streams share the machine, and the two commands that take a chunk from a fresh branch to a merged PR.
**Validated:** 58f38443 (2026-11-20)
**Priority:** 3 - Workflow lead. Tooling that changes no sim rule; every session and every subagent pays the Phase 1 cost on its first token and every chunk ships through Phase 5, so both are built before the next training chunk
**Depends on:** [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)

> Companion to [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md), which owns the gates and CI jobs, and [dev-workflow-and-gate.md](dev-workflow-and-gate.md), which owns the workflow. This doc owns the files an agent reads, the experiment ledger, the pre-push checks that mirror CI's most common failures, and the commands that show what is running.

The repo is built by coding agents: a coordinator, its subagents, and outside streams started from a handoff prompt. Each one starts cold. This doc sets a size budget on what a cold start reads, makes an experiment a file with a typed outcome, runs CI's two most common failure classes before the push, and gives one command for the state of the machine.

## Order

This doc is a lead: it holds a rank in the Build queue, and the docs below are built as its steps, in order, after its own next work. A step doc keeps its own phases, tasks and status line.

Own work first: Phase 5 (start to merge), Phase 1 (context diet), Phase 3 (before the push), Phase 6 (affected tests in CI), then Phases 2 and 4.

| Step | Doc                                                                | Built when                                                                               |
| ---- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) | The rest of Phase 3; its merge-queue step is a user step this lead's `ship.sh` relies on |
| 2    | [v6-tidy-up-and-docs.md](v6-tidy-up-and-docs.md)                   | The last legacy and docs tasks (T7 to T10), after the context diet has moved the docs    |

## Scope

- In: `AGENTS.md` and its size budget, `docs/commands.md`, the notes files, `docs/principles.md` and the scene scorecard, the status-line cap, the experiment ledger, the pre-push `ratchet-related` gate, the test-data rule, the browser smoke retry, `npm run state`, `scripts/worktree-gc.sh`, the handoff template, the stream rules, `scripts/task-start.sh`, `scripts/ship.sh`, the `records` change scope, the test shard balance, the affected-tests selection in CI.
- Out: sim, evo and brain behaviour (`rulesHash` does not move), the gates of [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) other than the three named here, the trainer's verdict tools ([training-loop.md](training-loop.md)), agent permission settings (a user step, listed under Verification).

## Measured on 2026-11-20

| Reading                                                    | Value                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `AGENTS.md`                                                | 131830 bytes, loaded by every session and subagent                                  |
| `docs/designs/sim-notes.md`                                | 527198 bytes, 223 dated entries in one file                                         |
| `evals/experiments.json`                                   | 456498 bytes, 186 records, 26 commits in 5 days                                     |
| Experiment ids cited in a doc with no record               | E250 ([training-stages.md](training-stages.md))                                     |
| Records dated 2026-11-15 or later with an empty `verdicts` | 23 of 37                                                                            |
| Failed `check` runs, last 200                              | 35: coverage ratchet 14, browser smoke 10, branch tests 8, other 3                  |
| Longest PR, 500 to 541                                     | 545 minutes and 6 CI runs (tests that read `evals/train-tune.json`)                 |
| Worktrees                                                  | 42; 21 hold a merged branch and no uncommitted file                                 |
| Longest status line                                        | 2700 characters ([training-stages.md](training-stages.md))                          |
| PR create to merge, 39 merged PRs 500 to 541               | median 16 minutes, upper quartile 151, longest 545                                  |
| `check` on a green PR                                      | 7 to 9 minutes wall; `test shard-6` 6.0 to 8.6 minutes, the other shards 1.3 to 3.6 |
| `check` on a PR that adds one experiment record            | the full test matrix, 7 minutes (`eval/training-loop-t16a`)                         |
| PRs 534 to 539                                             | open 2.5 to 4.7 hours with green checks, merged together                            |
| Machine use during a 128-seed, 600000-tick eval pair       | 13% of 32 threads (`--workers 2` per arm)                                           |
| `docs/principles.md` "Now" column                          | E63 and E42, 2026-10-29; 14 of 16 "Known violations" rows read as fixed             |

## Context diet

### AGENTS.md

`AGENTS.md` holds what an agent needs before its first command: what the app is, where things are, the workflow, the hard rules, the boundaries, the size limits and the environment. The Commands table moves to `docs/commands.md`. `AGENTS.md` keeps a Commands section of at most 12 rows (install, run, the pre-push check, the docs check, tests, one file, one test, replay, eval, compare, detach and wait, state), each one line, and a link to `docs/commands.md`.

| File               | Budget      | Enforced by                                             |
| ------------------ | ----------- | ------------------------------------------------------- |
| `AGENTS.md`        | 16000 bytes | `scripts/check-conventions.sh` (`agents-size`)          |
| `docs/commands.md` | none        | `audit-docs` reads it where it read the AGENTS.md table |

`docs/commands.md` groups the commands under headings (Gate, Tests, Bench, Eval, Train, Probes and audits, Docs, Build and deploy). Each command is a `###` heading with its flags in a list, so `rg -n '^### ' docs/commands.md` lists every command and an agent reads one section.

### Notes

`docs/designs/sim-notes.md` keeps its `## Platform` section and becomes the index of the notes. Each dated entry moves to `docs/notes/<YYYY-MM>.md`, in date order. `sim-notes.md` lists one line per entry: the date, the topic and a link. A new entry is added to the month file and to the index in the same commit. `scripts/notes-index.mjs --write` regenerates the index from the month files and `--check` fails when it is stale; the `conventions` gate runs `--check`.

### Principles and the scene scorecard

`docs/principles.md` keeps the text that does not move with a run: Traits, Scenes, What to refuse, Selection, "Measure scenes, reward them almost never", and "How the principles are used". Three sections leave it.

| Section                    | New home                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| How each scene is detected | `docs/scene-scorecard.md`, generated                                                        |
| What the user flagged      | `docs/scene-scorecard.md`, generated (the N and G rows as a second table)                   |
| Known violations today     | `docs/designs/natural-selection.md`, as a section; the open rows (K7, K12, K16) stay linked |

`scripts/scene-scorecard.mjs --write` writes `docs/scene-scorecard.md` from the metric registry and the newest shared baseline report (`evals/power/defaults-floor-on-*.json`, the file `npm run baseline:table` reads).

- Each registry entry in `js/evo/metric-registry/` gains an optional `scenes` field: a list of scene names from a closed set (`SCENES` in `js/evo/metric-registry/scenes.js`, the 15 scenes plus the 5 N failures and 4 G goals).
- The scorecard prints one row per scene: its detectors, each with status, the baseline mean, the null share and the detectable change at 64 seeds, and a `state` column: `absent` (every detector null on at least half the seeds or reading 0), `present`, or `no verified detector`.
- `--check` fails when the file is stale; the `conventions` gate runs it. The baseline's `rulesHash` and experiment id head the file.

The three metric paragraphs under the Scenes table (flora, megafauna, disease) are deleted; their metrics carry the `scenes` field.

### Status lines

A `**Status:**` line holds at most 400 characters. `readStatus` in `scripts/design-docs/header.mjs` rejects a longer one. The detail names the built phases and the next task; a run's result is in its experiment record. Every doc over the cap is shortened in the task that adds the lint.

## Leads and steps

The Build queue holds lead docs only, seven on 2026-11-20: measurement, hunting, workflow, training, app, speed and world. Every other unbuilt doc carries a `**Scheduled by:**` line (the lead's link, a step number and a reason; [STYLE.md](STYLE.md)) in place of a `**Priority:**` line and is built as that step of its lead. The lead's `## Order` section says what comes first.

- `scripts/designs-index.mjs` renders each lead with its steps under it, and fails a step whose lead has no rank or whose step number repeats (`readScheduledBy` in `scripts/design-docs/header.mjs`, `scheduledSteps` in `scripts/design-docs/render-index.mjs`).
- A session builds the next step of a lead, in order, unless the user names another doc.
- `npm run state` prints each lead's next unbuilt task and its next step.
- Before this, the queue held 39 ranked docs and 24 were `In progress`.

## Experiment ledger

An experiment is one file, `evals/ledger/E<id>.json`. `evals/experiments.json` is deleted once the records are split.

| Field        | Change                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | new, required: `compare` (two eval reports), `ladder` (training runs), `diagnosis` (a cause found, no arm), `characterisation` (a reading, no arm) |
| `outcome`    | new, required: `adopted`, `not-adopted`, `falsified`, `no-verdict`, `finding`                                                                      |
| `plan`       | new, required from the first id the allocator issues: the design doc file name                                                                     |
| `task`       | new, optional: the task id in that doc                                                                                                             |
| `stream`     | new, optional: the lane that ran it                                                                                                                |
| `verdicts`   | required non-empty when `kind` is `compare`                                                                                                        |
| other fields | unchanged (`evals/experiments.schema.json` describes one record)                                                                                   |

- `scripts/experiment.mjs new --plan <doc> [--task <id>] [--stream <name>]` prints the next id and writes a record with `outcome` unset in the working tree. The next id is one above the highest `E<id>.json` on `origin/main` and on every `origin/*` branch (`git ls-tree`), so no range is reserved by hand. Two lanes can still draw one id before either pushes; the second PR then conflicts on the file name, and `scripts/experiment.mjs renumber <id>` gives the record the next id and rewrites the branch's citations of it.
- `scripts/experiment.mjs list [--plan <doc>] [--since <date>] [--outcome <o>]` prints one line per record: id, date, plan, task, kind, outcome and the first 100 characters of the hypothesis.
- `scripts/experiment.mjs tally [--since <date>]` prints the count per `outcome` and per plan.
- `scripts/check-experiments.mjs` validates every file, requires the file name to match the id, and fails on an id cited in `docs/**/*.md` or `AGENTS.md` (pattern `\bE\d+\b`) that has no record. Ids below 151 are exempt from the citation check.
- Readers of the old file (`scripts/check-metric-names.mjs`, `scripts/check-conventions.sh`, `scripts/lib/train-tune-report.mjs`, `test/check-metric-names.test.js`, the `run-evolution-loop` and `resume-plan` skills) read the directory through `readLedger` in `scripts/lib/ledger.mjs`.
- E250 is backfilled from commit 3dc3a220 and `evals/decisions/`.

## Before the push

### `ratchet-related`

The quick gate (`scripts/check.sh --fix --quick`) gains a `ratchet-related` gate. It runs the tests of the files changed against `origin/main` (`vitest related` on the changed files, as the pre-commit `test-related` gate in `scripts/check.sh` does) with coverage, and compares each changed source file under a directory whose baseline in `scripts/quality-baseline.json` is 100% against 100%. A miss prints the file, the measure and the uncovered lines or branches. It skips with a notice when no such file changed. `scripts/quality-ratchet.mjs --check` prints the same per-file detail when the merged CI coverage misses, so the `coverage` job log names the file.

### Tests read fixtures

A test reads no shipped data file that a non-code PR edits. `scripts/check-conventions.sh` (`test-data`) fails a file under `test/` that reads `evals/train-tune.json`, `evals/train-ladder*.json`, `evals/train-curriculum*.json`, `evals/stages/`, `evals/train-screens/` or `evals/ledger/`, except a test named `*.shipped.test.js`, which asserts only that the shipped file parses and validates. The tests that read those files today move to copies under `test/fixtures/`.

### Browser smoke

`scripts/browser-smoke.sh` reruns a failed spec once. A spec that passes on the rerun passes the gate and writes its name, error and trace path to `.checklogs/smoke-flakes.json`; CI uploads the file as the `smoke-flakes` artifact. A `smoke-flakes` job in `nightly.yml` downloads that artifact from the last 7 days of `check` runs (`gh run download`) and opens or updates one issue listing the specs that flaked. A spec that fails twice fails the gate.

### Release PR

The `check` workflow runs `scope` only on the Release Please branch (`release-please--*`): `scripts/change-scope.sh` reports `release` when the diff touches only `CHANGELOG.md`, `package.json`, `package-lock.json` and `.release-please-manifest.json`. Any other file in the diff runs the full gate.

## The state of the machine

### `npm run state`

`scripts/state.mjs` prints, and with `--json` writes, one page. It writes no file in the repo.

| Block         | Source                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue         | the first 5 Build queue rows and each doc's next unbuilt task (`scripts/design-docs/parse-doc.mjs`)                                                   |
| Runs          | every `.runs/runs.json` under each `git worktree list` path: name, command, workers, started, done or in flight, seeds done where the log prints them |
| Machine       | threads, load, the worker budget (`defaultWorkers` in `scripts/lib/worker-pool.mjs`), workers claimed by in-flight runs, workers free                 |
| Ladder        | the newest `evals/train-screens/results/*/yield.json`: pass share per stage for its reference arm                                                     |
| Experiments   | the last 10 ledger records (`experiment.mjs list`) and the `tally` since 7 days                                                                       |
| Pull requests | open PRs with their check state (`gh pr list`), skipped when `gh` is absent                                                                           |
| Worktrees     | counts by class from `worktree-gc.sh --list`                                                                                                          |

`scripts/run-detached.sh` records `workers` in `runs.json` (parsed from `--workers <n>`, else the command's default). It prints one warning line when the run asks for fewer than half the free workers and no other run is in flight.

### `scripts/worktree-gc.sh`

`scripts/worktree-gc.sh --list` classes every worktree; with no flag it removes the `safe` class with `git worktree remove` (never `--force`) and deletes their local branches.

| Class      | Rule                                                                                         | Action       |
| ---------- | -------------------------------------------------------------------------------------------- | ------------ |
| `safe`     | branch has a merged PR, `git status --porcelain` is empty, no run in flight from its `.runs` | removed      |
| `dirty`    | uncommitted files                                                                            | listed, kept |
| `unmerged` | commits not on `origin/main` and no merged PR                                                | listed, kept |
| `live`     | a run in flight, or the worktree of the calling session                                      | kept         |

### Streams and handoffs

A stream is a lane given to another session with a prompt. One coordinator session owns the queue, the ledger and every plan doc's status line; streams are sessions of the coordinator's model family and report to it. A session of another model family takes only work that edits no plan doc and records no experiment (a flaky test, a renderer spike), since it does not load the skills and the memory the workflow rests on. `docs/handoffs/TEMPLATE.md` is the prompt's form, and each handoff is committed as `docs/handoffs/<YYYY-MM-DD>-<stream>.md` before the stream starts.

| Template field  | Content                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| Goal and done   | the plan doc, the task ids, and the reading that ends the stream                            |
| Owns            | the paths the stream may edit; two live streams own no path in common                       |
| Worker budget   | the `--workers` number for its long runs, from `npm run state`                              |
| Experiment ids  | "allocate with `scripts/experiment.mjs new`"                                                |
| Before it stops | commit, open a PR, write what is running (run names) and what is next into the handoff file |
| Ruled out       | the levers already falsified, by experiment id                                              |

`AGENTS.md` "Delegating to subagents" states the rule as built: one chunk per branch; streams run side by side when their Owns paths are disjoint; the plan doc and the ledger are edited by one stream at a time (the ledger no longer conflicts, since each record is a file).

## Start to merge

Two commands bracket a chunk. Neither changes a rule: a push and a PR still need the user's ask or a standing instruction, and `main` is never committed to.

### `scripts/task-start.sh`

`scripts/task-start.sh <type>/<short-desc> [--plan <doc>] [--here]` fetches `origin`, creates the branch from `origin/main` in a new worktree under `.claude/worktrees/` (`--here` uses the current worktree and fails when it has commits `origin/main` lacks), and makes `node_modules` ready: a hard-link copy of the main checkout's `node_modules` (without `node_modules/.vite` and `node_modules/.cache`, which are written in place) when both `package-lock.json` files hash the same, else `npm ci`. With `--plan` it prints the doc's status line, its next unbuilt chunk and that chunk's task rows. It prints the worktree path last.

### `scripts/ship.sh`

`scripts/ship.sh --title <subject> --body <file> [--base <branch>] [--no-merge]` takes a committed branch to a merged PR and blocks until it is merged or red.

| Step | Does                                                                                                                                                                                       | Stops with                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | fails on uncommitted files or a branch named `main`                                                                                                                                        | exit 2 and the file list                                                                                                                       |
| 2    | merges `origin/<base>` into the branch when it is behind (a merge commit, never a rebase or a force push)                                                                                  | exit 3 and the conflicted paths                                                                                                                |
| 3    | runs the gate the change scope needs: `scripts/check.sh --fix --docs` for `docs` and `records`, else `scripts/check.sh --fix --quick` (with `ratchet-related`); commits what `--fix` wrote | exit 4 and the failed gates                                                                                                                    |
| 4    | checks the body file against the `create-pr` template: a sim, evo or brain diff names a scene or selection rule and a detector metric                                                      | exit 5 and the missing section                                                                                                                 |
| 5    | pushes, opens the PR (or finds the open one for the branch), and turns on auto-merge with a merge commit unless `--no-merge`                                                               | exit 6 and the `gh` error                                                                                                                      |
| 6    | waits with `gh pr checks <n> --watch --fail-fast`; no loop is written                                                                                                                      | on red: exit 1, the failed job names and the last 40 lines of each from `gh run view --log-failed`                                             |
| 7    | confirms the PR state is `MERGED`, then prints the PR link and the minutes from push to merge                                                                                              | exit 7 when the checks are green and the PR is not merged after 10 minutes, with the blocking reason from `gh pr view --json mergeStateStatus` |

A rerun of `scripts/ship.sh` after a fix commit resumes at step 2 on the same PR. Each run appends one line to `.checklogs/ship.jsonl` (`branch`, `pr`, `scope`, `ciRuns`, `minutes`, `result`), and `npm run state` prints the median minutes and the first-run green share of the last 20.

### CI wall time

- `scripts/change-scope.sh` reports `records` for a diff that touches only `evals/ledger/`, `evals/decisions/` and `docs/` (no test reads those once T18 is built). `check.yml` runs the `docs` gate plus `scripts/check-experiments.mjs` and `scripts/check-metric-names.mjs` for it, with no test matrix.
- The test files of `test shard-6` that take over 60 s move to a named heavy shard, as `heavy-train` and `heavy-train-pool` are, so no shard runs over 4 minutes on a quiet runner. `test/workflows/` pins the shard list.

## Affected tests in CI

`scripts/change-scope.sh` knows two scopes: `docs` (Markdown only) and `full`. Anything else runs 8 shards, 3 heavy jobs and 5 statistical jobs. PR 545 changed `scripts/design-docs/` and one test file and ran all 16; the tests its change can reach are one file.

A pull request runs the tests its change can reach. The full suite runs once on the merged result, so `main` is still fully tested.

### What a change can reach

`scripts/lib/affected.mjs` exports `affectedTests(changedPaths)`, which returns `{mode, tests, why}`.

| Mode       | When                                                                                                                                                                                                                                                                                              | Runs                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `docs`     | as today                                                                                                                                                                                                                                                                                          | the docs gate                                                  |
| `records`  | only `evals/ledger/`, `evals/decisions/` and `docs/` (T30)                                                                                                                                                                                                                                        | the docs gate and the ledger checks                            |
| `full`     | any path on the full list: `package.json`, `package-lock.json`, `vitest.config.js`, the ESLint and TypeScript configs, `.github/workflows/`, `scripts/check.sh`, `scripts/lib/test-scope.mjs`, `wasm/`, `js/sim/wasm-binary.js`, `test/helpers/`, `.node-version`; or an empty or unreadable diff | every shard, heavy and statistical job                         |
| `affected` | everything else                                                                                                                                                                                                                                                                                   | the reached test files, in as many shards as their count needs |

The reached set is the union of three sources:

- **Imports.** The test files whose module graph holds a changed file (`vitest related`, the selection the pre-commit `test-related` gate uses).
- **Changed tests.** Every changed file under `test/`.
- **Data and spawned scripts.** `test/data-deps.json` maps each test file to the non-module paths it reads (fixtures, `evals/` files, `bench/` baselines, docs) and the scripts it spawns. `scripts/data-deps.mjs --write` generates it by scanning the tests for `readFileSync`, `new URL(..., import.meta.url)`, `spawnSync` and `execFileSync` arguments; `--check` fails when it is stale and the `conventions` gate runs it. A test that builds a path the scan cannot resolve declares it in a `// reads: <glob>` comment, and the scan fails a test with an unresolved dynamic path and no declaration.

A heavy or statistical file runs in its own job only when it is in the reached set. A change under `js/sim/` or `js/evo/` reaches most of the suite through imports, so sim and evo work keeps today's coverage; app-only, script-only and worker-only changes do not pay for it.

### The jobs

- The `scope` job runs `scripts/affected.mjs <base>` and writes the mode, the test list (an artifact) and a matrix sized to it: one shard per 60 reached files, at most 8, plus one job per reached heavy or statistical file.
- `static` runs as today (conventions, format, lint, typecheck, deps, dupes, build, eval-smoke): it is 1.5 minutes and catches what tests do not.
- `coverage` on a pull request runs the per-file ratchet on the changed source files (`ratchet-related`, T17). The whole-suite ratchet runs with the full suite.
- The full suite, the whole-suite ratchet and the browser smoke run on every push to `main`. The repository is owned by a user account, where GitHub offers no merge queue, and the `main` ruleset does not require an up-to-date branch, so the push to `main` is the first run of the merged result. A red full run on `main` opens an issue that names the merge commit and the failed test.

### The miss ledger

An affected run that passes where the full run on the merged result fails is a miss: an edge the selection did not see. The full run compares its failed files with the pull request's reached list (the artifact) and, for a file that was not reached, appends `{pr, test, changed}` to the issue and fails the `data-deps` check until the edge is declared. The reading that keeps the selection honest is misses per 100 merged pull requests; above 2 the full list grows.

## Phases

### Phase 1 - Context diet (built)

**Targets:** none - it moves no sim, bench or browser metric; its readings are `AGENTS.md` at or under 16000 bytes, a generated `docs/scene-scorecard.md`, and no status line over 400 characters

| Chunk | Tasks     | Builder |
| ----- | --------- | ------- |
| A     | T1 to T4a | Sonnet  |
| B     | T5 to T9  | Sonnet  |

### Phase 2 - Experiment ledger

**Targets:** none - it changes how results are stored; its readings are `scripts/experiment.mjs tally` printing every record's outcome and `check-experiments` failing a cited id with no record

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| C     | T10 to T15 | Sonnet  |

### Phase 3 - Before the push

**Targets:** none - it moves no sim metric; its readings are a `records` PR finishing `check` in under 2 minutes and the share of failed `check` runs by class over the 200 runs after it merges, against 14 ratchet, 10 smoke and 8 branch-test failures in the 200 before

| Chunk | Tasks           | Builder |
| ----- | --------------- | ------- |
| D     | T16 to T21, T30 | Sonnet  |

### Phase 4 - The state of the machine

**Targets:** none - it moves no sim metric; its readings are `npm run state` listing every in-flight run on the machine and `worktree-gc.sh` leaving no `safe` worktree

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| E     | T22 to T27 | Sonnet  |

### Phase 5 - Start to merge (built)

**Targets:** none - it moves no sim metric; its readings are the upper quartile of PR create to merge over the 20 chunk PRs after it merges (against 151 minutes), `check` wall time on a green PR (against 7 to 9 minutes), and no test shard over 4 minutes

| Chunk | Tasks                | Builder |
| ----- | -------------------- | ------- |
| F     | T28, T29, T31 to T33 | Sonnet  |

### Phase 6 - Affected tests in CI

**Targets:** none - it moves no sim metric; its readings are the median `check` wall time of pull requests by mode (against 7 to 9 minutes for every non-docs pull request), the jobs run per pull request (against 16 test jobs), and misses per 100 merged pull requests (at most 2)

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| G     | T34 to T40 | Sonnet  |

#### Replay of the last 100 merged pull requests (T36)

Read on 2026-11-20 with `scripts/lib/affected.mjs` on the tree of each merge commit (pull requests 456 to 561): the diff is the merge commit against its first parent, the suite is the test files of that tree, and the data map is a fresh scan of it. `gh run list` gave 37 failed `pull_request` runs of these pull requests; `gh run view --log-failed` named the failing test files, and each failing head commit was replayed on its own tree and diff (every head was still in the repository, so no run was left out).

| Mode       | Pull requests | Reading                                                                                                                                                                                                                                                        |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs`     | 16            | no test job                                                                                                                                                                                                                                                    |
| `records`  | 1             | no test job                                                                                                                                                                                                                                                    |
| `full`     | 20            | 8 on `package.json` or `package-lock.json` (6 only add an npm script, 1 is a dependency bump, 1 the release), 6 on `.github/workflows/`, 2 on the ESLint config, 1 each on `vitest.config.js`, `scripts/check.sh`, `test/helpers/` and `js/sim/wasm-binary.js` |
| `affected` | 63            | median 50 test files of about 880 (6.3%), mean 17%; 28 reach 5% or less, 45 reach 25% or less, 6 reach over half (up to 632 files, a `js/sim` change)                                                                                                          |

The `test` matrix: the 63 `affected` pull requests ran a median of 2 jobs (30 of them 1, the largest 18), against 18 for every one of the 83 non-docs pull requests today (8 shards, 5 heavy, 5 statistical). Counting each `full` pull request as 18, the median over the 83 is 5 jobs and the mean 8.6.

Each historical test failure, replayed on the diff of the head commit that failed:

| Pull request | Failing test                                                                              | Head diff mode             | Reached                                                  |
| ------------ | ----------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------- |
| 483          | `test/check-hook-env.test.js`                                                             | `full`                     | yes                                                      |
| 486          | `test/evo/anti-exploit.slow.test.js`, `test/evo/trainer.slow.test.js`                     | `full`                     | yes                                                      |
| 504          | `test/train-exam.slow.test.js`                                                            | `full`                     | yes                                                      |
| 516 (5 runs) | `test/train-tune.test.js`, `test/train-tune-world.test.js`                                | `full` (4), `affected` (1) | yes                                                      |
| 521          | `test/train-tune.test.js`, `test/evo/train-tune.test.js`, `test/train-tune-world.test.js` | `full`                     | yes                                                      |
| 539          | `test/release-check.slow.test.js`                                                         | `affected`                 | no, then yes: it reads the git history, not a file       |
| 553          | `test/metric-noise.test.js`                                                               | `affected`                 | no, then yes: the script it spawns reads `docs/designs/` |

Thirteen of the 15 failing test files were on a head whose diff was on the full list, so the full suite would have run them. Two were unreached by the first version of the selection and are fixed before T37:

- `test/release-check.slow.test.js` passes or fails on the checkout's ancestry (`origin/main`, `origin/season/next`), which no changed path predicts. It declares `// reads: **`, and a test that declares `**` runs for every `affected` change.
- `test/metric-noise.test.js` spawns `scripts/metric-noise.mjs`, which reads `docs/designs/*.md`, a path the test never names. The scan now also covers the modules and scripts a test imports or spawns (`scripts/lib/module-reads.mjs`): a test is reached when a module in its graph, or in the graph of a script it spawns, reads the changed path. The scan also reads a path under a root variable (`${ROOT}docs/designs/${name}`).

After both fixes every failure above is reached. Failures that were not tests: 17 runs failed only the `coverage` job, on a whole-directory ratchet drop (`js/evo` 8, `js/app` 4, `scripts` 4, `js/worker` 2; one run dropped two directories), and each pull request had changed a file in the directory it dropped. `ratchet-related` (T17) holds a changed file under a 100% baseline (`js/sim`, `js/evo`, `js/worker`, `js/app`) to 100% on the pull request. The four `scripts` drops are an aggregate baseline (96.06% lines) that `ratchet-related` does not hold per file, so the whole-suite ratchet on the push to `main` reads them and they count in the miss ledger. Eight further runs failed `static`, `browser-smoke`, `perf` or `check` alone, which the selection does not change.

Six of the 20 `full` pull requests changed `package.json` only to add an npm script. A `package.json` diff inside `scripts` could read as `affected` (the tests that read `package.json` are in the data map); it stays on the full list until the miss ledger has a month of readings.

## Decisions

| Decision                                                               | Holds because                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run state` prints and commits nothing                             | [STYLE.md](STYLE.md) keeps no state file; the page is derived from git, the run registries and the ledger                                                                                                                                           |
| The ledger is a directory, with no reserved ranges                     | a record per file cannot conflict, and the allocator reads every remote branch                                                                                                                                                                      |
| The scorecard is generated                                             | a hand-kept "Now" column went 22 days without an update                                                                                                                                                                                             |
| `ship.sh` merges the base in and never rebases                         | a force push is refused in agent sessions, and three PRs were closed and reopened over it (472, 506, 512)                                                                                                                                           |
| A pull request runs affected tests and the merged result runs them all | a selection by imports can miss an edge; the full run on the merged result catches it before the next change builds on it, and the miss ledger closes the edge                                                                                      |
| No merge queue                                                         | GitHub offers it only to organisation-owned repositories; this one is owned by a user account. The ruleset's required checks are not strict, so a green PR merges without an up-to-date branch, and the full run on `main` checks the merged result |
| Agent permissions stay a user step                                     | a plan does not edit the settings that bound the agents that build it                                                                                                                                                                               |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Scripts only: `scripts/notes-index.mjs`, `scripts/scene-scorecard.mjs`, `scripts/experiment.mjs`, `scripts/lib/ledger.mjs`, `scripts/state.mjs`, `scripts/worktree-gc.sh`, `scripts/task-start.sh`, `scripts/ship.sh`, `scripts/lib/ship-steps.mjs` (the step logic, pure, with `gh` and `git` injected); edits to `.github/workflows/check.yml`, `scripts/check-conventions.sh`, `scripts/check-experiments.mjs`, `scripts/quality-ratchet.mjs`, `scripts/check.sh`, `scripts/browser-smoke.sh`, `scripts/change-scope.sh`, `scripts/run-detached.sh`, `scripts/design-docs/header.mjs`. In `js/evo/metric-registry/`: `scenes.js` and the `scenes` field, read by no sim or evo code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Unit tests              | `test/check-conventions.test.js` (`agents-size` over and under budget; `test-data` on a reading test and on a `*.shipped.test.js`). `test/notes-index.test.js` (index from month files, stale index fails). `test/scene-scorecard.test.js` (`absent`, `present`, `no verified detector` from a fixture registry and report; an unknown scene name throws). `test/evo/metric-registry/index.test.js` (every `scenes` value is in `SCENES`; every scene has at least one metric). `test/designs-index.test.js` (a 401-character status fails). `test/experiment.test.js` (next id over branches from a fixture repo, `list` filters, `tally`). `test/check-experiments.test.js` (file name against id, empty `verdicts` on `compare`, cited id with no record, exempt ids). `test/quality-ratchet.test.js` (per-file detail on a miss). `test/check-ratchet-related.test.js` (skip notice, miss names the file). `test/change-scope.test.js` (`release` for the two-file diff only). `test/browser-smoke-retry.test.js` (pass on rerun records a flake; two failures fail). `test/state.test.js` (each block from fixtures; `gh` absent). `test/worktree-gc.test.js` (the four classes on a fixture repo; a dirty worktree is never removed). `test/run-detached.test.js` (`workers` recorded; the warning line). `test/task-start.test.js` (fresh base, `--here` on a diverged tree fails, the lock-hash branch). `test/ship-steps.test.js` (each exit code from a stubbed `gh` and `git`; the body check on a sim diff; resume finds the open PR; a red check prints the job names). `test/change-scope.test.js` (`records` for ledger and docs paths, not when a `js/` file is in the diff). `test/workflows/check.test.js` (the shard list; `records` runs no matrix) |
| Headless e2e            | N/A - no sim code changes; the golden hashes and `eval-smoke` are untouched and still run in the gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | No `bench.*` or `browser.*` change. `ratchet-related` adds at most 60 s to the quick gate on a 10-file change; `conventions` adds under 2 s for the three new checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Evolution metrics       | N/A - no behaviour changes, so no `eval:compare` is owed; the `scenes` field is metadata                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Determinism             | N/A - no RNG stream is touched. The generated files are byte-stable: sorted keys, sorted rows, no timestamp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Config and persistence  | No `createConfig` key. Saved formats: `evals/ledger/E<id>.json` (one record, schema in `evals/experiments.schema.json`), `runs.json` gains `workers`, `.checklogs/smoke-flakes.json` (`spec`, `error`, `trace`, `sha`), `.checklogs/ship.jsonl` (one line per `ship.sh` run)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Logging and diagnostics | No sim log event. Each script exits 1 with the offending file and rule on its failure path: `agents-size` prints bytes over budget, `test-data` the test and the path it reads, `check-experiments` the citing doc and id, `ratchet-related` the file and uncovered lines, `worktree-gc.sh` the class and reason per kept worktree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Browser compatibility   | N/A - no app code changes; the smoke retry runs the same Chromium specs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Docs                    | `AGENTS.md`, `docs/commands.md` (new), `docs/principles.md`, `docs/scene-scorecard.md` (new, generated), `docs/notes/` (new), `docs/designs/sim-notes.md`, `docs/designs/natural-selection.md`, `docs/designs/STYLE.md` (the status cap, the notes home), `docs/handoffs/TEMPLATE.md` (new), the `run-evolution-loop`, `create-pr`, `create-plan`, `resume-plan` and `audit-docs` skills, `README.md`. Once `Implemented` this doc describes the files an agent reads and the ledger, state and clean-up commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Verification            | `scripts/check.sh --fix --quick` green on each chunk and CI `check` green; the walk under Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Task breakdown

### Phase 1 - Context diet

| #   | Task                                                                                                                                                                                                                                  | Nature       | Depends on          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| T1  | (built) Move the Commands table to `docs/commands.md` under the eight headings, one `###` per command; leave the 12-row table and the link in `AGENTS.md`; point `audit-docs` and the skills at the new file                          | [judgement]  | -                   |
| T2  | (built) Add the `agents-size` check (16000 bytes) to `scripts/check-conventions.sh` with its tests; trim `AGENTS.md` under it without dropping a hard rule or a boundary                                                              | [judgement]  | T1                  |
| T3  | (built) Add `scripts/notes-index.mjs`; move every dated entry to `docs/notes/<YYYY-MM>.md` in date order; regenerate `sim-notes.md` as the index; run `--check` in `conventions`; update the notes rule in `AGENTS.md` and `STYLE.md` | [mechanical] | -                   |
| T4  | (built) Add the 400-character status cap to `readStatus` with its test and shorten every doc over it                                                                                                                                  | [judgement]  | -                   |
| T4a | (built) The `**Scheduled by:**` line, the lead and step rendering of the Build queue and their tests; `STYLE.md` and the `AGENTS.md` Build order state the rule                                                                       | [judgement]  | -                   |
| T5  | (built) Add `SCENES` in `js/evo/metric-registry/scenes.js` and the optional `scenes` field, with the registry tests                                                                                                                   | [mechanical] | -                   |
| T6  | (built) Tag every registry metric the three principles tables and the flora, megafauna and disease paragraphs name with its scenes                                                                                                    | [judgement]  | T5                  |
| T7  | (built) Add `scripts/scene-scorecard.mjs` (`--write`, `--check`), its tests, the generated `docs/scene-scorecard.md`, and the `conventions` check                                                                                     | [judgement]  | T6                  |
| T8  | (built) Cut `docs/principles.md` to the stable sections, link the scorecard, move "Known violations today" to `natural-selection.md`, and fix every link to the moved sections                                                        | [judgement]  | T7                  |
| T9  | (built) Conformance review of Phase 1                                                                                                                                                                                                 | [judgement]  | T2, T3, T4, T4a, T8 |

### Phase 2 - Experiment ledger

| #   | Task                                                                                                                                                                                                      | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T10 | Add `readLedger` in `scripts/lib/ledger.mjs` (it reads `evals/ledger/` when the directory exists, else `evals/experiments.json`) and move every reader to it, with tests of both sources                  | [mechanical] | -          |
| T11 | Split `evals/experiments.json` into `evals/ledger/E<id>.json`, delete the old file and `readLedger`'s old-file branch, make the schema describe one record, and move `check-experiments` to the directory | [mechanical] | T10        |
| T12 | Add `kind`, `outcome`, `plan`, `task` and `stream` to the schema; backfill `kind` and `outcome` on every record from E151 and `plan` where the hypothesis names it; backfill E250                         | [judgement]  | T11        |
| T13 | Add `scripts/experiment.mjs` (`new`, `list`, `tally`, `renumber`) with tests                                                                                                                              | [judgement]  | T12        |
| T14 | Add the cited-id check and the `compare` needs `verdicts` check to `check-experiments`, with tests; update the `run-evolution-loop` skill and `docs/commands.md`                                          | [mechanical] | T12        |
| T15 | Conformance review of Phase 2                                                                                                                                                                             | [judgement]  | T13, T14   |

### Phase 3 - Before the push

| #   | Task                                                                                                                                                                       | Nature       | Depends on              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| T16 | (built) Print the per-file detail from `scripts/quality-ratchet.mjs --check` on a miss, with tests                                                                         | [judgement]  | -                       |
| T17 | (built) Add the `ratchet-related` gate to `scripts/check.sh --quick` with tests; update the `create-pr` skill                                                              | [judgement]  | T16                     |
| T18 | (built) Move every test that reads a shipped `evals/` data file to `test/fixtures/`, add `*.shipped.test.js` where a shipped file needs a parse check, and add `test-data` | [judgement]  | -                       |
| T19 | (built) Rerun a failed smoke spec once, write `.checklogs/smoke-flakes.json`, upload it in CI and list flaked specs in the `nightly-failure` issue, with tests             | [judgement]  | -                       |
| T20 | (built) Report `release` from `scripts/change-scope.sh` for the Release Please diff and run `scope` only for it in `check.yml`, with tests                                 | [mechanical] | -                       |
| T30 | Report `records` from `scripts/change-scope.sh` and run the docs gate plus the two ledger checks for it in `check.yml`, with tests                                         | [judgement]  | T11, T14, T18           |
| T21 | Conformance review of Phase 3, with the failure-class count of the 200 `check` runs before                                                                                 | [judgement]  | T17, T18, T19, T20, T30 |

### Phase 4 - The state of the machine

| #   | Task                                                                                                                                                                      | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T22 | Record `workers` in `runs.json` and print the under-use warning in `scripts/run-detached.sh`, with tests                                                                  | [mechanical] | -          |
| T23 | Add `scripts/worktree-gc.sh` (`--list`, remove `safe`) with tests on a fixture repo                                                                                       | [judgement]  | -          |
| T24 | Add `scripts/state.mjs` and `npm run state` with tests for each block                                                                                                     | [judgement]  | T22, T23   |
| T25 | Add `docs/handoffs/TEMPLATE.md`; rewrite "Delegating to subagents" in `AGENTS.md` for streams (one coordinator, one model family), the worker budget and `worktree-gc.sh` | [judgement]  | T24        |
| T27 | Conformance review of Phase 4, with `scripts/worktree-gc.sh` run on the machine and the class counts before and after in the PR body                                      | [judgement]  | T24, T25   |

### Phase 5 - Start to merge (built)

| #   | Task                                                                                                                                                                  | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T28 | Add `scripts/task-start.sh` with tests on a fixture repo                                                                                                              | [judgement]  | -          |
| T29 | Add `scripts/lib/ship-steps.mjs` and `scripts/ship.sh` (steps 1 to 7, the exit codes, `.checklogs/ship.jsonl`) with tests on stubbed `gh` and `git`                   | [judgement]  | -          |
| T31 | Move the test files of `test shard-6` over 60 s to a named heavy shard and pin the shard list in `test/workflows/`; record the shard times before and after in the PR | [mechanical] | -          |
| T32 | Rewrite the `create-pr` and `resume-plan` skills and the `AGENTS.md` workflow around `task-start.sh` and `ship.sh`; add both to `docs/commands.md`                    | [judgement]  | T28, T29   |
| T33 | Conformance review of Phase 5                                                                                                                                         | [judgement]  | T31, T32   |

### Phase 6 - Affected tests in CI

| #   | Task                                                                                                                                                                                                                                                                                                | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T34 | (built) Add `scripts/data-deps.mjs` (`--write`, `--check`), the `// reads:` declaration, the generated `test/data-deps.json` and the `conventions` check, with tests on fixture test files                                                                                                          | [judgement]  | T18        |
| T35 | (built) Add `scripts/lib/affected.mjs` and `scripts/affected.mjs`: the four modes, the full list, the three sources and the matrix sizing, with tests (a script-only change reaches its test; a `js/sim` change reaches the statistical files; a full-list path is `full`; an empty diff is `full`) | [judgement]  | T34        |
| T36 | (built) Replay the last 100 merged pull requests through `affectedTests` offline: for each, the reached count against the suite and, where CI history shows a failed test on the PR, whether it was reached; record the table and fix every unreached failure before T37                            | [judgement]  | T35        |
| T37 | Drive the `test` matrix of `check.yml` from the `scope` job's output, run `ratchet-related` as the pull-request `coverage` job, and keep `check` the one required status; `test/workflows/` pins the wiring                                                                                         | [judgement]  | T17, T36   |
| T38 | Run the full suite, the whole-suite ratchet and the browser smoke on the push to `main`, with the red-main issue and the miss comparison                                                                                                                                                            | [judgement]  | T37        |
| T39 | Update `AGENTS.md`, `docs/commands.md`, the `create-pr` skill and [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) for the modes and the miss ledger                                                                                                                              | [mechanical] | T38        |
| T40 | Conformance review of Phase 6, with the wall time by mode over the first 30 pull requests                                                                                                                                                                                                           | [judgement]  | T39        |

## Verification

- `scripts/check.sh --fix --quick` and CI `check` are green for each chunk.
- `wc -c AGENTS.md` prints 16000 or less, and a fresh agent given only `AGENTS.md` names the pre-push command, the branch rule and where commands live.
- `node scripts/scene-scorecard.mjs --check` passes, and `docs/scene-scorecard.md` marks each of the 15 scenes `absent`, `present` or `no verified detector`.
- `node scripts/experiment.mjs tally --since 2026-11-18` prints an outcome for every record, and `check-experiments` fails on a doc edited to cite an unrecorded id.
- A branch that drops a covered branch in `js/evo` fails `scripts/check.sh --quick` at `ratchet-related` and names the file.
- `npm run state` lists a run started with `scripts/run-detached.sh` from another worktree and the workers it claims.
- `scripts/worktree-gc.sh --list` prints no `safe` worktree after Phase 4.
- `scripts/ship.sh` on a one-file docs branch prints a merged PR link without another command, and on a branch with a failing test exits 1 naming the job.
- A PR that adds one `evals/ledger/` file finishes `check` in under 2 minutes.
- User step, outside the repo: allow subagents `gh pr create` in the agent permission settings.
