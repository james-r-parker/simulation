# WASM kernels

**Status:** In progress - Phase 1 is built and adopted (T1 to T8): every world runs the brain phase in the Rust/WASM kernel from birth and the JS brain kernel is deleted; Phase 2 (sense) is next; Phase 3 (batched drill evaluation) is proposed.
**Validated:** f5c7880 (2026-11-07)
**Priority:** 24 - a speed lever that changes no behaviour (the behaviour-changing levers are ruled out), so it queues behind the world-balance work and ahead of nothing that depends on it
**Depends on:** [headless-sim-core.md](headless-sim-core.md)

The goal ([principles.md](../principles.md)) is a world that is interesting to watch. Step time at 500 agents sits at about 3.9 to 4.1 ms
against a 3.32 ms budget, with the sense phase near 1.15 ms and the brain phase near 1.25 ms. This doc moves the hottest numeric
loops into a small Rust module compiled to WebAssembly. The JS worker keeps the tick loop and every rule; it calls the module once
per phase. No scene, selection rule or genome changes: `worldHash` stays bit-identical. The JS kernel is the reference only while a
port is being proven; once a kernel is adopted in Rust its JS code is deleted, so the two never have to be kept in sync (user,
2026-11-07).

## Context

### What exists today

| Fact                                                                                                                                          | Where                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `forwardAll` runs `poolRays`, `hiddenStep`, `outputStep` and `hebbianStep` per alive slot, slots ascending, in the contract's summation order | `../../js/sim/brain.js`, `../../js/sim/ray-pool.js`, `../../js/sim/hebbian.js`                                                      |
| Hot arrays are plain typed arrays on the `world` object: `weights`, `hidden`, `pooled`, `outputs`, `leakRate`, `fastOut`, `brainScratch`      | `createWorld` in `../../js/sim/spawn.js`, `../../js/sim/world.js`                                                                   |
| Float32 storage rounds with `Math.fround` where the hidden row commits; weights widen to double on read, and every sum is a double            | `hiddenStep` in `../../js/sim/brain.js`                                                                                             |
| Determinism                                                                                                                                   | No RNG stream is drawn in a kernel. Replays from seed and config are bit-identical in Node and in Chromium (`npm run browser:hash`) |
| The sim core is DOM-free and deterministic; `worldHash` and `test/sim/golden.json` pin every bit                                              | `../../js/sim/step.js` (`STEP_PHASES`, `step`), `../../test/sim/golden.json`                                                        |
| Phase timing tools exist                                                                                                                      | `npm run bench:parts -- --area brain`, `../../bench/micro/phase-parts.js`, `npm run bench`                                          |

## Design

### Toolchain

| Item         | Value                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language     | Rust, edition 2024, target `wasm32-unknown-unknown`, `#![no_std]`, `panic = "abort"`; exports are plain `extern "C"` with `#[unsafe(no_mangle)]`         |
| Bindings     | None: no `wasm-bindgen`, no `wasm-pack`. Arguments are `i32` offsets and counts; results are written into linear memory                                  |
| Dependencies | None: the crate has no crates.io dependency, so the build needs no network and the lockfile has one package                                              |
| Crate        | `wasm/` (`Cargo.toml`, `src/lib.rs`, one module per kernel: `brain.rs`, later `sense.rs`, plus `det_math.rs`)                                            |
| Build        | `scripts/build-wasm.sh`: `cargo build --release --target wasm32-unknown-unknown`, then `wasm-opt -O3 --enable-simd`, written to `wasm/blob-kernels.wasm` |
| Features     | WebAssembly MVP plus standard fixed-width SIMD (`+simd128`). Relaxed SIMD and fused multiply-add are not used                                            |
| Float rules  | No fast-math. Rust never contracts `a * b + c` into a fused operation, so each operation rounds as the JS double operation does                          |

### Delivery of the binary

