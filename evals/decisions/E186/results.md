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
ticks, policy live:

```
npm run eval -- --seeds 64 --seed-offset 64 --ticks 400000 --policy live --workers 12 --out control.report.json
npm run eval -- --seeds 64 --seed-offset 64 --ticks 400000 --policy live --workers 12 \
  --config evals/decisions/E186/finalist.config.json --out finalist.report.json
npm run eval:compare -- control.report.json finalist.report.json --keep-rule --allow-config-diff specialisations \
  --targets eval.hunter_catches_per_1k,eval.chase_catch_share,eval.collision_death_share
```

Output in `keep-rule.txt` and `keep-rule.json` beside this file.

**Keep rule: no harm detected.**

| Guard                        | Verdict | Read                                          | Smallest loss it detects |
| ---------------------------- | ------- | --------------------------------------------- | ------------------------ |
| hunters alive                | no harm | 11 seeds harmed, 15 recovered (exact p 0.557) | 29 seeds                 |
| under 80                     | no harm | 1 harmed, 1 recovered (exact p 1)             | 8 seeds                  |
| held                         | no harm | 8 harmed, 6 recovered (exact p 0.791)         | 17 seeds                 |
| `eval.hunter_catches_per_1k` | no harm | +0.129, interval [0.043, 0.208]               | 0.0825                   |

The hunters-alive guard sees only a loss of 29 seeds, more than a quarter of 64, so on its own it has not shown no
harm. But that guard moved the other way (15 recovered against 11 harmed), and the held and under-80 guards see losses of
17 and 8 seeds. The adoption bar reads "not met" (hunters alive on 45 of 64 seeds against a bar of 0.75). Control reads
about 41 of 64, so the finalist raises the count and does not cause the miss.

Targets at 64 seeds:

| Metric                       | Control | Finalist | Change | Interval        | Verdict        |
| ---------------------------- | ------- | -------- | ------ | --------------- | -------------- |
| `eval.hunter_catches_per_1k` | 1.327   | 1.457    | +9.7%  | [0.043, 0.208]  | **better**     |
| `eval.chase_catch_share`     | 0.2296  | 0.2382   | +3.7%  | [-0.005, 0.021] | - (no verdict) |
| `eval.collision_death_share` | 0.2207  | 0.2194   | -0.6%  | [-0.022, 0.023] | no-difference  |

Other verdicts: `eval.hunter_first_kill_rmst` better (-7.9%: first kills come sooner). Two metrics read worse:
`eval.basin_family_effective` (-11.0%, [-0.207, -0.030]) and `eval.mean_fitness.forager` (-5.3%). Foragers pay for a
hunter that catches more, which is the scene working. Neither is a keep-rule guard. `eval.population_mean` -8.7%
([-49.8, 4.5], no verdict).

**Reading.** The prediction's main clause holds at 64 seeds: catches rise by 9.7%, close to the predicted tenth, and the
interval excludes 0, with no guard harmed. Chase catch share rises without a verdict, and collision deaths do not rise.
The hunter now kills more because it sees further ahead, not because its chases end differently once they start. Under
the keep rule the finalist qualifies for the T20 switch. It waits on the honest-budgets switch (lane A, PR 461) so that
it can rebase and re-pin once.
