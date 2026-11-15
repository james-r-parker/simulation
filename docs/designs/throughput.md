# Throughput

**Status:** Proposed - find and take the speed the kernel squeezes left: why 16 worlds on 16 cores run at 63% of one world's speed, loops over empty slots, set-up cost in small worlds, and a bench that reads one window; Phase 1 (measure) is first.
**Validated:** a1813ff3 (2026-11-15)
**Priority:** 12 - every eval, screen and training run waits on ticks per second across workers, and Phases 1 to 4 change no behaviour, so the measuring phase runs beside the world work; the kernel work itself is done ([wasm-kernels.md](wasm-kernels.md) Phases 5 and 6)
**Depends on:** [wasm-kernels.md](wasm-kernels.md)

> Companion to [wasm-kernels.md](wasm-kernels.md), which moved the brain, the ray march, the spatial hash, the pheromone update and physics to Rust and squeezed each kernel under a bit-identical contract. This doc does not repeat a squeeze that doc tried and reverted.

The step is fast enough for the app: 1.7 ms a tick at 500 slots against a 4.2 ms frame at 240 Hz. The cost that binds is the eval and training throughput: a 64-seed keep-rule run is 12.8 million ticks. This doc measures where that time goes across workers, then takes the gains that keep every `worldHash` equal. The gains that change a rounding or a behaviour are measured as spikes and left for the user.

## Measured on 2026-11-15

AMD Ryzen 9 7950X3D (16 cores, 32 threads, 1 MiB L2 a core, 96 MiB L3 on one half of the cores), load under 1, under the CPU lock. `origin/main` at a1813ff3.

| Reading                                  | Value                                                                                                                    | Command                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `bench.step_ms@500` with the live policy | 1.71 ms; `bench.observe_ms@500` 0.13 ms (8% of a tick)                                                                   | `npm run bench -- --policy map-elites-v6 --sizes=500`          |
| Phases at 500                            | sense 0.30, brain 0.26, physics 0.14, field 0.13, lifecycle 0.08, hash 0.07, environment 0.03, merit 0.02: 1.07 ms       | the same run                                                   |
| Step less the sum of its phases          | 0.64 ms, 37% of the step, in no phase                                                                                    | the same run                                                   |
| One worker                               | 419 ticks a second                                                                                                       | `npm run bench:parallel -- --counts 1,8,16,24,32 --ticks 2000` |
| 8, 16, 24, 32 workers                    | 6.4x, 10.1x, 10.9x, 11.2x: 80%, 63%, 45%, 35% of one worker's speed each                                                 | the same run                                                   |
| Self time, 500-slot bench world          | Three kernels 60% (32.5%, 19.8%, 7.6%); `castSlot` 4.6%, `grazeHerds` 3.2%, `integrate` 2.0%; no other function above 2% | `node --cpu-prof scripts/bench.mjs --sizes=500`                |
| Brain weights of one world               | 4926 `f32` weights an agent, 9.9 MB at 500 slots; 16 worlds hold 158 MB against a 96 MiB L3                              | `brainLayout` in `js/sim/brain-layout.js`                      |
| Transparent huge pages                   | `madvise`: the WASM memory is on 4 KiB pages                                                                             | `/sys/kernel/mm/transparent_hugepage/enabled`                  |

## Leads

Each is a question for a task, not a finding.

