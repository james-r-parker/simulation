### 2026-11-07 - WASM Phase 5: drills 36% faster, the bench step unchanged, four squeezes reverted (wasm-kernels T20 to T28)

- **Profile after the kernels.** `node --cpu-prof` names WASM frames `wasm-function[N]`; an exported function's `name`
  property is its index, so `new WebAssembly.Instance(module, imports).exports` maps the index to the export. In the
  500-agent bench world the kernels are about 65% of the step (`brain_forward` 38%, `sense_slot` 14%, `build_hash` 7%); no
  JS function is above 4%.
- **Drills waste time on empty slots.** The drill stage world (3000 x 4000, 8 agents) keeps the default `maxFood` 3600, so
  `build_hash` walked 3600 dead food bytes twice a tick (32% of a trial) and the pheromone update ran over grids of exact
  zeros (15%). Skipping sixteen dead bytes per `v128_any_true` and skipping rows of `+0` bits took drill throughput from
  70.3 to 95.8 trials per second per worker (+36.4%, margin +-8.0%). `aliveFoods` in `js/evo/drill-scenarios.js` (3.7%)
  and the stage's `maxFood` are the next drill levers, outside the kernels.
- **Bench-world grids are never zero.** At every 500 ticks from 500 to 4500, none of the 81 rows of any pheromone grid
  is all zero: decaying `f32` tails spread by diffusion to every cell, so zero skipping helps only small or new worlds.
- **The brain does not respond to tanh or pass width.** Six divisions instead of 13 in the vector tanh made `tanh_into`
  12% faster with no change in `forwardAll`, and 16 units per pass did nothing: the weighted sums of widened `f32` weights
  are the cost, and out-of-order execution hides the divisions. `wasm-opt -O4` was mixed (one export +13%, another -2%).
- **Bit-identity of a power-of-two divisor.** `r / 2^j` and `r * 2^-j` round the same real number, so they are equal for
  every `r`; `(r / 3) * 0.5` equals `r / 6` only while both are normal (the power-of-two scaling commutes with rounding in
  the normal range), so such a rewrite needs a guard for tiny `r`.
- **Noise.** No quiet window held during the phase (load 2 to 9, other streams running); `bench:micro` margins ran from
  2% to 28%, so `--runs 5` and only verdicts outside the margin were used.
