### 2026-11-07 - WASM brain kernel: 3 to 8 times faster and bit-identical (wasm-kernels T6)

The brain phase (`poolRays`, `hiddenStep`, `outputStep`, `hebbianStep`) runs in `wasm/blob-kernels.wasm` behind the
`attachWasm` option `wasmKernels`. Both measurements ran on a machine loaded by evals; the ratios are paired.

- `BENCH_WASM=1 flock /tmp/claude-1000/cpu.lock npm run bench:parts -- --area brain --compare origin/main` (median of 3
  alternating runs): `forwardAll, 500 agents, defaults` 110 to 881 ops/s (+703%, margin +-13%); `forwardAll, real inputs`
  102 to 824 ops/s (+706%, +-17%); hidden sizes 16 to 64 gain 4.6 to 12 times; `poolRays`, `hebbianStep` alone and the
  evolution functions unchanged (they still run in JS when called directly).
- An alternating A/B of two identical 500-agent worlds in one Node process (12 rounds of 250 ticks, world hashes equal at
  the end): brain phase median 3.10 to 1.02 ms per tick (3.15 times, paired min 2.66), whole step 7.56 to 5.46 ms (1.38
  times). The micro bench's JS figure (about 9 ms per call) is slower than the in-step one, so its ratio overstates the
  gain; read 3 times as the step-level figure.
- Identity: outputs, hidden and fastOut byte-equal every tick for 200 ticks (default, rewarded Hebbian, 13 hidden units)
  and 2000 ticks (default); the three 5000-tick golden cases reach their pinned hashes with the switch on;
  `test/sim/golden.json` unchanged.

Toolchain facts found on the way:

- `f64::floor` is not in `core` for a `no_std` crate on Rust 1.99; the kernel uses the SIMD `f64x2_floor` on a splat,
  which is IEEE round-toward-negative and so equals `Math.floor`.
- `wasm-opt` 120 rejects rustc's output unless told the features rustc's generic wasm32 CPU emits
  (`--enable-nontrapping-float-to-int --enable-bulk-memory --enable-sign-ext --enable-mutable-globals --enable-multivalue
--enable-reference-types`, plus `--enable-simd`).
- `cargo build --config "target.<triple>.rustflags=[...]"` appends to the rustflags in `.cargo/config.toml` rather than
  replacing them, so the build script adds `--remap-path-prefix` without losing `--import-memory`; a build from another
  checkout path gives the same bytes.
