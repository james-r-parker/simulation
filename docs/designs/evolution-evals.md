# Evolution evals

**Status:** Implemented - the observer, metrics, `baseline-v5` and `npm run eval` on a worker pool with `npm run bench:parallel` and the recorded baseline (Phase 1); `eval:compare`, the experiments ledger with calibration `E0` and the `eval-smoke` gate (Phase 2); the anti-exploit suite (Phase 3); Elo and the champion league (Phase 4).
**Depends on:** [headless-sim-core.md](headless-sim-core.md)

Evals measure what a simulation run produces: whether agents eat, live, breed, diversify and keep changing. Every
claim that a change improves evolution is an `eval:compare` verdict between two eval reports.

- An eval runs one policy on a fixed list of seeds, each seed in its own `worker_threads` worker, and writes one
  report.
- The **Metrics** table below is the source of truth for every `**Targets:**` name in every design doc.
- Same policy, seeds, ticks and config give the same report, bit for bit, in Node.

## Metrics

"Better" is the direction `eval:compare` scores as an improvement; `watch` metrics are reported with an interval and
get no verdict. A metric that cannot be computed for a seed is `null` with a `reason`, and `eval:compare` gives `-`
for it when any seed in either arm is `null`. Agent-ticks are the per-tick sum of the population. Checkpoints are
every 1000 ticks from tick 1000. "After burn-in" means from tick 10000.