The built `wasm/blob-kernels.wasm` is a **committed artifact** (about 24 kB), beside `wasm/blob-kernels.wasm.sha256`, the hash of
the sources it was built from, and **`js/sim/wasm-binary.js`, the same bytes as one base64 string** (`KERNEL_BASE64`).
`js/sim/wasm-loader.js` (`embeddedKernels`) decodes and compiles the embedded copy once per thread, synchronously, so Node, the
worker pool, the eval workers, Vitest, CI and the browser's sim worker run identical bytes, none of them needs Rust, and no
entry point has to fetch or await anything before its first world.

- `scripts/build-wasm.sh` writes the binary, its hash, the source hashes and the embedded copy (through
  `node scripts/check-wasm.mjs --write-sources`).
- `scripts/check-wasm.mjs`, run by the `conventions` gate, fails when the binary's hash differs from the `.sha256` file, when a
  source changed since the build, or when `wasm-binary.js` does not decode to the binary; a machine with `cargo` and `wasm-opt`
  120 additionally rebuilds and compares, and prints a skip note otherwise.
- `test/sim/wasm-binary.test.js` decodes the embedded copy against the binary, and the differential test runs it, so a stale or
  hand-edited copy fails a test as well as the check.
- `npm ci` and `npm run build` do not build the binary; an agent runs `scripts/build-wasm.sh` when `wasm/src` changes.

### Benchmarking the kernels

Each kernel export has a microbenchmark in `bench/micro/wasm-*.bench.js` (area `wasm`), timed raw, without the JS wrapper, so a
change in the Rust shows undiluted: `wasm-brain` calls `brain_forward` on a 500-agent micro world (real inputs, Hebbian on, all
inputs 0), `wasm-math` the batch `tanh_into` and the scalar det-math exports on 1024 seeded values; each sense kernel adds its own
file when it lands. `bench/micro/wasm-fixture.js` attaches a copy of the micro world to its own arena and reads the kernel binary
of the tree it runs in.

The loop for a micro change:

1. Edit `wasm/src`.
2. `scripts/build-wasm.sh` rebuilds `wasm/blob-kernels.wasm` (uncommitted).
3. `flock /tmp/claude-1000/cpu.lock npm run bench:micro -- --area wasm --compare HEAD`. The ref tree is a checkout of `HEAD`, so it
   runs the committed binary, and this tree runs the rebuilt one; the runs alternate and the table prints each export's change
   against its margin (`same`, `faster`, `slower`). `--runs 5` on a quiet machine; with `--runs 1` the margin has no run-to-run
   spread and the scalar exports show false verdicts of a few percent.
4. A change that is `same` everywhere is not a gain; revert it. A gain is committed with the rebuilt binary and the table.

For the whole phase rather than the export, `npm run bench:parts -- --area brain --compare <ref>` times `forwardAll` with the
wrapper; every world runs the kernel, so a ref from before T7 prices the kernel against the JS brain. `npm run bench:micro --
--area drill --compare <ref>` prices training throughput: one trial of each drill with a random brain, so trials per second
per worker is ops/s times the drill count, world birth (the arena) included.

### Memory

`js/sim/wasm-arena.js` (`createArena`) instantiates the module with a fixed memory sized from the world's own `maxAgents`, brain
layout (`brainLayout`) and `rayCount`, and allocates each hot array once at a 16-byte aligned offset from the kernel's
`__heap_base` (probed once per thread by the loader). As built (`arenaSpecs`), the world arrays are `alive`, `weights`, `hidden`
(with its scratch row), `inputs`, `pooled`, `outputs`, `leakRate`, `fastOut`, `rayHue`, `rayCos` and `raySin`; the kernel's own
are `rewardScale`, a `scratch` row of doubles, the term list, the gene-output map and the parameter block. `brainScratch` stays
a JS array. The arena returns one typed-array view per array over `memory.buffer`.

- **Attached at birth.** `allocateWorld` calls `attachWasm(world)` before its final spread (so the world keeps V8 fast
  properties), which builds the arena, copies each array into it and re-points the `world` field and its `agentRows` entry at
  the view (so `freeAgent` clears the arena bytes). No world is ever hashed, copied or stepped before it has its arena.
