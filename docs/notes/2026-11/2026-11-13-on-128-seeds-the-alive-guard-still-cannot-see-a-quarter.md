### 2026-11-13 - On 128 seeds the alive guard still cannot see a quarter-seed loss (low-density-edge T15b, E166)

`flat` and `reach` read no keep-rule guard worse on seeds 65 to 128 and on the 128 matched seeds, but the `alive` guard
sees only a 41-seed (`flat`) and 45-seed (`reach`) loss there, against a quarter of 32; `held` and `under80` see 25 to 40.
128 is every seed `evals/seeds.json` holds, so a guard this rare in its discordant pairs cannot show no harm at the
quarter bar on any run the repo can make. Both land as realistic mechanisms with no guard worse and every point estimate
leaning better. The heat purpose guard runs on a scarce-food world (`foodRegrowPerArea` 0.003), so an arm that also sets
a food key voids it: `eat-1-food-24` was guarded on its heat key alone.
