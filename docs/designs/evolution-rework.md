# Evolution rework

**Status:** Proposed - Phase 1 replaces the genome, mutation, crossover and fitness, judged against `baseline-v5`.
**Validated:** bd49bce (2026-10-11)
**Priority:** 3 - better evolution is what makes a run worth watching, and it needs the evals to prove it
**Depends on:** [headless-sim-core.md](headless-sim-core.md), [evolution-evals.md](evolution-evals.md)

`js/evo/` decides which brains get born. The headless sim core runs bodies and brains; evolution supplies the
policy that writes new brains, scores agents at death, keeps an archive of diverse elites and feeds immigrants from
it.

- A genome is versioned and layout-checked. A genome that does not fit the running layout is rejected with an error,
  never randomised.
- Fitness is counted in ticks and built from events: energy gained, offspring and capped survival, plus one capped
  term per specialisation that pays only after eating.
- A MAP-Elites archive per specialisation keeps the best-tested genome for each kind of behaviour and re-tests both
  elites and challengers.
- The live policy keeps natural births. The archive seeds the initial agents and every immigrant, so archived
  behaviours keep re-entering the world as new lineages.
- It replaces the legacy defects recorded in [legacy-audit.md](legacy-audit.md) under NN-5, NN-9, FIT-1 to FIT-7 and SEL-1 to SEL-5.

## Modules

| Module                             | Exports                                                              | Does                                                                                |
| ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `js/evo/genome.js`                 | `assertGenomeFits`, `encodeGenome`, `decodeGenome`                   | Genome shape, layout check, base64 float32 encoding                                 |
| `js/evo/mutation.js`               | `mutateSigma`, `mutateWeights`, `randomWeights`                      | Self-adaptive step size, per-weight Gaussian mutation, random init                  |
| `js/evo/crossover.js`              | `crossNeurons`                                                       | Neuron-block uniform crossover                                                      |
| `js/evo/life-counters.js`          | `createLifeCounters`, `updateLifeCounters`                           | The counters below, beside the evals observer                                       |
| `js/evo/fitness.js`                | `fitnessV1`, `FITNESS_V1`                                            | Fitness at death from observer and life counters                                    |
| `js/evo/welford.js`                | `welfordAdd`, `welfordMean`, `welfordSd`                             | Running mean and variance in a `Float64Array` triple                                |
| `js/evo/archive.js`                | `createArchive`, `offer`, `nextClone`, `selectParent`, `seedArchive` | Per-specialisation 10 x 10 grid of elites and challengers in preallocated rows      |
| `js/evo/archive-codec.js`          | `encodeArchive`, `decodeArchive`                                     | Archive JSON for all five specialisations                                           |
| `js/evo/policies/natural-v1.js`    | `createNaturalV1`                                                    | Phase 1 policy: new genome, mutation, crossover and `fitnessV1`; random immigrants  |
| `js/evo/policies/map-elites-v1.js` | `createMapElitesV1`                                                  | Phase 2 policy: `natural-v1` plus the archive feeding initial agents and immigrants |
| `js/evo/policies/champions-v1.js`  | `createChampionsV1`                                                  | Phase 3 policy: immigrants are mutated champions                                    |
| `js/evo/trainer.js`                | `runEpisode`, `mergeEpisode`                                         | Headless episode on a training seed; deterministic merge into the archive (Phase 3) |

Policies are factories ([evolution-evals.md](evolution-evals.md)): every per-run array lives in the returned object. Each policy keeps,
per slot, `sigma` (`Float32Array`), `archiveRef` (`Int32Array`: specialisation x 100 + cell, or -1) and `isClone`
(`Uint8Array`), and per mother `fatherSigma`, written in `onMate`.

## Genome

| Field             | Holds                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| `version`         | `1`                                                                   |
| `id`, `lineageId` | The agent's `genomeId` and `lineageId`                                |
| `parents`         | `[parentA, parentB]`, `[0, 0]` for a random genome                    |
| `specialisation`  | One of the five specialisation names                                  |
| `layout`          | `inputCount`, `brainHidden`, `outputCount` from `brainLayout(config)` |
| `sigma`           | The agent's own mutation step size                                    |
| `weights`         | `Float32Array` of the layout's `weightCount`                          |

