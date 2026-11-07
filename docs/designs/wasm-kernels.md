# WASM kernels

**Status:** Proposed - Phase 1 is a spike: the brain forward pass in Rust/WASM behind a `wasmKernels` switch, bit-identical to the JS kernel; Phase 2 (sense) starts only when the spike clears its bar.
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

| Fact                                                                                                                                          | Where                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `forwardAll` runs `poolRays`, `hiddenStep`, `outputStep` and `hebbianStep` per alive slot, slots ascending, in the contract's summation order | `../../js/sim/brain.js`, `../../js/sim/ray-pool.js`, `../../js/sim/hebbian.js`             |
| Hot arrays are plain typed arrays on the `world` object: `weights`, `hidden`, `pooled`, `outputs`, `leakRate`, `fastOut`, `brainScratch`      | `createWorld` in `../../js/sim/spawn.js`, `../../js/sim/world.js`                          |
| Float32 storage rounds with `Math.fround` where the hidden row commits; weights widen to double on read, and every sum is a double            | `hiddenStep` in `../../js/sim/brain.js`                                                    |
| Determinism uses only `+ - * /`, `floor` and `sign` through the `det*` functions; `detTanhInto` is the batch form                             | `../../js/sim/det-math.js`                                                                 |
| The sim core is DOM-free and deterministic; `worldHash` and `test/sim/golden.json` pin every bit                                              | `../../js/sim/step.js` (`STEP_PHASES`, `step`), `../../test/sim/golden.json`               |
| Phase timing tools exist                                                                                                                      | `npm run bench:parts -- --area brain`, `../../bench/micro/phase-parts.js`, `npm run bench` |

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

The built `wasm/blob-kernels.wasm` is a **committed artifact** (a few tens of kilobytes), beside `wasm/blob-kernels.wasm.sha256`
and the source it was built from. `js/sim/wasm-loader.js` takes the bytes as an argument; Node reads the file with `fs`, Vite
imports it as a `?url` asset, so the browser, the worker pool, the eval workers and CI run the same bytes and none of them needs Rust.

- `scripts/check-wasm.mjs`, run by the `conventions` gate, fails when the committed binary's hash differs from the `.sha256` file; a
  machine with `cargo` additionally rebuilds and compares, and prints a skip note when `cargo` is absent.
- CI runs the differential test against the committed binary, so a stale or hand-edited binary fails a test as well as the hash check.
- `npm ci` and `npm run build` do not build the binary; an agent runs `scripts/build-wasm.sh` when `wasm/src` changes.

### Memory

`js/sim/wasm-arena.js` (`createArena`) instantiates the module with a fixed memory sized from `maxAgents`, the brain layout
(`brainLayout`) and `rayCount`, and allocates each hot array once at a 16-byte aligned offset: `weights`, `hidden` (with its scratch
row), `pooled`, `outputs`, `leakRate`, `fastOut`, `brainScratch`. The arena returns one typed-array view per array over `memory.buffer`.

- **No growth.** The arena requests the whole size at instantiation and never calls `memory.grow`, because growth detaches every
  view. A size beyond the limit throws at startup and the loader falls back to the JS kernel.
- **Views, not copies.** `world.weights` and the other fields are the views, so JS rules read and write the bytes the kernel uses.
  `attachWasm(world, arena)` copies each array into the arena once and re-points the `world` field at the view; `createWorld` is not
  touched for the spike.
- **One call per phase.** `forwardAll` with the switch on calls `brain_forward(count)` once; the kernel loops over the alive slots
  itself. Nothing crosses the boundary per agent.
- A cloned or restored world calls `attachWasm` again.

### The switch

`wasmKernels` is a boolean config rule, default `false` until Phase 1's bar is met. With it `false`, `forwardAll` runs the existing JS
kernel unchanged. With it `true` and a loaded module, the phase calls the WASM kernel. With it `true` and the module missing or
instantiation failing, the phase runs the JS kernel and logs `WasmFallback` once. The JS kernel stays as the reference for the
differential test for as long as the switch exists.

The switch is temporary. When a phase clears the bar, its adopt task (T7 for the brain, T11 for sense) makes the WASM kernel the only
kernel: it deletes the JS kernel's code for that phase, the switch, the fallback path and `WasmFallback`, and from then on a missing
binary or a failed instantiation throws at world creation (fail loudly). Before deleting the JS kernel, the adopt task records its
outputs for the differential test's worlds into a fixture (`test/sim/fixtures/wasm-<phase>-reference.json`: per-tick hashes of
`outputs`, `hidden` and `fastOut`), so the kernel stays checked against the JS behaviour it replaced, and `test/sim/golden.json`
(pinned by the JS kernel) keeps guarding `worldHash`. JS helpers that other rules still call stay; only the replaced kernel goes.

