### 2026-11-15 - The no_std wasm32 kernels run their Rust tests in Node (honest-budgets)

The kernels crate builds only for `wasm32-unknown-unknown`, so `cargo test` cannot run its tests, but
`cargo test --no-run` builds them: with `#![cfg_attr(not(test), no_std)]` and the panic handler under
`#[cfg(not(test))]`, the test build links `std` and libtest into a .wasm that imports `env.memory` (the crate's
`--import-memory`) and exports `main`. Instantiated in Node with `new WebAssembly.Memory({ initial: 64 })`,
`exports.main(0, 0)` returns 0 when every test passes; a failing assertion panics, which traps as `unreachable` with
no test name and no output, since the target has no stdout. `scripts/test-wasm.sh` does this. It needs cargo, which CI
does not have, so no gate runs it; run it after any change under `wasm/src`.

Entries are `### YYYY-MM-DD - <topic>`, newest last, one finding each.
