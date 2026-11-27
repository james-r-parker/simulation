# E280 - the defender's escort distance in the live world (role-budget T25)

32 seeds x 200000 ticks, `map-elites-v6`, the season 12 defaults (`rulesHash` `4110c4d043dd1658`, config hash
`654629137bcf44bc`), floor on, batch code at 60961886: `defaults-floor-on.json` beside this file.

`eval.defender_escort_distance` is the median, over a world's bite episodes that opened on a forager, reproducer or scout
after burn-in, of the centre distance to the nearest alive defender (`js/evo/scene-escort.js`).
`eval.defender_escort_ratio` divides each distance by the calculator's gap for the two live bodies (caller size plus
defender size times `1 + ESCORT_CLEARANCE`). A ratio of 1 is where `escortGap` (87 px at the defaults) stands the defender.

## The prediction

Written after a first run whose histogram capped at 1000 px (10 of 32 seed medians at the cap, fixed in 60961886): the
median ratio is above 3, so the live defender does not stand where the calculator reads the row.

Held. Both metrics are live on every seed.

| Metric                          | min   | p10   | p25   | median | p75    | p90    | max    |
| ------------------------------- | ----- | ----- | ----- | ------ | ------ | ------ | ------ |
| `eval.defender_escort_distance` | 198.5 | 277.5 | 404.5 | 700.5  | 1073.5 | 2283.5 | 2558.5 |
| `eval.defender_escort_ratio`    | 2.11  | 3.09  | 4.55  | 7.97   | 11.97  | 25.31  | 28.85  |

No seed's median is within twice `escortGap` (174 px).

## Outcome to task

0. **Detector.** `test/evo/scene-escort.test.js` pins the opening rule, the nearest-defender choice and the median
   against a naive sort; the reading is uncapped up to the world's diagonal.
1. **Observation.** The live defender stands a median 700 px (ratio 8) from the caller a hunter bites, against the 87 px
   the `defender:predator` row reads. The baseline beside it is the calculator's own gap.
2. **Theory.** A guard stays near the herd when guarding pays it through kin (musk-ox rings, meerkat sentinels guard
   relatives); the defender's brain at the defaults is not yet selected to track callers, so it stands where it forages.
   A fixture falsifies it if a defender lineage with kin callers nearby reads a ratio near 1 without training.
3. **Principle check.** The reading is a detector, never fitness; nothing pays a defender for standing close, and no
   input or scripted escort is added.
4. **Task.** None in role-budget.md, whose row is read at the distance a good guard keeps ("The defender row is read at
   an escort distance"). The gap between the row and the live world is behaviour for evolution and the training gates
   of fair-chase.md "Before any training" to close, and `eval.defender_escort_ratio` is the reading that shows it.