During the spike the switch is an option passed to `attachWasm` (`{ wasmKernels }`), so tests and the bench enable it without a
config key. Adding the key to `createConfig` and its ledger row is a task for whoever owns the config files at that point.

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

`test/sim/wasm-brain.test.js` builds the same seeded worlds twice, one stepped with the JS kernel and one with `wasmKernels`, for the
default config, a Hebbian config (`hebbianRate > 0`) and an odd `hidden` size, and requires:

1. `outputs`, `hidden` and `fastOut` byte-equal after every tick for 200 ticks (`Buffer.compare` of the views).
2. `worldHash` equal at the end of each run, and equal to the `test/sim/golden.json` entry for the golden config.
3. A fuzz over random finite weights and pooled inputs, including zeros, `-0`, values near the tanh saturation and subnormals,
   against the JS `forwardAll`.
4. The fallback (spike only): a missing binary logs `WasmFallback` and the world still matches the JS hash.

After the adopt task, items 1 and 3 compare against the recorded fixture instead of the deleted JS kernel, item 4 becomes "a missing
binary throws", and item 2 is unchanged.

### Go / no-go bar

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

Starts only when Phase 1 clears the bar. The ray march and ray summary move behind the same switch, one call per phase, with the
spatial hash arrays placed in the arena.

## Decisions

| Decision                                                                         | Why                                                                                                                                                                     | Who              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rust compiled to WASM for hot numeric paths                                      | The user said "I really like this RUST on hot paths idea"; the behaviour-changing speed levers are ruled out, so it is exact                                            | User, 2026-11-07 |
| Hybrid: JS keeps the tick loop and every rule; WASM takes one call per phase     | A rewrite moves rules, RNG and logging and loses the reference; pure array loops are the part that gains                                                                | Delegated        |
| No `wasm-bindgen`, plain `extern "C"` with offsets                               | Every argument is an integer offset into one memory; generated glue adds allocation and a build dependency for no gain                                                  | Delegated        |
| The `.wasm` is a committed artifact with a hash check and a CI differential test | CI runners and `npm ci` need no Rust; every platform runs identical bytes; a stale binary fails a test                                                                  | Delegated        |
| Fixed-size memory, hot arrays allocated once, views never rebuilt                | `memory.grow` detaches every typed-array view; sizing from `maxAgents` at start removes the failure mode                                                                | Delegated        |
| Standard SIMD only, vertical lanes, no relaxed SIMD or fused multiply-add        | Relaxed SIMD and FMA round differently by engine; vertical lanes keep each unit's summation order and so the hash                                                       | Delegated        |
| A replaced JS kernel is deleted at adoption; no long-lived fallback              | The user: "once items get replaced by RUST their JS code should be removed so we dont need to keep them in sync"; a recorded fixture and the goldens keep the reference | User, 2026-11-07 |
| `wasmKernels` and the JS path exist only while a port is proven                  | The differential test needs a live reference during the spike; standard SIMD ships in every target browser, so no fallback is needed after                              | Delegated        |
| Rust coding is done by Opus                                                      | The user: "any RUST dev should be done by opus"; bit-identical ports are high risk                                                                                      | User, 2026-11-07 |
| The brain goes first, sense only after a 2 times and bit-identical bar           | The brain is pure arithmetic with the fewest inputs, so it prices the approach before the larger sense port                                                             | Delegated        |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `wasm/` crate (`src/lib.rs`, `src/brain.rs`, `src/det_math.rs`); in `js/sim/`: `wasm-loader.js` (`loadKernels`), `wasm-arena.js` (`createArena`, `attachWasm`), `wasm-brain.js` (`wasmForwardAll`); `forwardAll` in `../../js/sim/brain.js` dispatches on the switch. The loader takes bytes as an argument, so `js/sim/` touches no `fs`, DOM or clock                                         |
| Unit tests              | `test/sim/wasm-loader.test.js` (bad bytes and missing binary fall back, export check), `test/sim/wasm-arena.test.js` (alignment, no overlap, sizes from `brainLayout`, views share bytes with the kernel, no `memory.grow`), `test/sim/wasm-brain.test.js` (the differential test), `test/sim/wasm-det-math.test.js` (kernel tanh equals `detTanh` bit for bit over a fuzz and the edge values) |
| Headless e2e            | Seed 1, default config, 2000 ticks, switch on and off: equal `worldHash`, equal to the `test/sim/golden.json` entry; `eval-smoke` unchanged                                                                                                                                                                                                                                                     |
| Performance budget      | `bench.phase_ms.brain@500` at least 2 times lower than `origin/main` outside the margin, `bench.step_ms@500` lower; `bench-check` keeps its 15% threshold; the baseline is re-recorded only when the coordinator says so                                                                                                                                                                        |
| Evolution metrics       | N/A - the switch changes no behaviour and `worldHash` is bit-identical, so no `eval.*` metric can move; the differential test is the evidence                                                                                                                                                                                                                                                   |
| Determinism             | No RNG stream is drawn in a kernel. Replays from seed and config are bit-identical with the switch on or off, in Node and in Chromium (`npm run browser:hash`)                                                                                                                                                                                                                                  |
| Config and persistence  | `wasmKernels` boolean, default `false` until the bar is met; a `scripts/flag-ledger.json` row (`key: wasmKernels`, `plan: wasm-kernels`, `task: T7`, the adopt task that deletes it, or T6 on a miss). No saved genome, archive, champion file or IndexedDB change                                                                                                                              |
| Logging and diagnostics | `WasmFallback` (warn: reason `missing`, `instantiate` or `memory`, once per run) and `WasmStatus` (error: status word, tick, slot, then the throw). Reproduce with `npm run replay -- --seed <n> --ticks <n>` with and without the switch and compare `worldHash`                                                                                                                               |
| Browser compatibility   | Chromium, Firefox and Safari with standard SIMD; during the spike a browser without SIMD takes the JS fallback; after adoption it fails loudly (standard SIMD is in Chrome 91, Firefox 89 and Safari 16.4 and later); each worker instantiates its own module and arena                                                                                                                         |
| Docs                    | `AGENTS.md` Commands row for `scripts/build-wasm.sh` and the toolchain note (Rust 1.99, `wasm32-unknown-unknown`, `wasm-opt`); `sim-notes.md` entries for the measured gain and any engine surprise; this doc becomes the as-built description                                                                                                                                                  |
| Verification            | `scripts/check.sh` green, the differential test, the bench numbers, and the steps below                                                                                                                                                                                                                                                                                                         |

