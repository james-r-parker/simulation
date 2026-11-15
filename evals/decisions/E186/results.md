# E186 - hunter's eyes (senses-and-motor Phase 5, T17 to T19; plan id `E-SM-4`)

**Prediction (recorded before the run).** Giving the hunter the longest forward reach (predator `visionRange` 400, equal
only to the scout; defender down to 300) with a short rear reach (`rearVisionShare` 0.3 to 0.6) lets predators start
chases from further ahead. On the 16-seed screen (`evals/screens/hunter-vision.grid.json`, seeds 1 to 16, 400000 ticks,
floor on, policy live) the range-plus-rear arms raise `eval.hunter_catches_per_1k` by at least a tenth over control with
the keep rule's seed guards (hunters alive, held) not worse; range alone moves catches less than range with `s` 0.4;
`eval.chase_catch_share` rises with them; `eval.collision_death_share` does not rise. Falsified when no arm raises
`eval.hunter_catches_per_1k` beyond the screen's margin.

**Arms.** Every arm keeps forager, reproducer and scout as they are (300, 250, 400, `s` 1).

| Arm         | predator   | defender   |
| ----------- | ---------- | ---------- |
| control     | 350, s 1   | 350, s 1   |
| range       | 400, s 1   | 300, s 1   |
| range-s06   | 400, s 0.6 | 300, s 1   |
| range-s04   | 400, s 0.4 | 300, s 1   |
| range-s04-d | 400, s 0.4 | 300, s 0.8 |
| far-s03     | 450, s 0.3 | 300, s 1   |

## Chase envelope on the range arms

`npm run audit:chase -- --pairs predator:forager,predator:defender --config evals/decisions/E186/<arm>.config.json`
(seed 1, 4 trials per cell; `chase-range400.txt`, `chase-far450.txt`). The oracles see everything, so `rearVisionShare`
does not change their result; a longer view only starts the chase further out.

| Config               | predator on forager                   | predator on defender  | Fair band |
| -------------------- | ------------------------------------- | --------------------- | --------- |
| defaults (E185, 350) | 0.31 at 0.2 of view (70 px), 0 beyond | as forager            | 0.2       |
| range (400)          | 0.22 at 0.2 of view (80 px), 0 beyond | 0.13 at 0.2, 0 beyond | 0.2       |
| far (450)            | 0.09 at 0.2 of view (90 px), 0 beyond | 0 everywhere          | none      |

Reading: the oracle chase is decided inside about 80 px whatever the view, so in the oracle arena a longer eye adds no
catch. What the screen tests is the other half: whether real brains, which lose prey between rays and behind them, start
more chases that end in a kill when the hunter sees further ahead.

## Screen (T18)

Not run yet.

## Keep rule (T19)

Not run yet.