| Metric                       | Better | Definition                                                                                                                                                                                                        |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.food_energy_per_1k`    | higher | Food energy eaten (`foodEnergy` of the dead plus that of the living at the end) per 1000 agent-ticks                                                                                                              |
| `eval.median_lifespan`       | higher | Median `ageTicks` at death of agents that reached `maturityTicks`; agents alive at the end are excluded; `null` with no mature death                                                                              |
| `eval.births_per_1k`         | higher | Births with cause `mate` or `split` per 1000 agent-ticks                                                                                                                                                          |
| `eval.population_mean`       | watch  | Mean population over checkpoints                                                                                                                                                                                  |
| `eval.floor_episodes`        | lower  | Runs of consecutive ticks with a `PopulationFloor` event, after burn-in                                                                                                                                           |
| `eval.predation_per_1k`      | watch  | Deaths with cause `eaten` per 1000 agent-ticks                                                                                                                                                                    |
| `eval.diversity`             | higher | Per checkpoint, the mean pairwise L2 distance between the weight rows of `min(64, population)` agents drawn without replacement, over `sqrt(weightCount)`; checkpoints with fewer than 2 agents skipped; averaged |
| `eval.lineages_alive`        | higher | Mean number of distinct `lineageId`s alive at checkpoints after burn-in                                                                                                                                           |
| `eval.lineage_turnover`      | higher | Per 100000 ticks after burn-in: checkpoints at which a new lineage becomes dominant (most agents, leading by at least 2) that was not dominant in the previous 10 checkpoints; ties keep the previous dominant    |
| `eval.behaviour_coverage`    | higher | Occupied fraction of the 10 x 10 **life grid** over 300 mature deaths drawn from the `eval` stream (all of them when fewer)                                                                                       |
| `eval.motion_coverage`       | watch  | Occupied fraction of the 10 x 10 **motion grid** over the same 300 deaths                                                                                                                                         |
| `eval.predator_share_cv`     | watch  | Coefficient of variation of the predator share of the population over checkpoints; `null` when the mean share is 0                                                                                                |
| `eval.p90_fitness.<spec>`    | higher | 90th percentile of fitness per specialisation over the dead and the living at the end; compared only between reports with the same `fitnessName`                                                                  |
| `eval.mean_fitness.<spec>`   | higher | Mean of the same fitnesses; same `fitnessName` rule                                                                                                                                                               |
| `eval.qd_score`              | higher | Sum over occupied archive cells of the elite's mean fitness, over the total cell count; `null` without an archive                                                                                                 |
| `eval.coverage`              | higher | Occupied fraction of the policy's archive cells; `null` without an archive                                                                                                                                        |
| `eval.champion_elo`          | watch  | The candidate's Elo after its league games (`npm run league`)                                                                                                                                                     |
| `eval.champion_win_rate`     | watch  | Wins plus half the draws over games played by the candidate (Phase 4); `null` with no games                                                                                                                       |
| `bench.step_ms@<n>`          | lower  | Median ms per tick at `n` agents (`npm run bench`, [headless-sim-core.md](headless-sim-core.md))                                                                                                                  |
| `bench.phase_ms.<phase>@<n>` | lower  | Median ms per tick of one `STEP_PHASES` phase at `n` agents                                                                                                                                                       |
| `browser.frame_p95_ms`       | lower  | 95th percentile frame time over a 60 s run (`scripts/browser-perf.mjs`, [dev-workflow-and-gate.md](dev-workflow-and-gate.md))                                                                                     |
| `browser.main_long_tasks`    | lower  | Main-thread long tasks over the same 60 s run                                                                                                                                                                     |
| `browser.gc_pause_ms`        | lower  | Total GC pause over the same 60 s run ([worker-and-renderer.md](worker-and-renderer.md))                                                                                                                          |

The two behaviour grids bin per-agent lifetime values, sampled every 100 ticks; an agent with no sample is excluded.

| Grid   | x (10 bins over 0..1)                                                                    | y (10 bins)                                                       |
| ------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Life   | Bite share of energy gained: `biteEnergy / (foodEnergy + biteEnergy)`, 0 when both are 0 | Children per 10000 ticks alive, over 0..5, the top bin open-ended |
| Motion | Mean speed over `maxVelocity`, clamped to 1                                              | Mean absolute `turnRate` over `maxTurn`                           |

## Eval runner

`npm run eval -- --seeds <n> --ticks <t> --policy <name> [--seed-offset <k>] [--config <file.json>] [--out <path>]`
(`scripts/eval.mjs`):

- Seeds are `n` consecutive entries of `evals/seeds.json` (32 fixed seeds) from `--seed-offset` (default 0). Defaults: `--seeds 8`, `--ticks 200000`,
  `--policy baseline-v5`, the default config. `--policy live` runs `LIVE_POLICY`.
- Seeds run on `scripts/lib/worker-pool.mjs`: a pull queue of tasks over `worker_threads` workers, each running
  `scripts/eval-worker.mjs`. A free worker takes the next task, so no core waits for a slow seed. Results are
  returned in task order, so a report never depends on the worker count or on which worker finished first.
- `--workers <n>` sets the pool size; the default is `os.availableParallelism()` (32 on the dev machine's 7950X3D),
  capped at the task count. `npm run bench:parallel` measured the default (below).
- `eval:compare` and the league run all their tasks - both arms, every pairing - through one pool, so a default
  8-seed comparison keeps 16 threads busy rather than 8 twice.
- A worker builds the world with `createWorld`, steps it with the policy's `brain` and the observer's `observerPhases` overrides, then each tick feeds `js/evo/observer.js`, calls the policy's `onEvent` for each
  new record and its `afterStep(world)`, and
  takes a checkpoint every 1000 ticks.
- The report is JSON: `version`, `policy`, `fitnessName`, the full resolved `config` and its `configHash`, `ticks`,
  `seeds`, the commit sha, and per metric the per-seed values (or `null` and `reason`), mean and standard deviation.
- `--out` defaults to `evals/results/<policy>-<sha>-<n>x<t>.json` (gitignored), with `-o<k>` appended for a non-zero
  `--seed-offset` so an offset run never overwrites the offset-0 one.
- The stored `config` has no `seed` (each seed's world is that config with its seed), and `configHash` is the hash of
  that stored object. Each metric holds `values` and `reasons` per seed, then `mean` and the sample standard deviation
  `sd` (n - 1) over the non-null values.
- `onEvent` receives `(world, offset)` for each record, the offset of its first field in `world.events.data`, starting
  with the initial births from `createWorld`.

| Module                           | Exports                                                                                                 | Does                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/evo/observer.js`             | `createObserver`, `observe`, `checkpoint`, `observerPhases`                                             | Per-slot counters (below), reset on `AgentBorn`; checkpoint samples into typed arrays. Helpers: `observer-events.js`, `observer-tick.js`, `observer-checkpoint.js`, `growable-log.js`                                           |
| `js/evo/metrics.js`              | `computeMetrics`                                                                                        | Observer state to the Metrics table values for one seed, `null` with a reason where undefined. Helpers: `metrics-series.js`, `metrics-grids.js`, `metrics-fitness.js`, `metrics-stats.js` (percentiles by linear interpolation) |
| `js/evo/policies/index.js`       | `POLICIES`, `getPolicy`, `LIVE_POLICY`                                                                  | Name to policy; an unknown name throws listing the known ones; `LIVE_POLICY` names the policy the browser and nightly evals run                                                                                                 |
| `js/evo/policies/baseline-v5.js` | `createBaselineV5`                                                                                      | The legacy approach on the new core (below)                                                                                                                                                                                     |
| `js/evo/fitness-v5.js`           | `fitnessV5`                                                                                             | The legacy fitness formula on observer counters, in ticks                                                                                                                                                                       |
| `js/evo/report.js`               | `buildReport`, `validateReport`                                                                         | Report shape and its validation                                                                                                                                                                                                 |
| `js/evo/compare.js`              | `compareReports`, `bootstrapInterval`                                                                   | BCa intervals and verdicts (Phase 2)                                                                                                                                                                                            |
| `js/evo/scripted.js`             | `SCRIPTED_CONTROLLERS`                                                                                  | Hand-written controllers for the anti-exploit suite (Phase 3)                                                                                                                                                                   |
| `js/evo/elo.js`                  | `expectedScore`, `updateElo`                                                                            | Elo with K = 32 from 1500 (Phase 4)                                                                                                                                                                                             |
| `js/evo/league.js`               | `matchPolicy`, `playMatch`, `runLeague`, `decide`, `validateChampion`, `encodeWeights`, `decodeWeights` | Head-to-head games between champion files, and the champion file codec and checks (Phase 4)                                                                                                                                     |

