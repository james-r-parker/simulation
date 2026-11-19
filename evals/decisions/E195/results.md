# E195 - champions-v1 with the E-TS-1c offset 0 champions against the live policy (training Phase 3 style trial, 16 seeds)

**Question.** Do champions from the training ladder, drawn instead of random brains by `champions-v1`, improve the live world's
food income without raising floor episodes? An experiment only: `LIVE_POLICY` is unchanged, nothing is published to
`public/champions/`, and the champions are a stalled ladder's (see the caveats).

**Prediction.** The plan's (training.md Phase 3, "Done when"): `champions-v1` is `better` on `eval.food_energy_per_1k` and on
`eval.food_energy_per_1k@20k`, and not `worse` on `eval.floor_episodes`. **Honest note: this prediction was not committed before the
run.** It was written afterwards from the plan's done line, so it is the plan's, not a pre-registered one, and the result is read
as a trial, not a verdict on the plan.

**Arms.** Before: `--policy live`. After: `--policy champions-v1 --policy-options {"championsDir": ".sim/champions/ets-1c-o0"}`.
Both 16 seeds x 200000 ticks, 8 workers, from `origin/main` 60b8a0d9 (before 1489 s, after 805 s; run on a shared machine, which
changes no result). The champions are `train:export` of `.sim/train/ladder-1c-o0/archive-119.json` (E-TS-1c offset 0: `hunt-weak`
passed, `hunt` stalled): 6 files (forager, predator x 2, reproducer, scout, defender). Its exam (E-TS-1c `exam-o0.txt`): row 1
Valid pass, row 3 Drill pass, row 8 Diverse **fail**, the others not run. Seeds are `evals/seeds.json` entries 1 to 16.

## Verdicts by script

`npm run eval:compare` on the two reports; the full table is `compare.txt`. A verdict needs the interval to exclude 0, a change of at
least 5% of the before mean, and a metric `verified` in the registry; the other rows print `unverified`, `-` or `needs N seeds`.

| Metric                              | live   | champions-v1 | Change          | Interval           | Script                    |
| ----------------------------------- | ------ | ------------ | --------------- | ------------------ | ------------------------- |
| `eval.food_energy_per_1k` (target)  | 426.5  | 483.6        | +57.2 (+13.4%)  | [-11.3, 101.7]     | no-difference             |
| `eval.food_energy_per_1k@20k`       | 399.8  | 372.8        | -26.9 (-6.7%)   | [-80.2, 39.3]      | unverified                |
| `eval.floor_episodes` (guard)       | 0.25   | 0.4375       | not read        | -                  | needs 32 seeds            |
| `eval.behaviour_coverage`           | 0.1788 | 0.2119       | +0.033 (+18.5%) | [0.0075, 0.0556]   | better                    |
| `eval.deliberate_food_share`        | 0.3843 | 0.4769       | +0.093 (+24.1%) | [0.0608, 0.1254]   | better                    |
| `eval.chase_turn_jitter`            | 0.2201 | 0.1993       | -0.021 (-9.4%)  | [-0.0387, -0.0061] | better                    |
| `eval.mean_fitness.defender`        | 1547   | 2036         | +489 (+31.6%)   | [280.7, 636.1]     | better                    |
| `eval.mean_fitness.reproducer`      | 1605   | 1887         | +282 (+17.5%)   | [109.4, 426.4]     | better                    |
| `eval.p90_fitness.defender`         | 4139   | 5328         | +1189 (+28.7%)  | [738.8, 1583]      | better                    |
| `eval.p90_fitness.reproducer`       | 4458   | 5059         | +601 (+13.5%)   | [231.1, 1018]      | better                    |
| `eval.bite_on_prey_view`            | 0.9904 | 0.9696       | -0.021 (-2.1%)  | [-0.0394, -0.0070] | **worse**                 |
| `eval.bite_idle` (directional)      | 0.6547 | 0.3400       | -0.315 (-48.1%) | [-0.399, -0.241]   | unverified                |
| `eval.predators_at_end` (dir.)      | 9.94   | 22.5         | +12.6 (+126%)   | [-2.6, 34.4]       | unverified                |
| `eval.hunter_juvenile_death_share`  | 0.8673 | 0.7428       | not read        | -                  | needs 32 seeds            |
| `eval.hunter_catches_per_1k` (dir.) | 1.385  | 0.8429       | not read        | -                  | needs 64 seeds            |
| `eval.population_mean`              | 190.2  | 166.6        | -23.6 (-12.4%)  | [-61.3, 10.5]      | no verdict (not verified) |