- **No growth.** The arena requests the whole size at instantiation and never calls `memory.grow`, because growth detaches every
  view. A size beyond `MAX_PAGES` (1 GiB) throws at world birth.
- **Cheap for small worlds.** The module is compiled once per thread, so a world costs one `WebAssembly.Memory` and one
  `Instance` sized for itself. Measured on a drill-size world (8 slots, 4 pages): `createArena` 28 us, the whole attach about
  35 us, against about 490 us for the rest of `allocateWorld` and about 23 ms for a drill trial, so no arena pool is kept (a
  pool would need an explicit release, since a shallow copy of a world shares its views).
- **One call per phase.** `forwardAll` calls `brain_forward(params, doubles)` once; the kernel loops over the alive slots
  itself and runs the pooling, the hidden step, the outputs and Hebbian learning for each. Nothing crosses the boundary per
  agent. With `rewardedHebb` the JS takes each alive slot's `rewardScale` first, in slot order, because nothing else in the
  phase reads the trace. `poolRays(world, slot)` calls the `pool_slot` export for the tools that read pooling without the
  brain (`js/evo/pool-discrimination.js`), so pooling has one implementation.
- **Copies.** A copy of a world that wants its own arena (its `wasm` deleted, its own `agentRows` entries, as the benches make)
  calls `attachWasm(copy, undefined, { midRun: true })`. `attachWasm` throws for a world that already runs the kernels, for one
  `hashWorld` has already cached views of, and for one past tick 0 without `midRun`.
- **A kernel throw is fatal to the world.** When a non-finite value stops `brain_forward`, the slots before it are done and the
  faulting slot may be half written. Nothing may step, hash or save the world after the throw; reproduce from seed and config
  instead.

### Adoption (as built)

During the spike the kernel ran behind an `attachWasm` option, `wasmKernels`, with the JS kernel as the live reference and a
`WasmFallback` path. T7 made the kernel the only brain path: it recorded the JS kernel's outputs into
`test/sim/fixtures/wasm-brain-reference.json` (`test/sim/helpers/brain-reference.js`: a digest of `pooled`, `hidden`,
`outputs`, `fastOut` and `rewardTrace` after every call of the per-call cases and every tick of the stepped worlds), then
deleted the JS kernel (`addInputs`, `addRecurrent`, `hiddenStep`, `addSkip`, `outputStep`, `hebbianStep` and the `poolRays`
body), the option, the fallback and `WasmFallback`. A missing or broken binary throws (`loadKernels`). JS helpers that other
code still calls stay: `resetFastOut`, `HEBB_DECAY` and `HEBB_CLAMP`, `rewardScale`, and `poolRays` as an entry to the kernel.
`test/sim/golden.json`, pinned by the JS kernel, keeps guarding `worldHash`. The sense port (Phase 2) follows the same path.

### Bit-identity rules

| Rule            | How the kernel keeps it                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation order | Each hidden unit and each output sums its terms in exactly the JS order: bias, nonzero inputs in index order, recurrent rows in index order, then skip rows. Nothing is reassociated              |
| SIMD            | Vertical only: two hidden units (`f64x2`) advance together, each lane keeping its own sequential chain. No horizontal add, no tree reduction, no fused multiply-add                               |
| Widening        | `f32` weights and hidden values widen to `f64` before each multiply, as the JS typed-array read does; sums are `f64`                                                                              |
| Rounding points | `Math.fround` becomes `as f32` at the same stores: the hidden commit, the `outputs` store, the `fastOut` store and the Hebbian update. A value kept in `f64` scratch is not rounded               |
| `det-math`      | `detExp`, `detTanh` and `detTanhInto` port line for line in `wasm/src/det_math.rs`: the same constants as bit patterns (`f64::from_bits`), the same Horner order, `pow2` built from exponent bits |
| Zero skipping   | `x == 0.0` skips a pooled input as JS does, `-0` included                                                                                                                                         |
| Non-finite      | JS `detTanh` throws on a non-finite value; the kernel writes the slot to a status word and `forwardAll` throws the same error, so a failure stays loud                                            |