`POLICIES` maps a name to a factory, `create(options)`, with `options` `{ config, log, observer }` plus policy-specific fields;
all per-run state lives in the object it returns: `{ name, brain, fitnessName, fitness, archive?, onEvent?, afterStep? }`.
`brain` holds the core's policy hooks and is what `createWorld` and `step` receive; `log` is the run's `simLog`. `fitness(observer, slot, config)` reads only observer state, never world
arrays, so it is valid after the slot has been reused. `onEvent` receives each event-ring record after the observer.

### Observer counters

The observer caches each slot's `genomeId`, `lineageId`, `spec` and birth tick on `AgentBorn`, and handles each tick's
`AgentDied` records before its `AgentBorn` records.

| Counter                          | Source                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `foodEnergy`, `biteEnergy`       | World arrays of the same name each tick; final values from `AgentDied`                                                                                 |
| `children`                       | `AgentBorn` with this slot's `genomeId` as `parentA` or `parentB`                                                                                      |
| `childrenFromSplit`              | The `children` born by a split                                                                                                                         |
| `kills`                          | `AgentDied` with `by` equal to this slot's `genomeId`                                                                                                  |
| `cellsVisited`                   | Distinct 200 px cells (a 72 x 41 bitset per slot) entered, sampled every 10 ticks                                                                      |
| `collisions`                     | Ticks on which `lastLoss` is `collision` right after the physics phase (`observerPhases`, a `step` override; `applyCosts` resets it later in the tick) |
| `distance`                       | Sum of speed per tick                                                                                                                                  |
| `turnsTowardsFood`               | Ticks with absolute `turnRate` above `0.1 x maxTurn`, turning towards the nearest food ray hit                                                         |
| `speedSum`, `turnSum`, `samples` | Sampled every 100 ticks for the motion grid                                                                                                            |

`fitnessV5` maps `calculateFitness` in the legacy `js/agent.js` onto these counters with `ageTicks / 60` in place of
wall-clock seconds and `cellsVisited` in place of the legacy exploration grid; `fitnessName` is `v5`. It keeps the
legacy weights (`FITNESS_CATEGORIES`, `SURVIVAL_SCORING`, `ACTION_SCORING`, `SPECIALIZATION_SCORING`) and the
estimated terms recorded in [legacy-audit.md](legacy-audit.md) FIT-3 and FIT-5, copied as named constants.