| #   | Lead                                                                                                                                                                                                                                                                               | Checked by |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | Sixteen worlds on sixteen cores lose 37% each. All-core clock speed explains part. The rest fits memory: a tick reads each living agent's weights once, about 3 MB a world, over a core's L2 and, across 16 worlds, near the L3. The brain "resists squeezing" for the same reason | T2, T3     |
| P2  | The WASM memory sits on 4 KiB pages. A 10 MB weight block is 2400 pages walked once a tick                                                                                                                                                                                         | T3         |
| P3  | `bench.step_ms` and the phase medians come from different tick windows of one evolving world (`scripts/bench.mjs`), and "@500" is 500 slots, about 300 alive. A third of the step is in no phase                                                                                   | T1         |
| P4  | Eight per-tick loops walk every food slot (`maxFood` 3600): `ageFood`, `grazeHerds`, and the loops in `js/sim/carcass.js`, `js/sim/herd-life.js` and `js/sim/flora-state.js`. The field phase costs 0.13 ms at 100, 250 and 500 agents alike: 26% of the step at 100               | T6         |
| P5  | Drills, probes and stage arenas are small worlds with the default `maxFood` and grids. World birth (`allocateWorld`, `attachWasm`) and collection were about 10% of a drill trial ([wasm-kernels.md](wasm-kernels.md) Phase 5)                                                     | T9         |
| P6  | `castSlot` and the sense glue are the largest JS left (4.6% and about 5% more): one call into the kernel and one class decision per caster and hit                                                                                                                                 | T7         |
| P7  | The mating and split gates scan all slots per hunter (`territoryAllows`, `isReadyToMate`, `splitRanked`): about 3% today, and it grows with the square of the hunters                                                                                                              | T7         |
| P8  | A world whose population is 0 with the floor off keeps ticking to the end of an eval, a screen arm or an episode                                                                                                                                                                   | T10        |
| P9  | 32 workers give 11% more than 16 for twice the CPU, and half the cores have a third of the L3. Which cores a worker runs on is left to the scheduler                                                                                                                               | T4         |

## Phases

### Phase 1 - Measure

**Targets:** none - bench tools and readings; no sim behaviour change

- **One window.** `scripts/bench.mjs` times the step and its phases on the same ticks, and prints the mean agents alive and `bench.agent_us@<n>` (step microseconds per living agent) beside `bench.step_ms@<n>`. `bench/baseline.json` gains the new keys in its own commit.
- **Scaling by part.** `npm run bench:parallel -- --part <name>` runs one part on every worker: `world` (today), `brain` (`brain_forward` on the micro world of `bench/micro/`), `sense`, and `spin` (a `tanh` loop over 4 KiB: no memory traffic). The table prints each part's efficiency at each count.
- **Pages and cores.** The same table with transparent huge pages `always`, and with workers pinned by `taskset` to the cores with the large L3, to the others, and to one thread a core.

Prediction, written before the run (`E-TP-1`): at 16 workers `spin` keeps at least 85% of one worker's speed and `brain` at most 65%, so most of the loss is memory, not clock speed; huge pages lift `brain` by 5% or more at 1 worker; 16 workers pinned one a core beat 16 unpinned. Falsified when `spin` falls as far as `brain`: the loss is the clock, nothing in the sim can take it back, and Phase 2 is dropped.

#### Chunks

| Chunk | Tasks    | Holds                                                          |
| ----- | -------- | -------------------------------------------------------------- |
| A     | T1, T2   | The bench window and the part table (code, Sonnet)             |
| B     | T3 to T5 | The runs on a quiet machine, the verdict and the review (runs) |

### Phase 2 - Memory and the machine

**Targets:** bench.parallel_ticks_per_s@16, bench.parallel_ticks_per_s@32

Built only for what Phase 1 confirms. Every change keeps every `worldHash`.

| Finding that opens it                | Change                                                                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Huge pages help                      | `scripts/lib/worker-pool.mjs` prints a one-line hint when the setting is `madvise` or `never`; `AGENTS.md` names the setting for an eval machine. No code path depends on it                               |
| Pinning helps                        | The worker pool takes `--pin` (`taskset` per worker, one a core, large-L3 cores first) and `npm run eval`, `screen`, `train` and `bench:parallel` pass it through; the recommended worker count is re-read |
| The brain is bound by memory traffic | A read-only weight row is shared by agents of one genome (clone founders): the brain reads through a per-slot row index, and a row is copied on its first write (mutation at birth, the plastic block)     |
| The brain is bound by memory traffic | The brain phase visits slots in the order of their weight rows, and the kernel reads each agent's used input rows in address order                                                                         |

Each is kept only outside the printed margin of `bench:parallel` (three alternating runs) and with the goldens, the wasm differential tests and `npm run browser:hash` unchanged.

#### Chunks

| Chunk | Tasks | Holds                                                           |
| ----- | ----- | --------------------------------------------------------------- |
| C     | T6a   | The changes Phase 1 opened, each kept or reverted on its number |

### Phase 3 - Loops over what is alive

**Targets:** bench.step_ms@500, bench.phase_ms.field@500, bench.phase_ms.field@100, bench.phase_ms.sense@500