`assertGenomeFits(genome, layout)` throws naming the field, the genome's value and the layout's. The archive copies a
genome out of the slot's `weights` row in `onDeath`, before the core frees the slot, into its own preallocated rows;
a genome entering the world is checked, then copied into the slot's row.

## Mutation and crossover

- **Step size.** A child's `sigma` is the parent mean times `detExp(tau x N(0, 1))` with `tau = 1 / sqrt(weightCount)`
  (single step size), clamped to `0.002..0.5`. Random genomes start at `0.05`. Splits mutate `sigma` the same way.
- **Weights.** Each weight gains `sigma x N(0, 1)` and is clamped to `-4..4`. Every child is mutated.
- **Crossover.** For `cause` `mate`, each hidden neuron's block (its row of `wIn` and `wRec`, its `bHidden` entry and
  its column of `wOut`) comes from the mother or the father with probability 0.5; `bOut` comes from the mother. The
  parent mean `sigma` uses `fatherSigma`. For `split`, the child copies the parent.
- **Random genomes.** Weights into hidden units draw `N(0, 1 / sqrt(inputCount + brainHidden))`, weights into
  outputs `N(0, 1 / sqrt(brainHidden))` (standard deviations); biases start at 0.

All draws come from the stream the core passes: `brain-init` for `initBrain`, `mutation` for `childBrain`.

## Life counters

`life-counters.js` adds, per slot, beside the evals observer, updated in the policy's `afterStep`:

| Counter            | Source                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `cells300`         | Distinct 300 px cells entered (48 x 27 bitset), sampled every 10 ticks                                                                      |
| `kinBitesAbsorbed` | Energy lost to bites (`bittenTimer` reset this tick) while a kin agent is within 300 px, found by scanning alive agents only on those ticks |
| `speedMean`        | The motion grid's speed mean (`speedSum / samples`, clamped to 1)                                                                           |
| `crowdingMean`     | Every 100 ticks, from `inputs` after `step`: the highest ray proximity whose class is an agent, averaged                                    |

## Fitness

`fitnessV1` (`fitnessName` `v1`, shared by every policy here) is computed in `onEvent` for each `AgentDied`, after the
observer has handled it, and for agents alive at the
end of an eval at the last tick:

| Term       | Value                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Energy `E` | `foodEnergy + biteEnergy`                                                                    |
| Offspring  | 300 per child, counted once per child for each distinct parent                               |
| Survival   | `0.02 x min(ageTicks, 30000)`                                                                |
| Spec term  | By specialisation, below, capped at `foodEnergy` and paid only once `foodEnergy` reaches 500 |

| Specialisation | Spec term                                    |
| -------------- | -------------------------------------------- |
| `forager`      | `0.2 x foodEnergy`                           |
| `predator`     | `150 x kills`                                |
| `reproducer`   | `150 x children` (Offspring totals 450 each) |
| `scout`        | `2 x cells300`                               |
| `defender`     | `0.5 x kinBitesAbsorbed`                     |

`test/evo/anti-exploit.test.js` ([evolution-evals.md](evolution-evals.md)) runs against `fitnessV1` with no expected failures, including
`explorerAfterMeal` and `biteSeeker`.

## Archive

One 10 x 10 grid per specialisation. Descriptor x is `speedMean`, y is `crowdingMean`, each binned over 0..1. Each
cell holds an **elite** and a **challenger**: a genome row, its `sigma`, and Welford statistics of its fitnesses.

- **Uncertainty.** A genome's lower bound is `mean - 1.96 x sd / sqrt(n)`, where `sd` is its own once `n >= 2` and
  otherwise `mean x cv`. `cv` is the median of `sd / mean` over the archive's genomes with `n >= 2`, and `0.3` until
  five such genomes exist.
- **Offer.** In `onDeath` the policy copies the dying agent's row and `sigma` into a preallocated offer buffer; in
  `onEvent` for its `AgentDied`, an agent that reached `maturityTicks` is scored and offered to its specialisation's cell. A clone
  (`isClone`) adds its fitness to the genome its `archiveRef` names. Otherwise an empty cell takes it as the elite;
  a fitness at or above the elite's mean takes the challenger place when the challenger is empty or has `n = 1` and a
  lower fitness.
- **Replace.** A challenger with `n >= 2` whose lower bound exceeds the elite's replaces it, keeping its statistics;
  the challenger place empties.