### `baseline-v5`

`baseline-v5` is the legacy approach on the new core, with `fitnessV5` and no archive:

- Random genomes draw each weight and bias from `N(0, NN_WEIGHT_INIT_STD_DEV)` (0.1).
- A child copies its mother's row. On a mating each weight comes from the father with probability
  `UNIFORM_CROSSOVER_PROBABILITY` (0.5); a split copies only.
- Every child gains `N(0, BASE_MUTATION_RATE x NN_MUTATION_STD_DEV_RATIO)` (sigma 0.03) per weight, plus with chance
  `NN_MACRO_MUTATION_CHANCE` (0.02) a further `N(0, BASE_MUTATION_RATE x 3.0)` (sigma 0.3, the literal in
  `NeuralNetwork.mutate`), clamped to `NN_WEIGHT_CLAMP_MIN..NN_WEIGHT_CLAMP_MAX` (-3..3), biases included.
- The rate is fixed at `BASE_MUTATION_RATE`. The legacy adaptive rate, half-rate splits, per-fitness scaling and
  fitness-weighted crossover are not ported.

`evals/baselines/baseline-v5.json` is its report at 8 seeds x 200000 ticks. `npm run replay` takes `--policy <name>`
(default `baseline-v5`) and `--follow <genomeId>`, which logs `FollowSample` every 10 ticks until that agent dies.

## Compare (Phase 2)

`npm run eval:compare -- <before.json> <after.json> [--targets <m,...>] [--fail-on-worse] [--allow-config-diff <key,...>] [--allow-seed-diff] [--json]`
(`scripts/eval-compare.mjs`):

- Refuses, exiting 2 with the reason, unless both reports have the same seeds and ticks, at least 8 seeds, and
  configs that hash equal with the `--allow-config-diff` keys removed; it prints `CompareRefused <field>` (`seeds`,
  `seedCount`, `ticks` or `config`). Different policies are allowed. `--allow-seed-diff` skips only the same-seeds
  check and pairs the arms by position; it exists for calibration.
- `compareReports(before, after, { level })` uses `level` 0.95 unless given.
- For each metric, a BCa bootstrap interval (10000 resamples, `fork(createRng(1), 'bootstrap')`) of the mean of the
  per-seed differences, paired by seed. Each metric forks its own stream, so its interval does not depend on the
  other metrics. The normal CDF and its inverse are computed with `detExp` and `detLog`.
- The verdict is `better` or `worse` when the 95% interval excludes 0 strictly in the metric's direction, otherwise
  `no-difference`; `watch` metrics, `null` metrics and fitness metrics of different `fitnessName`s get `-`.
- `--targets` marks those metrics; `--fail-on-worse` exits 1 if any metric is `worse`, or with `--targets` any target.
  Prints a table; `--json` prints JSON.

`evals/experiments.json` is the ledger the `run-evolution-loop` skill writes: entries with `id` (`E<n>`), `date`,
`branch`, `hypothesis`, `prediction`, `targets`, `beforePolicy` and `afterPolicy` (default `live`), `before` and
`after` (report path or artifact URL), `verdicts`, `effect` (`better`, `worse`,
`no-difference`, `exploit`) and `note`, under a top-level `experiments` array; ids are unique and increasing.
`scripts/check-experiments.mjs` validates it against `evals/experiments.schema.json` in the `conventions` gate, with
a small validator for the schema subset it uses (`scripts/lib/json-schema-lite.mjs`), not a new dependency.

Experiment `E0` is the calibration: `baseline-v5` on seeds 1-8 against seeds 9-16 (`--seed-offset 8`), which must
give no `better` or `worse` verdict on any metric named as a Target in any design doc. The second arm is
`evals/baselines/baseline-v5-o8.json`. Recorded 2026-10-16: every Target `no-difference`; one non-Target false
positive (`eval.p90_fitness.scout` `worse`), the expected rate across 18 metrics given a verdict.