| Loop                               | Change                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The per-tick food loops (P4)       | One pass over the food slots a tick builds a scratch list of live food by kind (`js/sim/food-live.js`, new, no allocation); `ageFood`, `grazeHerds`, the carcass, herd-life and flora loops walk the list in slot order |
| `castSlot` and the sense glue (P6) | The per-hit class decision (`agentChannel`) for all of a caster's hits in one loop over the gather, and `writeBodyInputs`, `writeScentInputs` and `writeRefugeInputs` writing one agent's row in one call               |
| The mating and split gates (P7)    | A per-tick scratch list of mature hunter slots, built in the lifecycle phase from the arrays and never kept across ticks, read by `territoryAllows`                                                                     |
| `detCos`, `detLog` at rule sites   | Left alone unless T7's profile puts either above 1.5%: they are the determinism contract                                                                                                                                |

A list built from the arrays each tick cannot go stale, which is why [wasm-kernels.md](wasm-kernels.md) T27 dropped a list kept across calls. Slot order is kept, so every RNG draw and event keeps its place. Each change is kept only outside the margin of `npm run bench:parts -- --area <phase> --compare <base>`.

#### Chunks

| Chunk | Tasks    | Holds                                                        |
| ----- | -------- | ------------------------------------------------------------ |
| D     | T6 to T8 | The lists and the glue, each kept or reverted (code, Sonnet) |

### Phase 4 - Small worlds and dead worlds

**Targets:** bench.drill_trials_per_s

| Cost                           | Change                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small worlds at full size (P5) | The staged arenas (`stageWorld` in `js/evo/pool-discrimination-stage.js`, the drill and probe stages) and the stage configs of [training-stages.md](training-stages.md) set `maxFood` and `maxAgents` to what the stage holds     |
| World birth per trial (P5)     | `playTrial` in `js/evo/memory-probe-run.js` takes a world to reset in place of building one: `resetWorld` (new, `js/sim/world-reset.js`) zeroes the state arrays and re-seeds, with a test that a reset world hashes as a new one |
| Dead worlds (P8)               | `runEpisode`, the eval worker and the screen stop a world at population 0 when its config has no floor, and fill its remaining checkpoints as the observer would; the report is byte-identical to the run that kept ticking       |
| Batched drills                 | [wasm-kernels.md](wasm-kernels.md) Phase 3 owns it; not repeated here                                                                                                                                                             |

#### Chunks

| Chunk | Tasks     | Holds                                                    |
| ----- | --------- | -------------------------------------------------------- |
| E     | T9 to T11 | Arena sizes, the reset and the early stop (code, Sonnet) |

### Phase 5 - Spikes for the user's decision

**Targets:** none - throwaway branches that measure speed only; nothing merges from this phase

The brain is a third of the step and its sums are exact by contract: `f32` weights widened to `f64`, a fixed order, no fused multiply-add ([wasm-kernels.md](wasm-kernels.md), Decisions). The levers left change a rounding or a behaviour, which the user ruled out for that doc. Each spike is one branch that measures `bench.step_ms@500`, `bench.parallel_ticks_per_s@16` and the drill table of the `memoryless` reference, and one row in [sim-notes.md](sim-notes.md). A lever is built only on the user's word, as its own plan, with a season and the keep rule.

| Spike                                           | What changes                                                                             | Nature's side                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `f32` sums, four lanes                          | Every weighted sum rounds differently; the model is the same                             | None: a rounding                                             |
| Weights stored as 16-bit                        | Half the memory traffic; weights are quantised                                           | None: a precision                                            |
| Brain every second tick, outputs held           | A blob reacts one tick later; sense and brain cost halve                                 | Reaction time is real: no animal answers in the same instant |
| Sense staggered: half the agents cast each tick | Rays are one tick stale for half the agents                                              | The same                                                     |
| 24 hidden units                                 | A smaller brain: belongs to [brain-capacity-and-memory.md](brain-capacity-and-memory.md) | Handed to that doc with the number                           |

#### Chunks

| Chunk | Tasks    | Holds                                               |
| ----- | -------- | --------------------------------------------------- |
| F     | T12, T13 | The spikes (Rust by Opus), the table and the review |

## Decisions