- **Clones.** `nextClone` cycles over cells in order and returns the first challenger with `n < 3`, otherwise the
  elite with the smallest `n`.
- **Select.** `selectParent` picks a uniform occupied cell, then the best mean of 3 elites drawn with replacement from
  that cell and its occupied neighbours.
- **Seed.** `seedArchive(archive, champion)` places a champion as the elite of its `cell` with `n = 1` and its
  fitness unknown (mean 0), so the first tested challenger can replace it.
- Rows are preallocated: 5 x 100 x 2 genome rows of `weightCount` floats.

## Live policy

`createMapElitesV1({ config, log, archive? })` is `natural-v1` plus the archive:

- **Initial agents and immigrants** (`initBrain`): while the archive has fewer than 10 occupied cells, random. After
  that: 0.5 a mutated child of `selectParent`, 0.3 an unmutated clone from `nextClone` (`isClone` set, `archiveRef`
  recorded), 0.2 random.
- **Specialisation** (`initSpec`): the specialisation with the fewest alive agents, ties to the lowest index.
- **Births** follow `natural-v1`; a child of a clone is not a clone.
- `immigrationInterval` (600 ticks) brings one immigrant every 10 s at 60 ticks per second, so the archive reaches
  the world whether or not the population floor fires.
- `ImmigrantSeeded` (debug: spec, source `archive`, `clone` or `random`, archiveRef) records each choice.
- `LIVE_POLICY` in `js/evo/policies/index.js` is `map-elites-v1` from Phase 2.

## Trainer (Phase 3)

`npm run train -- --generations <g> [--episodes <e>] [--workers <n>] [--resume <archive.json>] --out <dir>`
(`scripts/train.mjs`):

- Episode `k` of generation `g` runs on `evals/train-seeds.json` entry `(g x e + k) mod 256` (256 seeds disjoint
  from `evals/seeds.json`), with the default config and `initialAgents` 100, for 20000 ticks. Its initial agents and
  immigrants come from a frozen copy of the archive.
- Episodes run on the shared `scripts/lib/worker-pool.mjs` from [evolution-evals.md](evolution-evals.md) (Using every core),
  with its default worker count. `--episodes` defaults to 32, a fixed number so the archive never depends on the
  machine; 32 episodes keep all 32 threads busy for a whole generation. The pool returns episodes in index order,
  so `--workers 1` and `--workers 32` produce byte-identical archives.
- `train.mjs` prints the CPU use for each generation. Each episode returns its offers in death order, each tagged with its `archiveRef` and
  `isClone`; `mergeEpisode` applies them offer by offer in episode-index order.
- A failed episode stops the run with exit 1 and `TrainEpisodeFailed`.
- `--resume` checks the archive's `layout` and `rulesHash` against the config.
- After each generation it writes `<dir>/archive-<g>.json` and logs `TrainGeneration`.
- `npm run train:export -- --archive <file> --out public/champions/v1/` writes one champion file per specialisation
  (the elite with the highest lower bound, with its `cell`) in the [evolution-evals.md](evolution-evals.md) format, and `index.json`
  listing them.
- `createChampionsV1` mutates a champion of the immigrant's specialisation for each immigrant.

## Phases

### Phase 1 - Genome, mutation, crossover and fitness

**Targets:** eval.food_energy_per_1k, eval.median_lifespan

`genome.js`, `mutation.js`, `crossover.js`, `life-counters.js`, `fitness.js` and `natural-v1`. Done when
`eval:compare` of `natural-v1` against `baseline-v5` (8 seeds x 200000 ticks) is `better` on both Targets and `worse`
on no directional metric, and the anti-exploit suite passes with no expected failures.

### Phase 2 - MAP-Elites archive and live policy

**Targets:** eval.diversity, eval.lineage_turnover, eval.lineages_alive

`welford.js`, `archive.js`, `archive-codec.js` and `map-elites-v1`. Done when `map-elites-v1` against `natural-v1`
is `better` on the Targets and `worse` on neither Phase 1 Target; `eval.qd_score` and `eval.coverage` are recorded
from the `map-elites-v1` report with no verdict.

### Phase 3 - Headless trainer and champions

**Targets:** eval.food_energy_per_1k