The `eval-smoke` gate (tier 2) runs `npm run eval -- --seeds 2 --ticks 10000 --policy live --config evals/smoke-config.json`
(`maxAgents` 150) into a temporary `--out` and fails on a worker error or a report that fails `validateReport`; it
takes about 6 s on the dev machine.

## Anti-exploit suite (Phase 3)

`test/evo/anti-exploit.test.js` runs each controller in `SCRIPTED_CONTROLLERS` for 5000 ticks on 2 seeds of the
micro-world `evals/micro-world.json` (2400 x 1600, 40 agents all running the controller, `maxFood` and
`initialFood` 60, 4 obstacles, `minAgents` 0), by calling `step` with `overrides.brain` set to the controller writing
`world.outputs`. Controller randomness draws from a forked `scripted` stream.

| Controller          | Behaviour                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `foodSeeker`        | Turns towards the nearest food ray hit and thrusts                                                   |
| `spinner`           | Full turn, half thrust, never steers                                                                 |
| `wanderer`          | Thrust with a random slow turn; turns away from food                                                 |
| `bumper`            | Turns towards the nearest agent ray hit and thrusts                                                  |
| `sitter`            | No thrust, no turn                                                                                   |
| `explorerAfterMeal` | Seeks food until it has eaten 140 (two average items), then thrusts straight and turns only at walls |
| `biteSeeker`        | A non-hunter that steers towards the nearest bigger agent ray hit                                    |

Each agent is scored at death or, if alive, at the last tick. For each fitness function under test, every exploiter's
mean fitness, as a share of the `foodSeeker`'s, is at most the larger of 0.5 and its food-energy share of the
`foodSeeker`'s plus 0.1: fitness that comes with eating is not an exploit, fitness without food is. (The bound was a
flat half until [evolution-rework.md](evolution-rework.md) Phase 1: `explorerAfterMeal` eats about two thirds of
what the `foodSeeker` eats in the micro-world, so any honest food-paying fitness scored it above half.) Against `fitnessV5` the exploiters that exceed that bound are marked
`test.fails`, each naming the [legacy-audit.md](legacy-audit.md) finding it demonstrates; [evolution-rework.md](evolution-rework.md) Phase 1 adds its
fitness to the suite with no expected failures. As built, the `sitter`, `spinner`, `bumper` and `explorerAfterMeal`
fail the bound under `fitnessV5`, all for FIT-8 (pay for age, distance and exploration without food); the `wanderer`
and `biteSeeker` stay under half. Controllers write thrust and turn only (sprint, mate and bite are 0).

## Champion league (Phase 4)

- A champion file is JSON: `version` 1, `name`, `rulesHash`, `layout` (`inputCount`, `brainHidden`,
  `outputCount`), `specialisation` (the spec index, 0 to 4), optional `cell` (its archive cell), `weights` (base64
  little-endian float32, encoded without `Buffer`). `league.js` rejects a file whose `layout` or `rulesHash` differs
  from the running config, naming the field.
- `evals/league.json` is `{ "version": 1, "champions": [{ "file", "name", "elo" }] }`, `file` relative to the repo.
- `matchPolicy(a, b)` builds a policy whose `initBrain` writes `a`'s weights into even slots and `b`'s into odd ones,
  whose `initSpec` returns that champion's specialisation, and whose `childBrain` is `baseline-v5`'s.
- `playMatch(a, b, seed)` runs a 100-agent world with that policy, `minAgents` 0 and no immigration for 50000 ticks,
  stopping early once both sides have died out. A side's agents are those whose `lineageId` is one of its founders'
  `genomeId`s. The side with more agents alive at the end wins; when both died out, the side whose last agent lived
  longer wins; otherwise it is a draw. The extinction rule is there because the default world does not sustain
  unevolved brains ([sim-notes.md](sim-notes.md)): without it every such game ends 0-0.
- `npm run league -- <candidate.json> [--admit]` (`scripts/league.mjs`) plays the candidate against every admitted
  champion on the first 8 seeds and updates only the candidate's Elo, game by game in seed then list order, from 1500.
  It reports `eval.champion_elo` and `eval.champion_win_rate`; `--admit` appends the candidate with that Elo. The
  candidate is side A; games run on the worker pool (`scripts/league-worker.mjs`, `--workers`, `--ticks`).

