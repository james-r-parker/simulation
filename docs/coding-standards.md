# Coding standards

The rules for new code in `js/sim/`, `js/evo/`, `scripts/` and `test/`. The size limits and the hard rules are in
[AGENTS.md](../AGENTS.md); this file is the detail behind them. Read it before writing code.

The v5 app grew 2,000-line files (`agent.js`, `game.js`, `ui.js`) that mix simulation, rendering, persistence
and UI, and cannot be tested. New code is the opposite: small modules that each do one job and are tested on their
own.

## Module design

- **One responsibility per module.** A module's name says what it does (`spatial-hash.js`, `mutation.js`), and its
  header comment says it in one line. If the description needs "and", it is two modules.
- **Pure core, thin shell.** Simulation and evolution logic are pure functions over plain data and typed arrays.
  Side effects - DOM, rendering, IndexedDB, workers, files, timers, logging sinks - live in thin adapters at the edge
  that are swapped for fakes in tests.
- **Dependencies are passed in, not reached for.** Functions take what they need (config, RNG, world state) as
  arguments. No module-level mutable state, no singletons, no globals like `window.currentSimulation`.
- **No import-time side effects.** Importing a module never touches the DOM, starts a timer or allocates large
  buffers; construction happens in an explicit `create...` or `init` call.
- **One-way dependencies.** `js/sim` depends on nothing in the app; `js/evo` depends on `js/sim`; the worker,
  renderer and UI depend on both, never the reverse. No circular imports.
- **Small public surface.** Export only what other modules use; everything exported has a JSDoc comment with types
  (`lint` enforces it in `js/sim`, `js/evo` and `scripts`).
- **Config, not constants in code.** Tunables come from `createConfig` with named defaults; no magic numbers in
  logic. A number that needs a comment to explain it is a config key or a named constant.

## Correctness

- **Fail loudly.** Invalid input throws an `Error` with a message that names the value and what was expected. Never
  fall back silently - the v5 code randomised mismatched brain weights and kept their old fitness, which
  corrupted evolution for months.
- **Validate at the boundary.** Data from IndexedDB, files, workers or the user is checked once where it enters;
  internal code trusts its typed inputs.
- **Determinism.** Same seed and config, same result: no `Math.random`, wall-clock time, or iteration over objects
  or `Map`s keyed by identity in anything that affects the simulation.
- **No dead code.** No commented-out code, unused exports, or `TODO`/`FIXME` comments (`lint` rejects them). Work
  that remains belongs in a design doc task.

## Performance (hot paths)

- Per-tick code allocates nothing: preallocated typed arrays (struct-of-arrays), no closures, object literals,
  `map`/`filter` chains or string building inside the tick.
- Every hot-path change ships with a benchmark, and claims of speed carry `bench` numbers against the baseline.
- Optimise only what a benchmark or profile shows is slow; keep everything else simple.
- **Hot kernels keep state in locals.** Inside an inner loop (a ray walk, a matrix pass) the running state lives in
  local variables. Scratch typed arrays carry state only across function boundaries, and a helper returns a number
  rather than writing its result into a shared scratch array.
- **A shared row is a contract.** An array that other modules read after a step (`world.inputs`) has its layout,
  validity window and zeroing rule written in
  [headless-sim-core-contracts.md](designs/headless-sim-core-contracts.md) before a second reader depends on it.

## Tests

- **Scope.** Lint and typecheck cover the new code only (`js/sim/`, `js/evo/`, `scripts/`, `test/`); `js/worker/` and `js/app/` are covered
  too. Simulation tests run headless on a seeded world, never with `Math.random`, wall-clock
  time, a real GPU or a browser.
- **Test behaviour, not implementation.** Assert on outputs and observable state through the public API.
- **Fast and isolated.** Unit tests need no browser, GPU, network or timers, and finish in milliseconds; each test
  builds its own small world.
- **Reference tests for clever code.** Optimised code (spatial hash, batched matmul, ray march) is checked against a
  naive reference implementation on random seeded inputs.
- **Arrange, act, assert**, one behaviour per test, named for the behaviour (`it('rejects a genome with the wrong
architecture')`).

## Changes and reviews

- **Small PRs, one concern each.** One phase per PR, one task per commit, and every commit passes the gate.
- **Refactor separately.** A refactor with no behaviour change is its own commit; it never rides along with a
  feature or a fix.
- **Boy-scout rule, within reason.** Leave touched code a little better, but put unrelated cleanups in their own PR.
- **Review checklist.** Before `create-pr`: the gate is green; each new module has a one-line purpose and a test
  file; no limit was dodged; errors are loud; hot paths allocate nothing; docs and Status lines moved with the code.

## Decisions

| Decision                                                         | Reason                                                                                                            | By                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| Hot-kernel state lives in locals; helpers return numbers         | A shared scratch array as a register file stops the engine keeping state in registers; sense costs 270 ns per ray | Specialist review |
| Shared rows that other modules read have a written read contract | `world.inputs` is read by four groups with no document saying what it holds                                       | Specialist review |