`trainer.js`, `npm run train`, `npm run train:export`, `public/champions/v1/` and `champions-v1`. Done when
`champions-v1` is `better` than `baseline-v5` on the Target; each champion is admitted to the league in
specialisation order with `--admit`, and its `eval.champion_elo` is recorded.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Pure modules in `js/evo/` (the Modules table) importing only `js/sim/` and `js/evo/`. Shells: `scripts/train.mjs`, `scripts/train-worker.mjs`, `scripts/train-export.mjs`. Data: `evals/train-seeds.json`, `public/champions/v1/`. The policy hooks (`onMate`, `onDeath`, `initSpec`), `fatherId`, `fatherLineage`, immigration and `rulesHash` come from [headless-sim-core.md](headless-sim-core.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Unit tests              | `test/evo/genome.test.js` (each mismatched layout field throws by name; encode and decode bit-exact). `test/evo/mutation.test.js` (tau, sigma bounds, every child differs, delta mean and variance match sigma on a fixed seed, random-init deviations). `test/evo/crossover.test.js` (whole neuron blocks from one parent; `split` copies). `test/evo/life-counters.test.js` (cells, kin-bite absorption only with kin near, speed clamp, crowding from inputs). `test/evo/fitness.test.js` (each term; spec terms zero below 500 food energy and capped at food energy; split child counted once). `test/evo/welford.test.js`. `test/evo/archive.test.js` (empty cell takes the first offer; one lucky evaluation never replaces; a challenger with two good evaluations does; clone fitness reaches its genome after the slot is reused the same tick; `nextClone` order; selection only from occupied cells; `seedArchive`). `test/evo/archive-codec.test.js` (round trip; layout and `rulesHash` mismatch rejected). `test/evo/policies/natural-v1.test.js`, `map-elites-v1.test.js` (random below 10 cells, source mix, least-populated spec), `champions-v1.test.js`. `test/evo/trainer.test.js` (merge order independent of completion order; two runs of 2 generations x 2 episodes give the same archive). `test/train-export.test.js` (one file per spec with `cell`). The anti-exploit suite with no expected failures |
| Headless e2e            | `eval-smoke` runs `--policy live`, which is `map-elites-v1` once T13 sets `LIVE_POLICY`; `test/evo/trainer.test.js` is the trainer's end-to-end run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Performance budget      | `npm run bench -- --policy map-elites-v1` stays within `bench-check`'s 15% of the reference-policy baseline; with `minAgents = maxAgents` every death calls the archive, so the bench is its worst case. A training generation of 8 episodes is measured in T17 and recorded in [sim-notes.md](sim-notes.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Evolution metrics       | Phase 1: `natural-v1` vs `baseline-v5` `better` on `eval.food_energy_per_1k` and `eval.median_lifespan`. Phase 2: `map-elites-v1` vs `natural-v1` `better` on `eval.diversity`, `eval.lineage_turnover` and `eval.lineages_alive`. Phase 3: `champions-v1` vs `baseline-v5` `better` on `eval.food_energy_per_1k`. All at 8 seeds x 200000 ticks, recorded as experiments `E1` to `E3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Determinism             | Mutation and crossover draw from `mutation`, immigrant choices from `brain-init`; each eval seed starts with an empty archive; trainer episodes use fixed training seeds and merge in episode order. A run replays from seed, config, policy name and starting archive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Config and persistence  | No `createConfig` keys; policy constants (sigma bounds, source mix 0.5/0.3/0.2, best-of-3, fitness weights, `cv` default) are named exports of their modules. New formats: the genome, the archive JSON (all five specialisations, with `layout` and `rulesHash`) and `public/champions/v1/` (one champion file per specialisation plus `index.json`). The browser's IndexedDB store belongs to [worker-and-renderer.md](worker-and-renderer.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Logging and diagnostics | Through the policy's `log`: `ArchiveReplaced` (info: spec, cell, oldId, newId, oldLower, newLower, n), `ChallengerSet` (debug: spec, cell, id, fitness), `ImmigrantSeeded` (debug), `GenomeRejected` (error: field, expected, actual). The trainer logs `TrainGeneration` (generation, occupied, qdScore, best lower bound per spec) and `TrainEpisodeFailed` (generation, episode, seed, error). Reproduce an agent with `npm run replay -- --policy <name> --seed <s> --ticks <t> --follow <genomeId>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Browser compatibility   | N/A - `js/evo/` is DOM-free and runs unchanged in the worker; the browser side is [worker-and-renderer.md](worker-and-renderer.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Docs                    | `AGENTS.md` Commands (`npm run train` in T15, `train:export` in T16); [sim-notes.md](sim-notes.md) training measurements; the `run-evolution-loop` skill names `natural-v1` and `map-elites-v1` as arms. This doc becomes `Implemented` when Phase 3 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Verification            | `scripts/check.sh` green; each phase's `eval:compare` output attached to its PR; the steps in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Task breakdown

### Phase 1 - Genome, mutation, crossover and fitness

| #   | Task                                                                                                           | Nature       | Depends on                 |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| T1  | Add `js/evo/genome.js` with tests                                                                              | [judgement]  | -                          |
| T2  | Add `js/evo/mutation.js` with tests                                                                            | [judgement]  | T1                         |
| T3  | Add `js/evo/crossover.js` with tests                                                                           | [judgement]  | T1                         |
| T4  | Add `js/evo/life-counters.js` with tests                                                                       | [judgement]  | -                          |
| T5  | Add `js/evo/fitness.js` with tests; add `fitnessV1` to the anti-exploit suite and remove its expected failures | [judgement]  | T4                         |
| T6  | Add `js/evo/policies/natural-v1.js` with tests and register it                                                 | [judgement]  | T2, T3, T5                 |
| T7  | Run `natural-v1` against `baseline-v5` and record experiment `E1`                                              | [mechanical] | T6                         |
| T8  | Conformance review of Phase 1                                                                                  | [judgement]  | T1, T2, T3, T4, T5, T6, T7 |

### Phase 2 - MAP-Elites archive and live policy

| #   | Task                                                                                      | Nature       | Depends on             |
| --- | ----------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| T9  | Add `js/evo/welford.js` and `js/evo/archive.js` with tests                                | [judgement]  | T8                     |
| T10 | Add `js/evo/archive-codec.js` with tests                                                  | [mechanical] | T9                     |
| T11 | Add `js/evo/policies/map-elites-v1.js` with tests and register it                         | [judgement]  | T9                     |
| T12 | Add `--policy` to `npm run bench`; run `eval-smoke` locally with `--policy map-elites-v1` | [mechanical] | T11                    |
| T13 | Run `map-elites-v1` against `natural-v1`, record experiment `E2`, and set `LIVE_POLICY`   | [mechanical] | T10, T12               |
| T14 | Conformance review of Phase 2                                                             | [judgement]  | T9, T10, T11, T12, T13 |

### Phase 3 - Headless trainer and champions

| #   | Task                                                                                                                                                                                                                                             | Nature       | Depends on         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------ |
| T15 | Add `js/evo/trainer.js`, `scripts/train.mjs`, `scripts/train-worker.mjs`, `evals/train-seeds.json`, `npm run train` and the `AGENTS.md` command, with tests; `test/evo/trainer.test.js` checks that one and four workers give identical archives | [judgement]  | T14                |
| T16 | Add `scripts/train-export.mjs`, `npm run train:export` and `js/evo/policies/champions-v1.js`, with tests                                                                                                                                         | [judgement]  | T15                |
| T17 | Train, export `public/champions/v1/`, run `champions-v1` against `baseline-v5`, admit the champions, record experiment `E3`                                                                                                                      | [mechanical] | T16                |
| T18 | Update [sim-notes.md](sim-notes.md) and the `run-evolution-loop` skill                                                                                                                                                                           | [mechanical] | T17                |
| T19 | Conformance review of Phase 3                                                                                                                                                                                                                    | [judgement]  | T15, T16, T17, T18 |

## Verification

1. `scripts/check.sh` is green, and `test/evo/anti-exploit.test.js` passes with no expected failures.
2. A genome with a different `brainHidden` passed to `assertGenomeFits` throws naming `brainHidden`.
3. `npm run eval:compare -- <baseline-v5.json> <natural-v1.json>` shows `better` on `eval.food_energy_per_1k` and
   `eval.median_lifespan`.
4. The seed-1 `map-elites-v1` report has `eval.lineage_turnover` above 0, and its replay log has `ArchiveReplaced`
   events.
5. `npm run train -- --generations 2 --episodes 4 --out .sim/train/check` run twice writes identical archives.