> Note: WASM arithmetic yields canonical NaNs while JS can observe a NaN payload through a Float32Array. Weights and inputs are
> finite by construction (`detTanh` throws otherwise), so no NaN payload reaches `worldHash`; the status word turns the first
> non-finite value into an error instead of a hash difference.

### Differential test

As built after T7, `test/sim/wasm-brain.test.js` requires:

1. Every per-call digest of the recorded reference: three configs (no learning, Hebbian, rewarded Hebbian) at six hidden sizes
   (1, 3, 7, 8, 17, 32) and four seeds, three calls each, and a fuzz of 40 seeds over random finite weights and pooled inputs
   including zeros, `-0`, values near the tanh saturation and subnormals.
2. The digest after every tick of three seeded worlds stepped 200 ticks (the default config; Hebbian with `rewardedHebb`; an
   odd hidden size without learning).
3. `worldHash` equal to `test/sim/golden.json` for every golden case: `golden.test.js` and `golden.slow.test.js` now run the
   kernel.
4. The `detTanh` error on a non-finite sum or learn gene, with the slot; a loud error for a world without an arena; and
   `poolRays` pooling a slot exactly as the brain phase does.

### Go / no-go bar

**T6 result (2026-11-07): the bar is met.** Both runs on a machine loaded by evals; the speed ratios are paired, so the load
widens the margins but does not favour either side. The full output is in `sim-notes.md` (2026-11-07, WASM brain kernel).

| Measure                                                                                         | JS (`origin/main`) | WASM | Change                           |
| ----------------------------------------------------------------------------------------------- | ------------------ | ---- | -------------------------------- |
| `bench:parts --area brain --compare origin/main`, `forwardAll, 500 agents, defaults` (ops/s)    | 110                | 881  | 8.0 times, margin +-13%          |
| Same, `forwardAll, real inputs` (brain-parts, ops/s)                                            | 102                | 824  | 8.1 times, margin +-17%          |
| Alternating A/B in one process, brain phase median ms per tick at 500 agents (12 rounds of 250) | 3.10               | 1.02 | 3.15 times (paired min 2.66)     |
| Same run, whole step median ms per tick                                                         | 7.56               | 5.46 | 1.38 times (paired min 1.27)     |
| Identity: differential test, the three 5000-tick goldens with the switch on, `golden.json`      | -                  | -    | byte-equal, all match, unchanged |

**T7 result (2026-11-07, adopted):** against `origin/main` running the JS brain, `bench-compare --sizes=500 --runs=5` gives
`bench.step_ms@500` 4.01 to 3.00 ms (-25%, under the 3.32 ms budget) and `bench.phase_ms.brain@500` 1.30 to 0.50 ms (2.6
times); drill throughput rises 17% (49.6 to 58.2 trials per second per worker, margin +-7%). Details in `sim-notes.md`
(2026-11-07, WASM brain kernel adopted).

Phase 1 reports `npm run bench:parts -- --area brain --compare origin/main` under `flock /tmp/claude-1000/cpu.lock`. Phase 2 starts
only when **both** hold:

| Check    | Bar                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Speed    | The brain phase's median ms per tick at 500 agents is at least 2 times lower, outside the printed margin |
| Identity | The differential test passes and `test/sim/golden.json` is unchanged                                     |

When either fails, the numbers go to `sim-notes.md`, the status moves to `Superseded`, and T6 deletes the switch and the crate. When
both hold, T7 adopts the kernel and deletes the JS one.

## Phases

### Phase 1 - Brain spike

**Targets:** bench.phase_ms.brain@500, bench.step_ms@500

Crate, build script, loader, arena, `brain_forward` (input pooling stays in JS unless the measurement shows the call costs more than
it saves), the differential test and the bench.

### Phase 2 - Sense

**Targets:** bench.phase_ms.sense@500, bench.step_ms@500