Counts on the 16 seeds: 7 rows `better`, 1 `worse` (`bite_on_prey_view`, a 2% change on a share at 0.99), 18 `no-difference`
(the rest of `compare.txt`), the others unread. The `unverified` rows and the `needs N seeds` rows are directions, not results.

## Verdict on the prediction

- `food_energy_per_1k` better: **not shown.** The point estimate is +13.4% but the interval spans 0 and the script says
  `no-difference`.
- `food_energy_per_1k@20k` better: **not shown, and the point estimate goes the other way** (-6.7%, interval spans 0,
  `unverified`).
- `floor_episodes` not worse: **undecided** (the script needs 32 seeds); the point estimate is 4 of 16 seeds before against 7 of 16
  after, so a worse direction on a number that this run cannot read.

So the plan's done line is not met by this champion set at 16 seeds. The 64-seed run (offset 64, `--keep-rule`) is
`CHAMP-v1-ets1c-64`; its result is below (keep rule WORSE on catches).

## What the other rows say (a lead, not a verdict)

The champions draw the hunters' blind biting down (`bite_idle` 0.65 to 0.34, unverified) and hold more predators at the end (22.5
against 9.9, interval spans 0), while `hunter_catches_per_1k` falls 1.385 to 0.843 and `bite_on_prey_view` is the one `worse`
verdict. Fewer idle bites with fewer catches and a higher `hunter_death_share.eaten` (0.13 to 0.32, `needs 32 seeds`) fits hunters
that bite less often and are bitten more: the champions are the stalled ladder's `hunt-weak` hunters (`prey-weak` wins 0 to 2 of 64
in E-TS-1c), not skilled ones. The `better` rows are fitness shares of the reproducers and defenders and behaviour coverage:
the live world's non-hunters gain from founders that start with a brain, not the hunt (a reading, not tested).

## 64 seeds with the keep rule (`CHAMP-v1-ets1c-64`)

Seeds 65 to 128 of `evals/seeds.json` (offset 64), 200000 ticks, the same two arms, `eval:compare --keep-rule`; the full table is
`compare-64.txt`.

| Metric                                                                                                                                                                 | live   | champions-v1 | Change          | Interval         | Script                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | --------------- | ---------------- | --------------------------- |
| `eval.food_energy_per_1k` (target)                                                                                                                                     | 411.5  | 462.9        | +51.4 (+12.5%)  | [26.0, 77.2]     | **better**                  |
| `eval.food_energy_per_1k@20k`                                                                                                                                          | 378.8  | 353.5        | -25.4 (-6.7%)   | [-50.0, -1.1]    | unverified, wrong direction |
| `eval.floor_episodes` (guard)                                                                                                                                          | 0.344  | 0.4375       | +0.094          | [-0.20, 0.33]    | unverified                  |
| `eval.hunter_catches_per_1k` (guard)                                                                                                                                   | 1.265  | 0.6965       | -0.569 (-44.9%) | [-0.682, -0.440] | **worse**                   |
| `eval.median_lifespan`                                                                                                                                                 | 3783   | 3249         | -534 (-14.1%)   | [-756, -339]     | worse                       |
| `eval.fed_median_lifespan`                                                                                                                                             | 4339   | 3612         | -728 (-16.8%)   | [-1015, -476]    | worse                       |
| `eval.diversity`                                                                                                                                                       | 0.0740 | 0.0628       | -15.1%          | [-0.017, -0.005] | worse                       |
| `eval.full_contact_bite_share`                                                                                                                                         | 0.0736 | 0.350        | +376%           | [0.220, 0.338]   | worse                       |
| `eval.hunter_first_kill_rmst`                                                                                                                                          | 1927   | 2362         | +22.6%          | [225, 636]       | worse                       |
| `eval.merit_mate_gain`                                                                                                                                                 | 0.2755 | 0.1732       | -37.1%          | [-0.130, -0.070] | worse                       |
| `eval.deliberate_food_share`                                                                                                                                           | 0.375  | 0.482        | +28.6%          | [0.085, 0.127]   | better                      |
| `eval.hunter_juvenile_death_share`                                                                                                                                     | 0.854  | 0.704        | -17.6%          | [-0.189, -0.111] | better                      |
| `eval.births_per_1k`, `lineages_alive`, `patch_leave_depleted`, `pursuit_kill_share`, `collision_death_share`, `qd_score`, every specialisation's mean and p90 fitness |        |              |                 |                  | better                      |
| `eval.bite_idle` (directional)                                                                                                                                         | 0.598  | 0.279        | -53.3%          | [-0.369, -0.263] | unverified                  |