## Using every core

Headless runs are the only place the simulation is CPU-bound for hours, so they use the whole machine:

- One world is single-threaded and bit-exact; parallelism comes from running many worlds at once, one per worker.
- `npm run bench:parallel` (`scripts/bench-parallel.mjs`) runs the bench world (500 agents, 2000 ticks) in 1, 8, 16,
  24 and 32 workers at once and prints `bench.parallel_ticks_per_s@<n>`, the total ticks per second across all
  workers. It also prints the gain over one worker, so the effect of SMT and of the 7950X3D's two CCDs (one with
  3D V-Cache, one clocked higher) is measured rather than assumed.
- The result is recorded in [sim-notes.md](sim-notes.md) with the chosen default. When 32 workers beat 16 by under
  5%, the default becomes the physical core count instead, to leave the machine responsive.
- Workers are not pinned to cores: WSL hides the CCD layout from Linux, and the Windows scheduler places threads.
  Pinning is revisited only if the bench shows a gap of 10% or more between runs.
- `eval.mjs` prints the machine's CPU use every 10 s and for the whole run (`scripts/lib/cpu-use.mjs`, from
  `os.cpus()` time deltas), so an idle core shows up; `train.mjs` will print it per generation.
- Measured on the dev machine ([sim-notes.md](sim-notes.md), 2026-10-16): 32 workers give 14.7 - 15.2 times one
  worker and beat 16 by over 20%, so the default stays `os.availableParallelism()`.

## Phases

### Phase 1 - Eval runner, metrics and baseline (built)

**Targets:** none - creates the metrics and the baseline

The observer, metrics, `fitness-v5`, `baseline-v5`, the runner on `scripts/lib/worker-pool.mjs`, `npm run bench:parallel`,
`evals/seeds.json`, `evals/baselines/baseline-v5.json`, and `--policy` and `--follow` for replay. The baseline sits on
the `minAgents` floor: the default world does not sustain unevolved brains ([sim-notes.md](sim-notes.md), 2026-10-16),
which is what [evolution-rework.md](evolution-rework.md) is measured against. Each seed of the default eval took 77 s
on 8 workers.

### Phase 2 - Compare, ledger and smoke gate (built)

**Targets:** none - process

`eval:compare`, the ledger and its schema check, calibration experiment `E0`, and the `eval-smoke` gate.

### Phase 3 - Anti-exploit suite (built)

**Targets:** none - guards fitness

The scripted controllers, `evals/micro-world.json` and `test/evo/anti-exploit.test.js`.

### Phase 4 - Champion league (built)

**Targets:** none - creates `eval.champion_elo` and `eval.champion_win_rate`