Starts only when Phase 1 clears the bar. The ray march and ray summary move into the kernel, one call per phase, with the
spatial hash arrays placed in the arena; a JS reference is kept only while the port is proven, then recorded and deleted.

### Phase 3 - Batched drill evaluation (proposed, not built)

**Targets:** bench.drill_trials_per_s

`bench.drill_trials_per_s` is drill trials per second per worker (`npm run bench:micro -- --area drill`, ops/s times the drill
count). Training plays thousands of tiny drill trials (one to a few agents, a few hundred ticks). A profile of one trial puts the step
at about 88% of its time and the brain at only about 13% of the step, so the brain kernel alone gives training about 15%;
the bigger levers are the spatial hash and grid build (25 to 30%), the pheromone update (about 25%) and physics (about 19%).
Batched evaluation would run many trials' brains in one kernel call: a worker stages N trial worlds side by side in one arena
(one parameter block per trial, or one block whose slot range spans every trial's agents), steps their JS rules in turn and
calls `brain_forward` once per tick for all of them. What it would take:

- An arena that holds N worlds' hot arrays at offsets the kernel walks in one pass, so a slot index maps to a (trial, slot)
  pair; the per-world `world.<field>` views become subarrays of the batch arrays.
- Lock-step stepping: every trial advances one tick before the brain call, and a finished trial keeps a dead slot range
  until the batch ends (its `alive` bytes 0), so the call shape never changes mid-batch.
- The same bit-identity rules: each trial's slots in ascending order, the same summation order, so a batched trial's digests
  equal the unbatched ones (a differential test against single-trial runs).
- It pays only once the other phases are in the kernel too (Phase 2 for the spatial hash, and a later phase for the
  pheromone field and physics); with the brain alone the batch saves at most the 13% brain share.

## Decisions

| Decision                                                                                        | Why                                                                                                                                                                                                                                         | Who              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rust compiled to WASM for hot numeric paths                                                     | The user said "I really like this RUST on hot paths idea"; the behaviour-changing speed levers are ruled out, so it is exact                                                                                                                | User, 2026-11-07 |
| Hybrid: JS keeps the tick loop and every rule; WASM takes one call per phase                    | A rewrite moves rules, RNG and logging and loses the reference; pure array loops are the part that gains                                                                                                                                    | Delegated        |
| No `wasm-bindgen`, plain `extern "C"` with offsets                                              | Every argument is an integer offset into one memory; generated glue adds allocation and a build dependency for no gain                                                                                                                      | Delegated        |
| The `.wasm` is a committed artifact with a hash check and a CI differential test                | CI runners and `npm ci` need no Rust; every platform runs identical bytes; a stale binary fails a test                                                                                                                                      | Delegated        |
| Fixed-size memory, hot arrays allocated once, views never rebuilt                               | `memory.grow` detaches every typed-array view; sizing from `maxAgents` at start removes the failure mode                                                                                                                                    | Delegated        |
| Standard SIMD only, vertical lanes, no relaxed SIMD or fused multiply-add                       | Relaxed SIMD and FMA round differently by engine; vertical lanes keep each unit's summation order and so the hash                                                                                                                           | Delegated        |
| A replaced JS kernel is deleted at adoption; no long-lived fallback                             | The user: "once items get replaced by RUST their JS code should be removed so we dont need to keep them in sync"; a recorded fixture and the goldens keep the reference                                                                     | User, 2026-11-07 |
| `wasmKernels` and the JS path exist only while a port is proven                                 | The differential test needs a live reference during the spike; standard SIMD ships in every target browser, so no fallback is needed after                                                                                                  | Delegated        |
| Rust coding is done by Opus                                                                     | The user: "any RUST dev should be done by opus"; bit-identical ports are high risk                                                                                                                                                          | User, 2026-11-07 |
| The brain goes first, sense only after a 2 times and bit-identical bar                          | The brain is pure arithmetic with the fewest inputs, so it prices the approach before the larger sense port                                                                                                                                 | Delegated        |
| Pooling and Hebbian learning run in the brain kernel too (T4)                                   | An early bench put `poolRays` at about 28% of `forwardAll`; left in JS it would cap the gain near 2 times. One call per phase also needs `alive` in the arena                                                                               | Delegated        |
| `WasmStatus` is the thrown error's `slot` and `where` fields, not a log record (spike)          | The step has no log handle and `js/sim/events.js` belongs to another stream during the push; the throw keeps the failure loud with the JS message                                                                                           | Delegated        |
| `BENCH_WASM=1` made the micro bench worlds attach the kernels (T6; gone at T7)                  | `bench:parts --compare` runs this tree's bench files in both trees; a ref without the kernels runs the JS ones, so the compare prices the switch                                                                                            | Delegated        |
| The binary is embedded as base64 in `js/sim/wasm-binary.js`, not fetched as a Vite `?url` asset | `allocateWorld` is the one place every world is born and it is synchronous; a fetched asset would make every entry point await a load before its first world. 24 kB in the worker bundle; a check and a test pin it to the committed binary | Delegated        |
| `allocateWorld` attaches every world                                                            | The single birthplace: no world can be hashed or copied before its arena, and no worker, eval script, replay or test needs a call of its own                                                                                                | Delegated        |
| `poolRays` stays as an entry that calls a new `pool_slot` export                                | `js/evo/pool-discrimination.js` reads pooling without running the brain; an export keeps one pooling implementation instead of a JS copy to keep in sync                                                                                    | Delegated        |
| No arena pool for drill worlds                                                                  | Measured: the attach is about 35 us of a 23 ms trial (module compiled once per thread); a pool would need an explicit release, since a shallow copy shares the views                                                                        | Delegated        |
| `rayTables` moved from `world.js` to `ray-pool.js`                                              | `world.js` sat at the 300-line limit and needed the attach call; the ray angle tables are what pooling and the ray march read                                                                                                               | Delegated        |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | `wasm/` crate (`src/lib.rs`, `src/brain.rs`, `src/det_math.rs`); in `js/sim/`: `wasm-binary.js` (generated, `KERNEL_BASE64`), `wasm-loader.js` (`loadKernels`, `embeddedKernels`), `wasm-arena.js` (`createArena`, `attachWasm`), `wasm-brain.js` (`wasmForwardAll`); `forwardAll` in `../../js/sim/brain.js` calls the kernel; `allocateWorld` attaches. `js/sim/` touches no `fs`, DOM or clock                                                                                                      |
| Unit tests              | `test/sim/wasm-loader.test.js` (a missing or broken binary throws, export check, one compile per thread), `test/sim/wasm-binary.test.js` (the embedded copy is the binary), `test/sim/wasm-arena.test.js` (alignment, no overlap, sizes from `brainLayout`, attached at birth, views share bytes with the kernel, no `memory.grow`), `test/sim/wasm-brain.test.js` (the differential test against the recorded reference), `test/sim/wasm-det-math.test.js` (kernel tanh equals `detTanh` bit for bit) |
| Headless e2e            | The golden runs (`golden.test.js`, `golden.slow.test.js`) run the kernel and match `test/sim/golden.json`; `eval-smoke` unchanged                                                                                                                                                                                                                                                                                                                                                                      |
| Performance budget      | `bench.phase_ms.brain@500` at least 2 times lower than `origin/main` outside the margin, `bench.step_ms@500` lower; `bench-check` keeps its 15% threshold; the baseline is re-recorded only when the coordinator says so                                                                                                                                                                                                                                                                               |
| Evolution metrics       | N/A - the kernel changes no behaviour and `worldHash` is bit-identical, so no `eval.*` metric can move; the differential test is the evidence                                                                                                                                                                                                                                                                                                                                                          |
| Determinism             | No RNG stream is drawn in a kernel. Replays from seed and config are bit-identical in Node and in Chromium (`npm run browser:hash`)                                                                                                                                                                                                                                                                                                                                                                    |
| Config and persistence  | No config key: the spike's switch was an `attachWasm` option and is deleted, so `scripts/flag-ledger.json` has no row. No saved genome, archive, champion file or IndexedDB change                                                                                                                                                                                                                                                                                                                     |
| Logging and diagnostics | The `detTanh` error thrown with the kernel's `slot` and `where` (1 hidden sum, 2 output sum, 3 learn gene) attached; `WASM kernels: ...` errors at birth for a missing or broken binary. Reproduce with `npm run replay -- --seed <n> --ticks <n>`                                                                                                                                                                                                                                                     |
| Browser compatibility   | Chromium, Firefox and Safari with standard SIMD (Chrome 91, Firefox 89 and Safari 16.4 and later); a browser without it fails loudly at the first world; each worker compiles the module once and gives each world its own arena                                                                                                                                                                                                                                                                       |
| Docs                    | `AGENTS.md` Commands row for `scripts/build-wasm.sh` and the toolchain note (Rust 1.99, `wasm32-unknown-unknown`, `wasm-opt`); `sim-notes.md` entries for the measured gain and any engine surprise; this doc becomes the as-built description                                                                                                                                                                                                                                                         |
| Verification            | `scripts/check.sh` green, the differential test, the bench numbers, and the steps below                                                                                                                                                                                                                                                                                                                                                                                                                |

## Task breakdown

### Phase 1 - Brain spike

| #   | Task                                                                                                                                | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | Add the `wasm/` crate, `scripts/build-wasm.sh`, `scripts/check-wasm.mjs` and the committed binary with its hash (built)             | [judgement] | -          |
| T2  | Port `detExp`, `detTanh` and `detTanhInto` to `wasm/src/det_math.rs` with `wasm-det-math.test.js` (built)                           | [judgement] | T1         |
| T3  | Add `js/sim/wasm-loader.js` and `wasm-arena.js` (`attachWasm`) with their tests (built)                                             | [judgement] | T1         |
| T4  | Port `hiddenStep`, `outputStep` and `addSkip` to `wasm/src/brain.rs` and add `wasm-brain.js` (built)                                | [judgement] | T2, T3     |
| T5  | Dispatch `forwardAll` on the switch and add the differential test `wasm-brain.test.js` and the golden-run check (built)             | [judgement] | T4         |
| T6  | Record `npm run bench:parts -- --area brain --compare origin/main`; on a miss, record in `sim-notes.md` and delete T1 to T5 (built) | [judgement] | T5         |
| T7  | Adopt: record the JS reference fixture, then delete the JS brain kernel, the switch, the fallback and its ledger row (built)        | [judgement] | T6         |
| T8  | Conformance review of Phase 1, in parallel with `scripts/check.sh` (built)                                                          | [judgement] | T7         |

### Phase 2 - Sense

| #   | Task                                                                                                         | Nature      | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------- | ---------- |
| T9  | Place the spatial-hash and ray arrays in the arena and port the ray march, a JS reference kept while proving | [judgement] | T8         |
| T10 | Port the ray summary and pooling, extend the differential test, record the sense bench                       | [judgement] | T9         |
| T11 | Adopt: record the JS sense fixture, then delete the JS ray kernels                                           | [judgement] | T10        |
| T12 | Conformance review of Phase 2, in parallel with `scripts/check.sh`                                           | [judgement] | T11        |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. `scripts/build-wasm.sh` on a machine with Rust reproduces the committed binary's hash.
3. `TEST_SCOPE=fast npx vitest run test/sim/wasm-brain.test.js` passes with the committed binary.
4. `flock /tmp/claude-1000/cpu.lock npm run bench:parts -- --area brain --compare origin/main` prints the brain change outside its margin.
5. `npm run replay -- --seed 1 --ticks 2000` matches `test/sim/golden.json`'s entries through the golden tests.
6. After each adopt task, `rg` finds no JS body for the replaced kernel and no `wasmKernels` key.
7. `npm run browser:hash` matches the goldens in Chromium.
