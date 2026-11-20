# Commands

Every command an agent runs on Blob Evolution, grouped by job. `rg -n '^### ' docs/commands.md` lists them all; read one section. [AGENTS.md](../AGENTS.md) keeps the few used in every session.

## Gate

### Install

`npm ci`

### Run the app

`npm run dev` (Vite, http://localhost:5173)

### Start a chunk

`scripts/task-start.sh <type>/<desc> [--plan <doc>] [--here]` (fetches, makes the branch from `origin/main` in a worktree under `.claude/worktrees/` or, with `--here`, in this one; hard-links `node_modules` when the lockfiles match, else `npm ci`; `--plan` prints the doc's status, next unbuilt chunk and its task rows; the worktree path is the last line)

### Ship a chunk

`scripts/ship.sh --title <subject> --body <file> [--base main] [--no-merge]` (exit 2 uncommitted or on main, 3 merge conflict, 4 gate failed, 5 body fails the template, 6 push or `gh` failed, 1 checks red, 7 green but not merged; merges `origin/<base>`, never rebases; auto-merge with a merge commit; `gh pr checks --watch`; a rerun resumes on the same PR; logs `.checklogs/ship.jsonl`)

### Pre-push check (what an agent runs)

`scripts/check.sh --fix --quick` (conventions, designs-index, format, lint, typecheck, deps, dupes, ratchet-related, build: no full tests, ratchet, bench-check or smokes; the pre-commit hook already ran the tests of each commit's staged files; `ratchet-related` (`scripts/ratchet-related.mjs`) runs the related tests of the files changed against `origin/main` with coverage, minus `*.slow.test.js`, and fails a changed source file under a 100% baseline in `scripts/quality-baseline.json` that is not at 100%, naming its uncovered lines; it skips with a notice when no such file changed and never edits the baseline; a long-importing file such as `js/sim/rng.js` relates to most tests and takes about 40 s). **The PR gate is CI** (`check` in `.github/workflows/check.yml`): the whole suite including `*.slow.test.js` sharded over parallel runners, the coverage ratchet on the merged coverage, the static gates and the browser smoke, in about 6 minutes on a quiet runner. Read a red `check` with `gh pr checks <n>` and `gh run view <run-id> --log-failed`; a failed shard job names its shard and seed, and a `coverage` job failure is the ratchet, whose log lists the files with the most uncovered lines per failing scope and metric

### Full local gate (optional; perf PRs only)

`scripts/check.sh` (every test, including `*.slow.test.js`; conventions, designs-index, format, lint, typecheck, deps, dupes, test with coverage, ratchet, bench-check, build, eval-smoke). Run it only for a PR that moves step time (`bench-check` needs a quiet machine under `flock /tmp/claude-1000/cpu.lock`); it times out and goes inconclusive beside evals. Each run writes coverage to its own `coverage/run-<pid>` directory and still runs `ratchet` after a failed test; `scripts/check.sh --rerun-failed` reruns only the gates the last run left failed (`.checklogs/failed-gates`)

### Apply Prettier, regenerate the index, then check

`scripts/check.sh --fix`

### What CI runs

`scope` (`scripts/change-scope.sh`: `docs`, `release` or `full`; the Release Please pull request, a diff of only `CHANGELOG.md`, `package.json`, `package-lock.json` and `.release-please-manifest.json` on a `release-please--*` branch, runs `scope` alone and `check` still reports success), `static` (`scripts/check.sh --ci --skip=test`: the static gates, build and eval-smoke; a push to main runs the fast tests there instead), `test` (a matrix of coverage shards and statistical shards, `vitest run --shard`), `coverage` (`vitest run --merge-reports --coverage`, then `node scripts/quality-ratchet.mjs --check`), `browser-smoke`, `perf`, and the required `check`, which needs them all. `scripts/check.sh --ci` alone is the static half plus the fast tests

### Docs-only change

`scripts/check.sh --fix --docs` (conventions, designs-index, format, design-doc tests; what CI runs when `scripts/change-scope.sh` says `docs`)

### Only failures and the summary

`scripts/check.sh --quiet`

### Skip gates

`scripts/check.sh --fix --skip=<gate,...>` removes gates from the selection (CI's `static` job runs `scripts/check.sh --ci --skip=test`; the tests are the sharded `test` jobs)

### A subset of gates

`scripts/check.sh --only=lint,typecheck`

### The pre-commit checks on the staged files

`scripts/check.sh --tier 1` (the `.githooks/pre-commit` hook; `npm ci` turns it on through `prepare`)

### The nightly tier; list a tier's gates

`scripts/check.sh --tier 3`; `scripts/check.sh --list --tier 1`

### Browser smoke test without Docker

`SMOKE_LOCAL=1 scripts/check.sh --only=browser-smoke` (30 app frames in 5 s after first draw; worker tick must advance; a failed spec reruns once: a pass on the rerun passes and is listed in `.checklogs/smoke-flakes.json`, which CI uploads as the `smoke-flakes` artifact and the nightly `smoke-flakes` job turns into one issue; two failures fail)

### Replay a shuffled test order

`TEST_SEED=<seed> scripts/check.sh --only=test` (the seed is on the `test (seed <n>)` line)

### Read a failed gate

The digest under its `✗` line, then `.checklogs/<gate>.log` (kept until the next run). Do not rerun the tool to see why

### Detach a long run, then wait for it

`scripts/run-detached.sh <name> [--frozen] -- <cmd...>` (writes `.runs/<name>.log` and `.runs/<name>.done`, the exit code; records the run in `.runs/runs.json`; refuses a name already used; `--frozen` runs from a new `.runs/frozen-<name>-<timestamp>` copy of the tree; `$RUNS_DIR` moves the directory), then `scripts/wait-run.sh <name> [--timeout <s>]` (blocks until `.done` exists, prints the exit code and log tail, exits with the run's code, 124 on timeout, 125 when the run was killed). Never `nohup`, `until` or `pgrep -f` loops

### Worker budget for evals, screens and training

`eval`, `ladder`, `league`, `train`, `drill`, `reflex` and `screen` (in total) default to `defaultWorkers()` in `scripts/lib/worker-pool.mjs`: `max(ceil(cores / 2), cores - 8)`, 24 of 32 cores here, so the gates and the other lanes keep 8; `--workers <n>` overrides it

### Telemetry dashboard (Aspire)

`bash -lic 'npm run aspire:dashboard'`, then run with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`; UI at http://127.0.0.1:18888

## Tests

### Tests

`npm test`; one file: `npx vitest run <file>`; one test: `npx vitest run -t '<name>'`

### Only the fast tests (no `*.slow.test.js`)

`TEST_SCOPE=fast npx vitest run`

## Bench

### Compare this branch's bench with main

`node scripts/bench-compare.mjs` (`--base <ref>`, `--sizes=500`, `--runs=5`; about 6 minutes)

### Benchmark the sim core (step and phase ms)

`npm run bench` (`-- --json`, `-- --sizes=500`, `-- --policy <name>` to bench a registered policy with its hooks; `bench/baseline.json` is what `bench-check` compares)

### Function microbenchmarks (hot functions, ops/s)

`npm run bench:micro` (`-- --compare <ref>` runs the same files on a worktree of `<ref>` and this tree, alternating, and prints the change per function with its margin; `--runs <n>` (3), `--filter <text>`; about 5 minutes for a compare; a tool, not a gate)

### Benchmark one subsystem, or the brain

`npm run bench:micro -- --area <name>` runs one area's `bench/micro/<area>*.bench.js` (an area is a step phase: `brain`, `sense`, `physics`, ...; with `--compare <ref>`, `--runs`, `--filter <part>` selecting `<area>-<part>` files; unknown area lists the areas); `npm run bench:parts -- --area <phase>` times any step phase whole and in its parts (`bench/micro/phase-parts.js`; `--area brain` adds the size and sparsity sweep and evolution-side costs, and the nonzero inputs per agent print below the table). Prove a millisecond change with `flock /tmp/claude-1000/cpu.lock npm run bench:parts -- --area <phase> --compare <base>` on a quiet machine; it counts only when outside the printed margin

### Parallel throughput by worker count

`npm run bench:parallel` (`-- --counts 1,8,16,24,32 --ticks 2000 --agents 500 --json`; prints `bench.parallel_ticks_per_s@<n>` and the recommended worker default)

### Check the golden hashes in Chromium

`npm run browser:hash` (`-- --cdp=<url>` to use a running Chrome)

### Measure the app's frame times in Chrome

`npm run perf:browser` (`-- --app v6` is the default, `--agents <n>` (500), `--viewport <w>x<h>` (3840x2160), `--seconds <n>`, `--url-params <query>` (for example `tv=1`; the baseline keys it `<viewport>?<query>`), `--cdp=http://127.0.0.1:9222` for Windows Chrome on the GPU; refuses a display under 120 Hz without `--allow-low-refresh` and software GL without `--allow-fallback`; writes `bench/browser-baseline.json` by viewport; `--app legacy` writes `bench/legacy-baseline.json`)

### Measure the director in Node

`npm run director:dry` (`--seed <n>[,<n>...]` (1), `--ticks <t>` (72000), `--policy <name>` (the live one), `--config <file.json>`, `--json`; runs the sim host over a fake port and clock and the real director on a simulated clock (decisions every 500 ms, time is ticks / 60); prints a line per shot and `director.chase_precision` (at least 0.6), `director.max_kind_share` (at most 0.4) and `director.shots_per_hour` (60 to 240) with each bar; about 2 minutes a seed; a detector, never fitness; docs/designs/ambient-display.md)

### Time the reflex cases

`flock /tmp/claude-1000/cpu.lock npm run bench:reflex` (`--genomes <n>` (512), `--reps <n>` (5), `--drill-genomes <n>` (2), `--drill-trials <n>` (32), `--no-drill`, `--json`; prints `bench.reflex_genomes_per_s` for the four forager cases on one core and `bench.reflex_vs_drill`, the ratio to `drillSubject` over the forager drills; a tool, not a gate)

### Benchmark a Rust kernel change

Edit `wasm/src`, run `scripts/build-wasm.sh`, then `flock /tmp/claude-1000/cpu.lock npm run bench:micro -- --area wasm --compare HEAD` (the ref tree is a checkout of `HEAD`, so its committed binary is the base and this tree's rebuilt one the head; each export timed raw: `brain_forward` and `sense_slot` at 500 agents, the det-math exports; `--area drill` prices drill trials per second; a change counts only outside the printed margin; `--runs 5` on a quiet machine)

## Eval

### Replay a world and log its events

`npm run replay -- --seed <n> --ticks <n>` (`--config <file.json>`, `--dump <tick>`, `--level debug`, `--check-invariants`, `--policy <name>`, `--follow <genomeId>`); logs go to `.sim/logs/<runId>.jsonl`

### Evaluate a policy on fixed seeds

`npm run eval -- --seeds <n> --ticks <t> --policy <name>` (defaults 16 seeds, 200000 ticks; `--seed-offset <k>`, `--config <file.json>`, `--policy-options <file.json>` (policy options: `fitnessOverrides` weights, `archiveShare`, `cloneShareEnd`, `descriptor`; checked before the run, written to the report), `--out <path>`, `--workers <n>`, `--save-champions <n>` (writes each seed's top `<n>` archive elites as champion files in `<out>-champions/`; off by default); seeds come from `evals/seeds.json`; reports go to `evals/results/`, logs to `.sim/logs/eval-<id>.jsonl`)

### Screen a grid of config arms

`npm run screen -- --grid <grid.json>` (`--workers <total>` for all arms and seeds, default `defaultWorkers()` (all but 8 cores); `--out`, `--seeds`, `--seed-offset`, `--ticks`, `--force`; takes the CPU lock itself, so do not wrap it in `flock`; resumable per arm; an arm may set `policyOptions` (also in `base`) beside its config keys, part of its resume key; `table.md` and `verdicts.json` in `evals/screens/results/<grid>/`; example `evals/screens/t59.grid.json`)

### Run the skill ladder

`npm run ladder` (`--ticks`, `--seeds`, `--config <file.json>`, `--out <path>`, `--workers <n>`; default 10000 ticks on seeds 1-3, no floor; reports to `evals/ladder/<id>.json`, logs to `.sim/logs/ladder-<id>.jsonl`)

### Measure eval power from one report

`npm run eval:power -- <report.json>` (`--splits`, `--power-splits`, `--sizes`, `--metrics`, `--include-watch` (also measures `watch` metrics, scoring each in its intended direction from the `intended` field of the metric registry, `js/evo/metric-registry/`), `--json`; false-positive rate and detectable change per metric from split resampling, no new runs)

### Print a plan's Baseline table

`npm run baseline:table -- --plan <doc>` (`--report <file>`; the plan's backticked metrics from the newest `evals/power/defaults-floor-on-*.json`, with mean, range, null share, detectable change per arm size and the seeds a verdict needs)

### Is the shared baseline current

`npm run baseline:status` (`--report <file>`; prints the report's `rulesHash` beside the default config's, exits 1 when they differ)

### Compare two eval reports

`npm run eval:compare -- <before.json> <after.json>` (`--targets <m,...>`, `--fail-on-worse`, `--allow-config-diff <key,...>`, `--allow-seed-diff`, `--min-effect <fraction>` (default 0.05; not for shares), `--share-min-effect <fraction>` (default 0.02, absolute, for a metric of unit `share`), `--keep-rule` (prints `keepRule`: the seed guards' exact paired tests with their smallest detected loss, the verified guard metrics and the adoption counts; with `--fail-on-worse` a `WORSE` exits 1), `--json`; a verdict needs the interval to exclude 0 and a change of at least that share of the before mean, and on a metric with at least half its paired differences 0 also an exact sign test under 0.05; a metric that is not `verified` in the registry prints `unverified` and gets no verdict; refuses under 16 seeds; BCa intervals on per-seed differences; differing `policyOptions` are compared and noted, not refused; exits 2 on a refusal)

### Play a candidate in the champion league

`npm run league -- <candidate.json>` (`--admit` appends it to `evals/league.json` with its Elo, `--workers <n>`, `--ticks <n>`; 8 seeds against every admitted champion; logs to `.sim/logs/league-<id>.jsonl`)

### Split a replay's hunter income by life

`node scripts/hunter-income.mjs .sim/logs/<runId>.jsonl` (the replay needs `--level debug`; prints the kill, bite and carcass shares and the share of carcass energy eaten by zero-kill lives)

## Train

### Train genomes in whole worlds

`npm run train -- --generations <g> --out <dir>` (`--episodes <e>` (32), `--workers <n>`, `--curriculum evals/train-curriculum.json`, `--resume <archive.json>`, `--checkpoint-every <n>` (10), `--seed-offset <k>` (0; shifts the episode seed index to `(g x e + k) mod 256`, so a second arm trains on other seeds; the default writes identical archives), `--until <stage>` (stop a curriculum after that stage), `--scratch` (allow an `--out` under `/tmp`, which is refused otherwise; keep a run a decision rests on under `.sim/train/<name>`); a curriculum entry with a `gate` (conditions on drill readings, `minGenerations`, `maxGenerations`, optional `optional`, `pool`, `checkpointEvery`, `plateauStop` (gate checkpoints over which the stage's best progress must rise by 0.02, or it stalls with reason `plateau`)) ends on its gate, not a generation count (docs/designs/training-stages.md); a required stage that cannot pass exits 3 with `TrainStageStalled` (`reason` `max`, `plateau` or `review`; docs/designs/training-loop.md), the archive and curve kept; writes `archive-<g>.json`, `curve.jsonl`, `train.jsonl` and `manifest.json` to `<dir>`; `--workers 1` and `--workers 32` write identical archives); `npm run train:curve -- <dir>` prints the curve and its plateau, and for a gated run each checkpoint's gate result, retention, stage progress (`progress`, `best`) and condition readings; `npm run train:export -- --archive <file> --out <dir>` writes up to two champions per specialisation and `skip-cells.json` (the predators' prey, kin and other strength into `BITE`, `THRUST` and `TURN`, also shown; refuses `--out` under `public/champions/` unless the archive's last stage is the target world)

### Cross-play of a training run

`npm run train:crossplay -- <dir>` (`--trials <n>` (64 per cell), `--no-group`; each checkpoint's predator champion against every checkpoint's forager champion in the `prey-ahead` arena, both driven by their brains, from the run's `curve.jsonl` and `archive-<g>.json` files; writes `<dir>/crossplay.json` and prints the matrix, hunter progress, prey progress and the cycle share; a detector, never fitness)

### Exam of a training run's champion set

`npm run train:exam -- --run <dir>` (`--replicates <dir,dir>` (the other training-seed offsets, for row 9), `--world-before <live.json> --world-after <champions-v1.json> --keep-rule-report <compare.json>` (row 6: 32-seed 200000-tick reports and `eval:compare --keep-rule --json` on 64 seeds), `--descendants <dir>` (row 7: a `--save-champions` directory), `--trials <n>` (64 per champion and drill and per reflex case), `--workers <n>`; ten rows (docs/designs/training-stages.md, The exam): valid, reflex (reported), drill, cross-play, league (reported), scenes, inherited, diverse, replicated and watched, each `pass`, `fail`, `reported` or `not run` with the command that feeds it; reads the run's last `archive-<g>.json`, `manifest.json` and `crossplay.json`, drills on the second validation seed; writes `<dir>/exam.json` and logs `ExamRow` to `.sim/logs/exam-<run>.jsonl`; a detector, never fitness)

### Yield of ladder runs

`npm run train:yield -- <dir> [<dir> ...]` (each a run directory or a quoted glob) (`--out <path>` writes JSON; each run's score (`reached + bestProgress`, one ordinal number per run: the index of the last stage it trained in plus its best progress there, 1 when the ladder finished) and CPU hours, then per stage the share of runs that passed it, the median generations to pass and the CPU hours per pass; reads each directory's `manifest.json`and`curve.jsonl`; docs/designs/training-loop.md; a detector, never fitness)

### Compare two ladder arms

`npm run train:compare -- <before-dir-glob> <after-dir-glob>` (quote the globs; `--out <path>` writes JSON; pairs the runs by `--seed-offset` and reads the per-offset score differences: an exact sign test (tied pairs left out) and a bootstrap interval of the mean, `better` or `worse` when the sign test is under 0.05 and the interval excludes 0, else `no verdict`; prints the pairs, the per-stage pass shares side by side, the CPU hours and the unmatched offsets; refuses under 16 matched offsets (tied pairs counted) with exit 2; docs/designs/training-loop.md; a detector, never fitness)

### Check a ladder is learnable

`npm run train:feasible -- --curriculum <ladder.json>` (`--until <stage>`, `--generations <n>` (200), `--seeds <n>` (8 populations), `--population <n>` (64), `--trials <n>` (4), `--workers <n>`, `--out <path>` (`feasible.json`), `--log-dir <dir>`; for each gated stage runs the learn probe (`learnLesson`) on each gate drill under the trainer's drill config and compares each population's final win share with the bar its condition implies (`winShareLow`: the bound; `winShareOverReference`: the bound times the memoryless reference's win share; `edgeLow`: the random brains' share plus the bound); a drill is learnable when at least 2 populations reach the bar; retention, cross-play, `jawShareLow` and `max` conditions are listed as unchecked; a bite drill also prints the chase's fair band per hunter at the stage's forager `sprintBoost`; logs `FeasibleStage`; a detector, never fitness)

### Screen a ladder grid

`npm run train:screen -- --grid <grid.json>` (`--out <dir>` (default `evals/train-screens/results/<grid>`), `--runs <dir>` (where the run directories go, default `--out`), `--workers <total>` (default `defaultWorkers()`; runs in flight is that over the grid's `workersPerRun`, 8), `--force`; a grid names a base `curriculum` ladder, the `offsets`, `until`, `generations`, `train` options and `arms` (a whole `curriculum`, `train` keys, and `stages: {<name>: {<entry key>: value}}` laid over the ladder's entries), and a `reference` arm (default an added arm `base`); runs every arm on every offset into `<out>/<arm>/o<offset>/` (a finished run whose manifest matches the arm's ladder hash, trainer options and offset is reused), then writes `yield.json`, `verdicts.json` (each arm's `compareYield` against the reference) and `table.md`; before training runs the learnability check once per distinct arm ladder (`feasible: {generations, seeds}` sizes it, default the probe sizes; `feasible: false` turns it off, as `plateau.grid.json` does), marks `unlearnable` stages in `verdicts.json` and writes `feasible.json`, and with `skipUnlearnable: true` leaves such arms out (never the reference); takes no CPU lock; example `evals/train-screens/plateau.grid.json`; docs/designs/training-loop.md)

### Tune the trainer overnight

`npm run train:tune -- --spec evals/train-tune.json` (`--date <YYYY-MM-DD>`, `--workers <n>`, `--dry-run` (propose and print only), `--runs <dir>` (training runs, default `.sim/train-tune/`), `--results <dir>` (default `evals/train-tune/results/`); one night of trainer tuning: `proposeArms` proposes up to `maxArms` one-change arms around the ladder, `train:screen` on `tuneOffsets` with the learnability check, a held-out screen of each `better` arm on `holdoutOffsets`, then for each finalist and `base` a champion export and a 16-seed `champions-v1` eval against live; writes `summary.md`, `result.json` and `draft-experiment.json` to `<results>/<date>/` and changes nothing else; detach it with `scripts/run-detached.sh`; logs `TuneArm`, `TuneResult` to `.sim/logs/train-tune-<date>.jsonl`; docs/designs/training-loop.md, Tuning lane)

## Probes and audits

### Run the memory probes

`npm run probe:memory -- --champions <dir>` (`--scenarios food-then-blind,predator-out-of-view,scent-after-sight-loss,food-then-blind@600,group-hunt` (default all), `--seed <n>` (1), `--trials <n>` (32), `--config <file.json>`, `--no-references`; prints the scores per control (intact, blindfold, amnesia) and the gain for each champion and for the memoryless and memory-storing reference controllers, then the set's mean; a champion that does not fit the layout logs `probe.layout` and exits 1; logs every trial to `.sim/logs/probe-<seed>x<trials>.jsonl`)

### Audit the chase envelope

`npm run audit:chase` (`--pairs predator:forager,...` (default every hunter against every specialisation), `--trials <n>` (4 per distance and bearing), `--seed <n>`, `--no-sprint`, `--straight` (the evader never breaks: a bound), `--config <file.json>`, `--json`, `--out <path>`; prints the body table (speeds, turning circles, stopping distance, energy per 100 ticks), then each pair's catch grid, fair band and energy per kill; scripted oracles in an empty arena, so it needs no champion; logs to `.sim/logs/audit-chase-<seed>.jsonl`)

### Census every input and output

`npm run audit:signals` (`--seeds <n>` (16), `--ticks <t>` (200000), `--seed-offset <k>`, `--policy <name>`, `--config <file.json>`, `--workers <n>`, `--out <path>`; one row per brain input and output: nonzero share, mean, sd, range, use and verdict (dead, unused, alive), and each action's fire share; a detector, never fitness; logs `SignalCensusRow` to `.sim/logs/audit-signals-<seed>x<seeds>.jsonl`)

### Learn a lesson from random brains

`npm run probe:learn` (`--lessons food-ahead,...` (default all seven drills), `--generations <n>` (200), `--seeds <n>` (8 populations), `--population <n>` (64), `--trials <n>` (4 per brain per generation), `--config <file.json>`, `--workers <n>`, `--out <path>`; evolves random brains directly on each lesson's win share and prints the best final win share, how many populations reached 0.9 and in how many generations; writes no genome; logs `LearnGeneration` to `.sim/logs/learn-<seeds>x<generations>.jsonl`)

### Drill genomes on fixed skill scenarios

`npm run drill -- --champions <dir>` or `--archive <file>` or `--policy <name>` (`--count <n>` elites for `--policy` (8), `--elites all` (with `--archive`: drills every occupied elite, not the exported champions, and prints the elite-skill read per drill: elites clearing `--bar <n>` (0.3) on `edgeLow`, whether the top lower-bound elite does, and the rank correlation of lower bound against win share; `--json` gains `eliteSkill`), `--drills a,b` (default all seven), `--seed <n>` (1), `--trials <n>` (32), `--config <file.json>`, `--json`, `--out <path>`, `--workers <n>`; prints each genome's win share and edge over random brains per drill and the `memoryless` reference beside them; a detector only, never fitness; logs to `.sim/logs/drill-<seed>x<trials>.jsonl`)

### Inspect a champion's brain on a drill

`npm run inspect -- --champions <dir> --name <champion> --drill <name> --out <dir>` (`--name` is optional for one champion; `--seed <n>` (1), `--trials <n>` (32), `--trace-trials <n>` (4), `--top <n>` (8), `--edit <edits.json>`, `--config <file.json>`, `--workers <1-4>`; writes labelled weights, tick traces, summaries, unit ablations and an optional matched edit comparison; diagnostic only, never fitness; logs to `.sim/logs/inspect-<seed>x<trials>.jsonl`)

### Score genomes on the brain-only reflex cases

`npm run reflex -- --champions <dir>` or `--archive <file>` or `--policy <name>` (`--count <n>` elites for `--policy` (8), `--cases a,b` (default all six), `--seed <n>` (1), `--trials <n>` (16), `--config <file.json>`, `--level debug` (a record per failed trial), `--json`, `--out <path>`, `--workers <n>`; prints each genome's pass share and edge per case, its score, edge and first-row share, then each case's bars (random brains, constant brains, reference) and whether it is valid; a detector and filter, never fitness; logs to `.sim/logs/reflex-<seed>x<trials>.jsonl`)

### Run the reflex validation study

`node scripts/reflex-correlate.mjs` (`--league <file>`, `--train-dir <dir>`, `--archives <dir,dir>`, `--champions <dir,dir>`, `--random <n>` (32), `--seeds <n>` (16 case seeds, 101 to 116), `--drill-trials <n>` (32), `--resamples <n>`, `--workers <n>`, `--json`, `--out <path>`; Spearman rho with a cluster BCa interval of each case against its drills, and of the reflex score against archive lower bound and league Elo, then the verdict of the decision rule in `docs/designs/brain-reflex-tests.md`; heavy, run it with the workers the coordinator names)

## Docs

### Regenerate the design index

`node scripts/designs-index.mjs --write`

### Regenerate the metrics table

`node scripts/metrics-doc.mjs --write` (writes `docs/designs/metrics.md` from the registry in `js/evo/metric-registry/`; `--check` fails when it is stale, and the `conventions` gate runs it; a new metric is registered in the same commit)

### Regenerate target-metric power table

`node scripts/metric-noise.mjs --write` (`--check` detects drift; `--metrics` lists the power command input and `--references` audits plan locations; uses the saved E210 reading in `evals/power/metric-noise-E210.json`)

## Build and deploy

### Rebuild the WASM kernels

`scripts/build-wasm.sh` (after any change under `wasm/`; writes `wasm/blob-kernels.wasm`, its `.sha256`, `blob-kernels.src.sha256` and the embedded copy `js/sim/wasm-binary.js` every world compiles); `node scripts/check-wasm.mjs` checks them and, with cargo, rebuilds and compares (the `conventions` gate runs it); `scripts/test-wasm.sh` runs the crate's Rust tests in Node (needs cargo, so no gate runs it)

### Rebuild the icons and share card

`npm run build:icons` (every icon file and the Open Graph card from `public/icons/icon.svg` with Playwright's Chromium; docs/designs/web-presence.md)

### Production build / deploy

`npm run build`; a merge to `main` deploys nothing: Release Please (`.github/workflows/release-please.yml`) keeps a release PR open, and merging it deploys to production (Cloudflare Pages) through `.github/workflows/deploy.yml` (a build with `npm run build:release -- <version>`, the version's own Pages deployment served at `/v/<version>/`, its D1 `releases` row, then `/`; a rollback is `gh workflow run deploy.yml -f tag=v<version>`). After a green `check`, `.github/workflows/preview.yml` deploys a push to `main` (or `season/next`) to `/next/` and a pull request from this repo to a preview in the `preview` environment. `node scripts/release-check.mjs` is the pull request gate on `rulesHash`. `npm run deploy` stays for a manual deploy, only when the user asks
