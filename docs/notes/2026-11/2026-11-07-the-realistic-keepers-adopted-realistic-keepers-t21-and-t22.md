### 2026-11-07 - the realistic keepers adopted (realistic-keepers T21 and T22)

The combined world (`satedBite`, `predatorRestTicks` 60, `juvenileDependency`, `rewardedHebb`, `coverConceals`, `coverFoodFree`,
`refugeSense`) passed the keep rule on 32 seeds (hunters alive 13/16 and 14/16, no more seeds under 80 than the defaults, predators at
end +49%). Its only worse guard, `eval.hunter_kill_conversion_by_age.1k-2k` (-25%), is the by-construction fall of `satedBite` (E136):
the hungry-chase conversion is not worse (-9%, interval spans 0). All seven are the default now; the six plain switches are deleted
(`predatorRestTicks` is a plain key at 60, `rewardedHebb` a default-true key until wasm-kernels.md deletes it with the Rust and JS off
paths). Facts to know:

- Ray casting takes the covered path (`nearestHitCovered`, one ray at a time) whenever the world has refuge rings, which the default
  world does (8). The circle-major `nearestHitsAll` pass of the speed work runs only in worlds without rings (`refugeCount` 0, as in
  most tests and the busy and disease golden cases). A sense-phase cost, to be measured at the baseline re-record.
- `stepCover` and `rejectedByCover` now run in every default world: one ring byte per agent per tick, one ring test per plant placement.
- Tests that are not about a juvenile hunter set `juvenileBurn` 1 (`test/sim/helpers/predator-arena.js`), and tests of the plain
  Hebbian rule set `rewardedHebb` false.
- Historic grids and configs (`evals/screens/hunter-*.grid.json`, `refuge*.grid.json`, `evals/sated-floor-off-config.json`) still name
  the deleted keys; they record what was run and will not validate if rerun. Old reports carry `provisionEnabled`, so `eval:compare`
  against them needs `--allow-config-diff` for the keys that differ.
- Goldens re-pinned (default, busy, disease, full and short), the busy effect-stream pin in `test/worker/sim-host.slow.test.js`
  moved with them, and `npm run browser:hash` matches in Chromium.
