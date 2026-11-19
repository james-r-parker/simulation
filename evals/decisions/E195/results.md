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
`CHAMP-v1-ets1c-64`; its slot below is pending.

## What the other rows say (a lead, not a verdict)

The champions draw the hunters' blind biting down (`bite_idle` 0.65 to 0.34, unverified) and hold more predators at the end (22.5
against 9.9, interval spans 0), while `hunter_catches_per_1k` falls 1.385 to 0.843 and `bite_on_prey_view` is the one `worse`
verdict. Fewer idle bites with fewer catches and a higher `hunter_death_share.eaten` (0.13 to 0.32, `needs 32 seeds`) fits hunters
that bite less often and are bitten more: the champions are the stalled ladder's `hunt-weak` hunters (`prey-weak` wins 0 to 2 of 64
in E-TS-1c), not skilled ones. The `better` rows are fitness shares of the reproducers and defenders and behaviour coverage:
the live world's non-hunters gain from founders that start with a brain, not the hunt (a reading, not tested).

## Pending

| Slot                                           | Run                 | Result  |
| ---------------------------------------------- | ------------------- | ------- |
| 64 seeds (offset 64), `--keep-rule`, same arms | `CHAMP-v1-ets1c-64` | pending |

## What this run does and does not show

It shows `champions-v1` with these six champions is not a clear win on the plan's targets at 16 seeds and moves several hunter
reads (idle bite down, catches down) in the directions the keep rule would read. It does not show anything about a better champion
set (offset 0's `hunt` never passed; the exam row 8 fails), nor about the 64-seed verdicts, which are pending.