`elo.js`, `league.js`, `npm run league` and an empty `evals/league.json`.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Pure modules in `js/evo/` (the module table), importing only `js/sim/` and `js/evo/`. Shells: `scripts/eval.mjs`, `scripts/eval-worker.mjs`, `scripts/lib/worker-pool.mjs`, `scripts/bench-parallel.mjs`, `scripts/eval-compare.mjs`, `scripts/check-experiments.mjs`, `scripts/league.mjs`, `scripts/league-worker.mjs`. Data: `evals/seeds.json`, `evals/smoke-config.json`, `evals/micro-world.json`, `evals/baselines/baseline-v5.json`, `evals/experiments.json`, `evals/experiments.schema.json`, `evals/league.json`. `scripts/replay.mjs` gains `--policy` and `--follow`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unit tests              | `test/evo/observer.test.js` (counters reset on birth; deaths handled before a same-tick birth into the slot), `test/evo/metrics.test.js` (each metric on hand-built observer state, each `null` rule, turnover ties and margin), `test/evo/policies/index.test.js` (unknown name lists the known ones), `test/evo/policies/baseline-v5.test.js` (sigma, macro chance and clamp; crossover draws only for `cause` `mate`), `test/evo/fitness-v5.test.js` (each legacy term on crafted counters), `test/evo/report.test.js` (validation names the field; `null` allowed only with a reason), `test/evo/compare.test.js` (identical reports give `no-difference`; a shifted metric gives `better` or `worse` by direction; mismatched seeds, ticks or config refused; `--allow-config-diff`; different `fitnessName` gives `-`; reproducible intervals), `test/evo/scripted.test.js`, `test/evo/anti-exploit.test.js`, `test/evo/elo.test.js` (published examples), `test/evo/league.test.js` (side assignment by founder; layout mismatch rejected; only the candidate's Elo moves), `test/eval-runner.test.js` (2 seeds x 2000 ticks twice give identical reports), `test/check-experiments.test.js` |
| Headless e2e            | The `eval-smoke` gate: 2 seeds x 10000 ticks of `evals/smoke-config.json` in tier 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Performance budget      | `eval-smoke` within 120 s on CI; `bench:parallel` at the default worker count gives at least 12 times the one-worker total on the dev machine (16 cores, 32 threads); each seed of a default eval within 25 minutes there, so 8 seeds run in one wave. No `bench.*` change: the observer runs outside `step`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evolution metrics       | Phase 1 records `evals/baselines/baseline-v5.json` at 8 seeds x 200000 ticks; Phase 2 records `E0`, which must show no verdict on any Target metric. Later docs judge their Targets against the baseline with `eval:compare`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Determinism             | Each seed's world is the resolved config with that `seed`; the observer's samples draw from a forked `eval` stream, the bootstrap from `fork(createRng(1), 'bootstrap')`, the controllers from `scripted`. Reports are keyed by seed, so worker scheduling does not change them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Config and persistence  | No new `createConfig` keys. New formats: the eval report, `evals/experiments.json` with its schema, `evals/micro-world.json`, the champion file and `evals/league.json`, defined above. No IndexedDB change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Logging and diagnostics | `scripts/eval.mjs` writes `.sim/logs/eval-<id>.jsonl`: `EvalStarted` (policy, seeds, ticks, workers, configHash), `SeedFinished` (seed, wallMs, worldHash), `SeedFailed` (seed, tick, error, stack), `EvalFinished` (out, wallMs). `eval-compare.mjs` prints `CompareRefused` with the mismatched field and exits 2. `check-experiments.mjs` names the entry and the schema path that failed. `league.mjs` logs `MatchPlayed` (seed, a, b, result, eloBefore, eloAfter, aliveA, aliveB): `a` and `b` are champion names, `result` is from the candidate's side. `--follow` logs `FollowSample` (tick, genomeId, x, y, energy, outputs), then `FollowEnded` (tick, genomeId, reason), or `FollowNeverSeen` (`scripts/lib/follow.mjs`). A failed seed reproduces with `npm run replay -- --policy <name> --config <file> --seed <s> --ticks <tick + 1>`, as printed by `eval.mjs`. With `OTEL_EXPORTER_OTLP_ENDPOINT` set, checkpoint population, births and deaths go out through `scripts/lib/otel.mjs` tagged with policy and seed                                                                                                                                                                 |
| Browser compatibility   | N/A - evals run in Node only; `browser.*` metrics are only defined here and are measured by `scripts/browser-perf.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Docs                    | `AGENTS.md` Commands: `npm run eval` (Phase 1), `eval:compare` (Phase 2), `league` (Phase 4); the `run-evolution-loop` skill's commands, ledger fields and calibration step (Phase 2). This doc becomes `Implemented` when Phase 4 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Verification            | `scripts/check.sh` green including `eval-smoke`; the steps in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Task breakdown

### Phase 1 - Eval runner, metrics and baseline

| #   | Task                                                                                                                                                                                                     | Nature       | Depends on                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------ |
| T1  | Add `js/evo/observer.js` with tests                                                                                                                                                                      | [judgement]  | -                                    |
| T2  | Add `js/evo/metrics.js` with tests                                                                                                                                                                       | [judgement]  | T1                                   |
| T3  | Add `js/evo/fitness-v5.js` with tests                                                                                                                                                                    | [judgement]  | T1                                   |
| T4  | Add `js/evo/policies/index.js` and `js/evo/policies/baseline-v5.js` with tests                                                                                                                           | [judgement]  | T3                                   |
| T5  | Add `js/evo/report.js`, `scripts/eval.mjs`, `scripts/eval-worker.mjs`, `evals/seeds.json`, `npm run eval`, `test/eval-runner.test.js` and the `AGENTS.md` command                                        | [judgement]  | T2, T4                               |
| T6  | Add `--policy` and `--follow` to `scripts/replay.mjs` with tests                                                                                                                                         | [mechanical] | T4                                   |
| T5a | Add `scripts/lib/worker-pool.mjs` and its test (results in task order whatever the pool size; a failed task rejects naming its index), and move `eval.mjs` onto it with `--workers` and the CPU-use line | [judgement]  | T5                                   |
| T5b | Add `scripts/bench-parallel.mjs` and `npm run bench:parallel`; run it on the dev machine and record the curve and the default in `sim-notes.md`; add the `AGENTS.md` command                             | [judgement]  | T5a                                  |
| T7  | Record `evals/baselines/baseline-v5.json` on the dev machine                                                                                                                                             | [mechanical] | T5b                                  |
| T8  | Conformance review of Phase 1                                                                                                                                                                            | [judgement]  | T1, T2, T3, T4, T5, T5a, T5b, T6, T7 |

### Phase 2 - Compare, ledger and smoke gate

| #   | Task                                                                                                     | Nature       | Depends on             |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| T9  | Add `js/evo/compare.js`, `scripts/eval-compare.mjs` and `npm run eval:compare` with tests                | [judgement]  | T8                     |
| T10 | Add `evals/experiments.json`, its schema, `scripts/check-experiments.mjs` in `conventions`, and its test | [mechanical] | T8                     |
| T11 | Add `evals/smoke-config.json` and the `eval-smoke` gate                                                  | [mechanical] | T8                     |
| T12 | Run calibration experiment `E0` and record it                                                            | [mechanical] | T9, T10                |
| T13 | Update `AGENTS.md` and the `run-evolution-loop` skill                                                    | [mechanical] | T9, T10, T11, T12      |
| T14 | Conformance review of Phase 2                                                                            | [judgement]  | T9, T10, T11, T12, T13 |

### Phase 3 - Anti-exploit suite

| #   | Task                                                                                                        | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T15 | Add `js/evo/scripted.js` and `evals/micro-world.json` with tests                                            | [judgement] | T14        |
| T16 | Add `test/evo/anti-exploit.test.js`, marking the `fitnessV5` exploiters that pass the bound as `test.fails` | [judgement] | T15        |
| T17 | Conformance review of Phase 3                                                                               | [judgement] | T15, T16   |

### Phase 4 - Champion league

| #   | Task                                                                                                                                 | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T18 | Add `js/evo/elo.js` with tests                                                                                                       | [mechanical] | T17        |
| T19 | Add `js/evo/league.js`, `scripts/league.mjs`, `npm run league`, an empty `evals/league.json` and the `AGENTS.md` command, with tests | [judgement]  | T18        |
| T20 | Conformance review of Phase 4                                                                                                        | [judgement]  | T18, T19   |

## Verification

1. `scripts/check.sh` is green, including `eval-smoke`.
2. `npm run eval -- --seeds 2 --ticks 2000` run twice writes reports identical apart from the output path.
3. `npm run eval:compare -- evals/baselines/baseline-v5.json evals/baselines/baseline-v5.json` gives
   `no-difference` or `-` everywhere; comparing it with a 2-seed report exits 2 naming `seeds`.
4. Experiment `E0` in `evals/experiments.json` shows no `better` or `worse` on any Target metric.
5. `npm run replay -- --policy baseline-v5 --seed 1 --ticks 5000 --follow <genomeId>` logs `FollowSample` until that
   agent dies.
6. `npx vitest run test/evo/anti-exploit.test.js` passes, with each expected failure naming its [legacy-audit.md](legacy-audit.md)
   finding.
7. `npm run league -- <champion.json>` against an empty league plays no games and leaves the candidate at Elo 1500.
