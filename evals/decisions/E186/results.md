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

`npm run screen -- --grid evals/screens/hunter-vision.grid.json --workers 16 --no-lock` (seeds 1 to 16, 400000 ticks,
floor on, policy live; `evals/screens/results/hunter-vision/`). Every arm reads `PASS` and the screen's keep rule reads
no harm for every arm against `control`. Targets from `npm run eval:compare -- control <arm> --allow-config-diff
specialisations`:

| Arm         | catches/1k (control 1.340) | chase catch share (0.228)      | collision death share (0.208) | predator presence (0.643) | pop > min | hunters alive share |
| ----------- | -------------------------- | ------------------------------ | ----------------------------- | ------------------------- | --------- | ------------------- |
| control     | 1.340                      | 0.228                          | 0.208                         | 0.643                     | 15/16     | 0.7                 |
| range       | 1.415 (+5.6%)              | 0.224 (-1.9%)                  | 0.210                         | 0.585                     | 14/16     | 0.6                 |
| range-s06   | 1.414 (+5.5%)              | 0.234 (+2.5%)                  | 0.208                         | 0.644                     | 13/16     | 0.6                 |
| range-s04   | 1.397 (+4.3%)              | 0.231 (+1.2%)                  | 0.194                         | 0.697                     | 14/16     | 0.8                 |
| range-s04-d | 1.449 (+8.1%)              | 0.239 (+4.6%, [-0.002, 0.019]) | 0.196                         | 0.712                     | 16/16     | 0.8                 |
| far-s03     | 1.343 (+0.2%)              | 0.243 (+6.4%, [-0.004, 0.031]) | 0.211                         | 0.690                     | 14/16     | 0.6                 |

Verdict on 16 seeds: **not supported, not falsified.** No arm moves `eval.hunter_catches_per_1k` beyond the screen's
margin, but that metric needs 64 seeds for a verdict (`eval:compare` prints "needs 64 seeds"), and
`eval.collision_death_share` needs 32; `eval.chase_catch_share` has no verdict on any arm (every interval touches 0).
No arm reads harm. Range alone did not move catches less than range with `s` 0.4 (+5.6% against +4.3%), so that clause
is not supported on these seeds.

**Finalist: `range-s04-d`** (predator 400 with `s` 0.4, defender 300 with `s` 0.8). It has the largest point gain on
both targets (catches +8.1%, chase catch share +4.6% with its interval just touching 0), the most hunters alive (0.8
share, predator presence 0.712), held its population on 16 of 16 seeds and lowered collision deaths. `far-s03` has a
higher chase catch share but no catch gain and fewer hunters alive.

## Keep rule (T19)

The finalist against the defaults on 64 fresh floor-on seeds (seed offset 64, so none overlap the screen), 400000
ticks, policy live, then `npm run eval:compare -- control.report.json finalist.report.json --keep-rule
--allow-config-diff specialisations` with the targets. Under the keep rule ("A realistic mechanism stays",
`docs/principles.md`) a forward-weighted predator eye is adopted when it reads no harm, even if its scene does not move.

Running.