## Task breakdown

### Phase 1 - Brain spike

| #   | Task                                                                                                                        | Nature      | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | Add the `wasm/` crate, `scripts/build-wasm.sh`, `scripts/check-wasm.mjs` and the committed binary with its hash             | [judgement] | -          |
| T2  | Port `detExp`, `detTanh` and `detTanhInto` to `wasm/src/det_math.rs` with `wasm-det-math.test.js`                           | [judgement] | T1         |
| T3  | Add `js/sim/wasm-loader.js` and `wasm-arena.js` (`attachWasm`) with their tests                                             | [judgement] | T1         |
| T4  | Port `hiddenStep`, `outputStep` and `addSkip` to `wasm/src/brain.rs` and add `wasm-brain.js`                                | [judgement] | T2, T3     |
| T5  | Dispatch `forwardAll` on the switch and add the differential test `wasm-brain.test.js` and the golden-run check             | [judgement] | T4         |
| T6  | Record `npm run bench:parts -- --area brain --compare origin/main`; on a miss, record in `sim-notes.md` and delete T1 to T5 | [judgement] | T5         |
| T7  | Adopt: record the JS reference fixture, then delete the JS brain kernel, the switch, the fallback and its ledger row        | [judgement] | T6         |
| T8  | Conformance review of Phase 1, in parallel with `scripts/check.sh`                                                          | [judgement] | T7         |

### Phase 2 - Sense

| #   | Task                                                                                        | Nature      | Depends on |
| --- | ------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T9  | Place the spatial-hash and ray arrays in the arena and port the ray march behind the switch | [judgement] | T8         |
| T10 | Port the ray summary and pooling, extend the differential test, record the sense bench      | [judgement] | T9         |
| T11 | Adopt: record the JS sense fixture, then delete the JS ray kernels and the switch           | [judgement] | T10        |
| T12 | Conformance review of Phase 2, in parallel with `scripts/check.sh`                          | [judgement] | T11        |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. `scripts/build-wasm.sh` on a machine with Rust reproduces the committed binary's hash.
3. `TEST_SCOPE=fast npx vitest run test/sim/wasm-brain.test.js` passes with the committed binary.
4. `flock /tmp/claude-1000/cpu.lock npm run bench:parts -- --area brain --compare origin/main` prints the brain change outside its margin.
5. Before adoption, `npm run replay -- --seed 1 --ticks 2000` with the switch on and off prints the same `worldHash`; after it, the
   replay matches `test/sim/golden.json`.
6. After each adopt task, `rg` finds no JS body for the replaced kernel and no `wasmKernels` key.
7. `npm run browser:hash` matches the goldens in Chromium with the switch on.
