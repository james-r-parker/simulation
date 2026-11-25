### 2026-11-07 - herd neighbour loops skip the grid (T73)

`trampleHerds` ran a contact test of every agent against every live herd animal, and `senseGroupHunters` in
`herd-startle.js` ran a spec lookup and a distance test of every agent against each herd every eighth tick. Both now
reject on one axis before the rest: `trampleHerds` skips an animal when `|dx| >= reach`, `threatensGroup` when `dx * dx >
rangeSq`, and the startle loop runs the distance test before `specParams` (both must pass, so the nearest hunter is the
same).

- Why it is bit-identical: float multiplication and addition round monotonically, so `dx * dx >= reach * reach` follows
  from `|dx| >= reach`, and `dx * dx + dy * dy >= dx * dx`. A skipped pair is exactly one the full test returns on, the
  loops keep their order, and no float result changes. A strict `>` is used in the startle loop because that test is
  `<=` (a plain `|dx| > radius` could skip a pair whose rounded squares are equal). Tests compare each loop with an
  all-pairs copy of the old code; `test/sim/golden.json` is unchanged.
- Measured, alternating runs on a loaded machine (`npm run bench:parts -- --area <phase> --compare origin/main`):
  physics `integrate` 2,531 to 3,498 ops/s (+38%, margin 8%); environment `stepHerds` 20,196 to 38,083 ops/s (+89%,
  margin 6%), the environment phase 20,843 to 35,769 (+72%, margin 14%). The whole physics phase moved +0.5% inside a
  10% margin, so the step-level gain is small (about 0.02 to 0.05 ms) and needs a quiet-machine bench to quote.
- `herd-graze.js` already box-rejects food before its distance test; `herd-steering.js` and `herd-motion.js` loop over
  the herd's own animals, rocks and gaps (small, fixed sets), not agents, so they were left alone.