Keep rule: guards `alive` (14 harmed, 17 recovered, p 0.72), `under80` (11 against 12, p 1) and `held` (4 against 3, p 1) read
no harm; the guard `eval.hunter_catches_per_1k` reads `worse` (-0.568, smallest loss detected 0.121); **keep rule: WORSE**.

**Verdict on the plan's done line (training.md Phase 3).** `food_energy_per_1k` better: **yes** (+12.5%, interval excludes 0).
`food_energy_per_1k@20k` better: **no** (-6.7%, the wrong way). `floor_episodes` not worse: unread (unverified). With the keep rule WORSE
on catches, `champions-v1` with these champions is **not adoptable** and `LIVE_POLICY` stays. This confirms the 16-seed read
(+13.4%, no-difference; the verdicts that were already clear keep their sign).

**What the catches fall means.** `eval.hunter_catches_per_1k` is kills per 1000 hunter agent-ticks (`js/evo/metrics-combat.js`), a rate
whose denominator is every tick a hunter lives, and the champions' hunters live longer: `hunter_median_lifespan` 1140 to 1764
(+55%), `hunter_death_share.starved` 0.74 to 0.63. The per-life readings do not fall: `hunter_kills_per_life_mean` 1.381 to 1.455
(+5.4%, interval [-0.011, 0.168]) and `_p50` 0.4375 to 0.4688. The kills per hunter-tick fall with age in both arms
(`hunter_kill_rate_by_age` juvenile 0.997 to 0.844, young 0.355 to 0.159, adult 0.190 to 0.021), so the same count of kills spread over
longer lives reads as a lower rate. **Do the live world's catches come mostly from bites with no prey in view? No.** A kill needs
prey in the jaws, so a blind bite cannot kill by itself; the sit-and-wait route is `eval.ambush_kill_share`, 0.0006 of caught approaches
in both arms, and the chased kills are `pursuit_kill_share` 0.69 (live) and 0.73 (champions-v1). The live world's catches come from
pursuits. So blind biting being cut does not remove catches directly. What it does: it removes the idle bites that
`bite_idle` counts (0.60 to 0.28), the hunters then live longer and their kill rate per tick falls. **Implication for the metric:**
`hunter_catches_per_1k` is confounded by hunter lifespan; a policy that makes hunters live longer on the same kills reads `worse`
on it. The E193 fall (-49%) may be the same effect (a closed bite at birth also cuts strikes at air, so hunters starve less); that
is a hypothesis, not checked here (E193's lifespans were not read). The guard stays as the keep rule defines it: not changed here.
A paired reading (`hunter_kills_per_life_mean`, which does not fall here) is the check to add beside it; proposed, not built.

## Pending (closed)

| Slot                                           | Run                 | Result                                              |
| ---------------------------------------------- | ------------------- | --------------------------------------------------- |
| 64 seeds (offset 64), `--keep-rule`, same arms | `CHAMP-v1-ets1c-64` | keep rule WORSE (catches); not adoptable, see above |

## What this run does and does not show

It shows `champions-v1` with these six champions is not a clear win on the plan's targets at 16 seeds and moves several hunter
reads (idle bite down, catches down) in the directions the keep rule would read. It does not show anything about a better champion
set (offset 0's `hunt` never passed; the exam row 8 fails), nor about a set trained to the target world. The 64-seed read says the same for this set: not adoptable.