| Decision                                                                                       | Why                                                                                                                                                                         | Who                              |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Measure across workers before touching a kernel                                                | Seven squeezes of the single-thread kernels were tried and four reverted; the unmeasured loss is the 37% a world gives up beside fifteen others                             | Delegated (planning, 2026-11-15) |
| Nothing more moves to Rust in Phases 1 to 4                                                    | The kernels are 60% of the step and no JS function is above 5%; what is left in JS is rules with RNG draws and events, which [wasm-kernels.md](wasm-kernels.md) keeps in JS | Delegated (planning, 2026-11-15) |
| Lists of live slots are scratch, rebuilt each tick                                             | Tests, staged worlds and tools write `alive` and `foodAlive` directly; a list kept across ticks goes stale ([wasm-kernels.md](wasm-kernels.md) T27)                         | Planner, from wasm-kernels.md    |
| A change is kept only outside its printed margin and bit-identical, else reverted and recorded | The rule of [wasm-kernels.md](wasm-kernels.md) Phases 5 and 6                                                                                                               | Planner, from wasm-kernels.md    |
| Levers that change a rounding or a behaviour are spikes; none merges without the user          | The user ruled the behaviour-changing speed levers out ([wasm-kernels.md](wasm-kernels.md), Decisions); a spike gives the number that decision would rest on                | User, wasm-kernels.md; planner   |
| The app's frame time is not a target                                                           | The step fits a 240 Hz frame more than twice; drawing is [crisp-renderer.md](crisp-renderer.md)'s                                                                           | Delegated (planning, 2026-11-15) |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Phase 1: `scripts/bench.mjs`, `scripts/bench-parallel.mjs` and its worker. Phase 2: `scripts/lib/worker-pool.mjs` (`--pin`), and, if opened, the row index in `js/sim/brain.js` and `wasm/src/brain.rs`. Phase 3: `js/sim/food-live.js`, `js/sim/ray-march.js`, `js/sim/sensors.js`, `js/sim/territory.js`. Phase 4: `js/sim/world-reset.js`, `js/evo/memory-probe-run.js`, `js/evo/trainer.js`, the eval and screen workers                   |
| Unit tests              | `test/bench.test.js` (step and phases share a window; `bench.agent_us` arithmetic); `test/sim/food-live.test.js` (the list equals a naive scan after spawns, meals and rot, in slot order); `test/sim/territory.test.js` (the scratch list against the full scan on random worlds); `test/sim/world-reset.test.js` (a reset world's hash equals a new world's); `test/evo/trainer.test.js` (an extinct episode's result equals the full run's) |
| Headless e2e            | The golden hashes in `test/sim/golden.json`, the wasm differential tests, `node scripts/check-wasm.mjs` and `npm run browser:hash` are unchanged by Phases 1 to 4. An eval report of a floor-off seed that goes extinct is byte-identical with and without the early stop                                                                                                                                                                      |
| Performance budget      | Phase 1 re-records `bench/baseline.json` with the new keys on a quiet machine under the CPU lock. Each later change carries its `bench:parts --compare`, `bench:micro --compare` or `bench:parallel` numbers and margin; `bench-check` holds `bench.step_ms@500` inside 10%                                                                                                                                                                    |
| Evolution metrics       | N/A - no behaviour change in Phases 1 to 4, shown by unchanged hashes; Phase 5 merges nothing                                                                                                                                                                                                                                                                                                                                                  |
| Determinism             | No RNG stream is added or reordered. Scratch lists keep slot order. Pinning and huge pages change timing only                                                                                                                                                                                                                                                                                                                                  |
| Config and persistence  | No `createConfig` key, so no `rulesHash` change and no flag-ledger entry. `bench/baseline.json` gains `bench.agent_us@<n>`. Stage and arena configs set `maxFood` and `maxAgents`, which are existing keys                                                                                                                                                                                                                                     |
| Logging and diagnostics | `bench:parallel` prints the part, the count, ticks a second, efficiency and CPU share. `EpisodeStoppedExtinct` (info: seed, tick) from the trainer, the eval worker and the screen. The worker pool logs the pin map and the huge-page setting once                                                                                                                                                                                            |
| Browser compatibility   | N/A - Node tools and sim-core loops that the goldens pin; `npm run browser:hash` confirms the kernels in Chromium after any Rust change                                                                                                                                                                                                                                                                                                        |
| Docs                    | `AGENTS.md` rows for `bench:parallel --part` and `--pin` and the huge-page note; [wasm-kernels.md](wasm-kernels.md) points here for what follows its Phase 6; one [sim-notes.md](sim-notes.md) entry per run. Once `Implemented` this doc is the record of the readings and of what was kept and reverted                                                                                                                                      |
| Verification            | `scripts/check.sh` green per chunk PR, under the CPU lock on a quiet machine, and the steps under Verification                                                                                                                                                                                                                                                                                                                                 |

## Task breakdown

### Phase 1 - Measure

| #   | Task                                                                                                                                                                                                        | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Time the step and its phases on the same ticks in `scripts/bench.mjs`; print agents alive and `bench.agent_us@<n>`; explain the 0.64 ms in no phase in [sim-notes.md](sim-notes.md); re-record the baseline | [judgement]  | -          |
| T2  | Add `--part` (`world`, `brain`, `sense` or `spin`) to `npm run bench:parallel`, with the efficiency column and a test of the argument parsing                                                               | [judgement]  | -          |
| T3  | Run `E-TP-1`: prediction first; the part table at 1, 8, 16, 24 and 32 workers with huge pages `madvise` and `always` (the user sets it; it needs root)                                                      | [mechanical] | T2         |
| T4  | Run the pinned tables (`taskset`): large-L3 cores, the others, one thread a core; state the worker count and pin map that give the most ticks a second                                                      | [mechanical] | T2         |
| T5  | Write the verdict: which Phase 2 rows open, with the numbers; conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                           | [judgement]  | T1, T3, T4 |

### Phase 2 - Memory and the machine

| #   | Task                                                                                                                                                                                    | Nature      | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T6a | Build each row of the Phase 2 table that T5 opened, one commit each, kept or reverted on `bench:parallel`; the `AGENTS.md` text; conformance review in parallel with `scripts/check.sh` | [judgement] | T5         |

### Phase 3 - Loops over what is alive

| #   | Task                                                                                                                                                                           | Nature      | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------- |
| T6  | Add `js/sim/food-live.js` and move the per-tick food loops onto it, the naive-scan test first; `bench:parts --area field --compare`                                            | [judgement] | T1         |
| T7  | Re-profile (`node --cpu-prof`) after T6; fold the sense glue per caster and add the hunter scratch list to `territoryAllows`, each kept or reverted on `bench:parts --compare` | [judgement] | T6         |
| T8  | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`; `bench-compare` against `origin/main`; the table of what was kept and reverted            | [judgement] | T6, T7     |

### Phase 4 - Small worlds and dead worlds

| #   | Task                                                                                                                                                                          | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T9  | Size the staged arenas' `maxFood` and `maxAgents` to what they hold, and add `resetWorld` with its hash test and its use in `playTrial`; `bench:micro --area drill --compare` | [judgement] | T1         |
| T10 | Stop an extinct, floor-off world early in `runEpisode`, the eval worker and the screen, with the byte-identical report test and `EpisodeStoppedExtinct`                       | [judgement] | -          |
| T11 | Conformance review of Phase 4 by a fresh agent, in parallel with `scripts/check.sh`; drill trials a second and one floor-off eval's wall time before and after                | [judgement] | T9, T10    |

### Phase 5 - Spikes for the user's decision

| #   | Task                                                                                                                                                                    | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T12 | Build the five spikes on throwaway branches and measure each (`bench.step_ms@500`, `bench.parallel_ticks_per_s@16`, the reference's drill table); nothing merges        | [judgement] | T5         |
| T13 | The spike table in [sim-notes.md](sim-notes.md) for the user; conformance review of Phase 5 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line | [judgement] | T12        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run bench` prints agents alive and microseconds per living agent, and the phases sum to the step within 5%; `npm run bench:parallel -- --part brain` and `--part spin` print their efficiency at each count.
3. Phase 2: `npm run bench:parallel` shows more ticks a second at 16 workers than Phase 1's table, outside the margin, or the phase records that nothing opened.
4. Phase 3: `npm run bench:parts -- --area field --compare origin/main` shows the field phase faster outside the margin, and the goldens are unchanged.
5. Phase 4: `npm run bench:micro -- --area drill --compare origin/main` shows more trials a second, and a floor-off eval report is byte-identical.
6. Phase 5: the spike table is in [sim-notes.md](sim-notes.md) and no spike branch is merged.
